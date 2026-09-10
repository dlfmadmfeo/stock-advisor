// ---------------------------------------------------------------------------
// DART(전자공시시스템) Open API 클라이언트 (서버 전용).
//
// KIS와 달리 인증이 훨씬 단순합니다 — OAuth 토큰 발급/캐싱 없이, 발급받은
// 고정 키(crtfc_key)를 쿼리 파라미터로 그대로 붙이면 됩니다(만료/재발급
// 개념 자체가 없음). 요청 한도도 분당 1,000건/일 10,000건으로 넉넉해서
// kis.ts 같은 전역 rate limiter도 이번 범위에서는 안 둡니다.
//
// 종목별로 corp_code를 따로 조회하지 않습니다 — list.json 응답에 stock_code
// (6자리, 우리 DB의 ticker와 그대로 매칭)가 이미 포함돼 있어서, 코스피/코스닥
// 전체를 날짜 범위로 한 번에 받은 뒤 우리 쪽에서 관심종목 ticker와 매칭하면
// 됩니다. corp_code 매핑 파일(corpCode.xml) 다운로드가 필요 없어서 API 호출
// 자체도 훨씬 적게 듭니다.
//
// 필요 환경변수 (.env.local): DART_API_KEY
// ---------------------------------------------------------------------------

const BASE_URL = "https://opendart.fss.or.kr/api";
const API_KEY = process.env.DART_API_KEY;

export function dartConfigured(): boolean {
  return Boolean(API_KEY);
}

export type DartFiling = {
  rcept_no: string; // 접수번호(14자리) — 공시 하나당 고유, 중복 알림 방지 키로 씀
  corp_name: string;
  stock_code: string; // 6자리, 우리 DB ticker와 동일 형식
  report_nm: string; // 보고서명(정정/첨부 등 수식어 포함)
  flr_nm: string; // 제출인명
  rcept_dt: string; // 접수일자(yyyymmdd)
};

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

async function fetchListPage(
  corpCls: "Y" | "K",
  bgnDe: string,
  endDe: string,
  pageNo: number,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
  const url = new URL(`${BASE_URL}/list.json`);
  url.searchParams.set("crtfc_key", API_KEY as string);
  url.searchParams.set("bgn_de", bgnDe);
  url.searchParams.set("end_de", endDe);
  url.searchParams.set("corp_cls", corpCls);
  url.searchParams.set("page_no", String(pageNo));
  url.searchParams.set("page_count", "100");

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`DART API 호출 실패 (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json();
}

// corp_cls 하나(코스피 또는 코스닥) 전체를 페이지네이션으로 끝까지 받습니다.
// status "013"은 DART 문서상 "조회된 데이터가 없습니다"라 정상적인 빈 결과로
// 취급하고(그날 그 시장에 공시가 하나도 없을 수 있음), 그 외 에러 코드는
// 예외로 던집니다.
async function fetchAllPages(
  corpCls: "Y" | "K",
  bgnDe: string,
  endDe: string,
): Promise<DartFiling[]> {
  const rows: DartFiling[] = [];
  let pageNo = 1;
  for (;;) {
    const json = await fetchListPage(corpCls, bgnDe, endDe, pageNo);
    if (json.status === "013") break; // 데이터 없음
    if (json.status !== "000") {
      throw new Error(`DART API 에러 (${json.status}): ${json.message}`);
    }
    const list = Array.isArray(json.list) ? json.list : [];
    for (const r of list) {
      if (!r.stock_code || !String(r.stock_code).trim()) continue; // 비상장 등 종목코드 없는 공시는 제외
      rows.push({
        rcept_no: String(r.rcept_no ?? ""),
        corp_name: String(r.corp_name ?? ""),
        stock_code: String(r.stock_code ?? "").trim(),
        report_nm: String(r.report_nm ?? "").trim(),
        flr_nm: String(r.flr_nm ?? ""),
        rcept_dt: String(r.rcept_dt ?? ""),
      });
    }
    const totalPage = Number(json.total_page ?? 1);
    if (pageNo >= totalPage) break;
    pageNo += 1;
  }
  return rows;
}

// "중요 유형" 공시 판정 (2026-09-10 세션) — 관심종목 여부와 무관하게 전체
// 종목 대상으로 알림을 보내기로 하면서, 노이즈를 줄이려고 실적/자본변동/
// 자사주/배당/M&A/리스크 계열만 골라냅니다. report_nm은 DART가 코드값이
// 아니라 자유 텍스트로 내려주기 때문에(정정/첨부 등 수식어까지 붙어서
// 매번 형태가 조금씩 다름) 정확한 전체 문자열 매칭 대신 키워드 포함
// 여부로 판정합니다 — 기업설명회(IR)/최대주주등소유주식변동신고서/
// 증권발행실적보고서 같은 절차성·정보성 공시는 여기 안 걸려서 자동으로
// 제외됩니다.
const IMPORTANT_REPORT_KEYWORDS = [
  // 실적
  "분기보고서",
  "반기보고서",
  "사업보고서",
  "손익구조",
  // 자본 변동
  "유상증자결정",
  "무상증자결정",
  "전환사채권발행결정",
  "신주인수권부사채권발행결정",
  // 자사주
  "자기주식취득",
  "자기주식처분",
  // 배당
  "배당결정",
  // M&A/구조조정
  "합병결정",
  "분할결정",
  "영업양수결정",
  "영업양도결정",
  // 리스크
  "부도발생",
  "회생절차개시신청",
  "상장폐지",
  "소송등의제기",
  "최대주주변경",
] as const;

export function isImportantDisclosure(reportNm: string): boolean {
  return IMPORTANT_REPORT_KEYWORDS.some((k) => reportNm.includes(k));
}

// 오늘(한국시간 기준) 코스피+코스닥 전체 공시. 실패하면 kis.ts의 다른
// fetch* 함수들처럼 절대 throw하지 않고 null을 돌려줍니다 — 호출부(크론
// 라우트)가 매 실행마다 죽지 않고 다음 폴링에서 다시 시도하게.
export async function fetchTodayDisclosures(): Promise<DartFiling[] | null> {
  if (!API_KEY) return null;
  try {
    const today = yyyymmdd(new Date());
    const [kospi, kosdaq] = await Promise.all([
      fetchAllPages("Y", today, today),
      fetchAllPages("K", today, today),
    ]);
    return [...kospi, ...kosdaq];
  } catch (e) {
    console.error("[DART] 오늘 공시 조회 실패:", e instanceof Error ? e.message : e);
    return null;
  }
}
