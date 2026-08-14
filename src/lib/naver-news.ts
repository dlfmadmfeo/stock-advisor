// ---------------------------------------------------------------------------
// 네이버 뉴스 검색 API 클라이언트 (서버 전용, 2026-08-14 세션 추가).
//
// 종목명으로 최근 뉴스를 검색해서 화면에 보여주는 용도입니다. 알고리즘(매수/매도
// 판정)에는 아직 연결하지 않았어요 — 키워드 태깅은 정확도가 낮아서(진짜 감성분석이
// 아니라 단순 단어 포함 여부) 신호로 쓰기엔 위험하고, 일단 참고 정보로 노출해서
// 사람이 직접 판단하는 데 도움을 주는 용도로만 씁니다.
//
// ⚠️ 처음엔 developers.naver.com의 옛날 "오픈API"(openapi.naver.com,
// X-Naver-Client-Id/Secret 헤더) 기준으로 짰다가, 준희님이 실제 발급받은 키가
// NAVER Cloud Platform의 "API GATEWAY(API HUB)" 상품이라는 걸 확인해서(401
// NID AUTH Result Invalid로 계속 실패 → curl로 직접 검증해서 발견) 이 상품
// 기준으로 다시 씀. 응답 바디 필드(title/originallink/link/description/pubDate)는
// 동일해서 파싱 로직은 그대로 재사용 가능했음.
//
// 필요 환경변수 (.env.local):
//   NCP_APIGW_API_KEY_ID, NCP_APIGW_API_KEY
//   (console.ncloud.com → API Gateway → API HUB → "검색-뉴스" 상품 신청하면 발급)
//
// 참고 문서: https://api.ncloud-docs.com/docs/naver-api-hub-search-news
// ---------------------------------------------------------------------------

const API_KEY_ID = process.env.NCP_APIGW_API_KEY_ID;
const API_KEY = process.env.NCP_APIGW_API_KEY;

export function naverNewsConfigured(): boolean {
  return Boolean(API_KEY_ID && API_KEY);
}

export type NewsSentiment = "positive" | "negative" | "neutral";
export type NewsEventType = "실적" | "공시" | "소송/제재" | "산업/업종" | "거시경제" | "기타";

export type NewsArticle = {
  title: string;
  description: string;
  link: string;
  pubDate: string; // 네이버가 주는 원본 포맷(RFC 822) 그대로 — 화면에서 필요하면 파싱
  sentiment: NewsSentiment;
  eventType: NewsEventType;
};

type RawNaverNewsItem = {
  title: string;
  originallink: string;
  link: string;
  description: string;
  pubDate: string;
};

type RawNaverNewsResponse = {
  items: RawNaverNewsItem[];
};

// 네이버 API는 <b>강조</b> 태그를 붙여서 주고 &quot; 같은 엔티티도 그대로 옵니다.
// 화면/태깅 둘 다에서 순수 텍스트가 필요해서 제거합니다.
function stripHtml(text: string): string {
  return text
    .replace(/<\/?b>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'");
}

// ---------------------------------------------------------------------------
// 키워드 규칙 기반 태깅 (1차 버전). 진짜 감성분석이 아니라 단순 단어 포함
// 여부라서 정확도가 낮습니다 — 예를 들어 "적자 축소"는 긍정적인 뉴스인데
// "적자"라는 단어 때문에 부정으로 잘못 분류될 수 있어요. 참고용 배지로만
// 쓰고, 최종 판단은 기사를 직접 읽고 하도록 화면에 안내 문구를 같이 둡니다.
// ---------------------------------------------------------------------------
const POSITIVE_KEYWORDS = [
  "상승", "호실적", "실적 개선", "어닝서프라이즈", "깜짝 실적", "수주", "신고가",
  "매수 우위", "목표주가 상향", "흑자전환", "호조", "역대 최대", "급등", "강세",
];

const NEGATIVE_KEYWORDS = [
  "하락", "급락", "적자", "실적 부진", "어닝쇼크", "쇼크", "소송", "리콜",
  "횡령", "배임", "감사의견 거절", "상장폐지", "목표주가 하향", "구조조정",
  "감원", "과징금", "제재", "약세", "부진",
];

const EVENT_KEYWORDS: Record<Exclude<NewsEventType, "기타">, string[]> = {
  실적: ["실적", "매출", "영업이익", "어닝", "분기보고서"],
  공시: ["공시", "정정", "유상증자", "무상증자", "자사주", "배당"],
  "소송/제재": ["소송", "제재", "과징금", "검찰", "수사", "횡령", "배임", "조사"],
  "산업/업종": ["업종", "산업", "경쟁사", "점유율", "밸류체인", "공급망"],
  거시경제: ["금리", "환율", "물가", "연준", "한국은행", "무역수지", "관세"],
};

function classify(text: string): { sentiment: NewsSentiment; eventType: NewsEventType } {
  const hasPositive = POSITIVE_KEYWORDS.some((k) => text.includes(k));
  const hasNegative = NEGATIVE_KEYWORDS.some((k) => text.includes(k));
  // 둘 다 걸리거나 둘 다 안 걸리면 판단을 강요하지 않고 중립으로 둡니다
  // (모호한 걸 억지로 긍정/부정으로 가르면 배지가 오히려 오해를 일으켜요).
  let sentiment: NewsSentiment = "neutral";
  if (hasPositive && !hasNegative) sentiment = "positive";
  else if (hasNegative && !hasPositive) sentiment = "negative";

  let eventType: NewsEventType = "기타";
  for (const [type, keywords] of Object.entries(EVENT_KEYWORDS) as [
    Exclude<NewsEventType, "기타">,
    string[],
  ][]) {
    if (keywords.some((k) => text.includes(k))) {
      eventType = type;
      break;
    }
  }

  return { sentiment, eventType };
}

async function callNaverNewsApi(query: string, display: number): Promise<RawNaverNewsResponse> {
  const url = `https://naverapihub.apigw.ntruss.com/search/v1/news?query=${encodeURIComponent(query)}&display=${display}&start=1&sort=date&format=json`;
  const res = await fetch(url, {
    headers: {
      "X-NCP-APIGW-API-KEY-ID": API_KEY_ID ?? "",
      "X-NCP-APIGW-API-KEY": API_KEY ?? "",
    },
    // 뉴스는 계속 갱신되는 데이터라 캐싱하지 않습니다.
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`네이버 뉴스 API 오류: ${res.status} ${body}`);
  }
  return res.json() as Promise<RawNaverNewsResponse>;
}

// query는 보통 종목명("삼성전자")을 씁니다. 티커(005930)로 검색하면 관련
// 기사가 거의 안 잡혀서(네이버 뉴스 검색은 종목코드보다 회사명 기준) 종목명을
// 넘기세요.
export async function fetchStockNews(query: string, display = 8): Promise<NewsArticle[] | null> {
  if (!naverNewsConfigured()) return null;
  try {
    const data = await callNaverNewsApi(query, display);
    return data.items.map((item) => {
      const title = stripHtml(item.title);
      const description = stripHtml(item.description);
      const { sentiment, eventType } = classify(`${title} ${description}`);
      return {
        title,
        description,
        link: item.link || item.originallink,
        pubDate: item.pubDate,
        sentiment,
        eventType,
      };
    });
  } catch (e) {
    console.error(`[네이버 뉴스] "${query}" 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}
