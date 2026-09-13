import { prisma } from "@/lib/db";
import { fetchFinancials } from "@/lib/kis";
import { fetchStockNews } from "@/lib/naver-news";
import {
  getRecommendation,
  screenerChecks,
  sectorAveragePbr,
  sectorAveragePer,
} from "@/lib/screener";
import { askClaude, claudeConfigured } from "@/lib/claude";
import type { Stock } from "@/lib/stocks";

// ---------------------------------------------------------------------------
// AI 추천 탭(관리자 전용, 2026-09-13 세션)의 실제 분석 생성 로직.
//
// 이 기능의 핵심 아이디어: 스크리너(screener.ts)는 조건식 4개만 기계적으로
// 확인하고, 재무/뉴스는 화면 다른 곳에서 각자 따로 보여줘요 — 서로 다른
// 소스를 사람이 직접 머릿속에서 엮어야 했습니다. Claude에게 이 여러 소스
// (스크리너 조건, 재무 스냅샷, 최근 뉴스)를 한꺼번에 주고 "왜 이 신호들이
// 같이 나타났는지" 서술로 연결해달라고 하는 게 AI를 쓰는 이유예요 — 이미
// 계산된 사실을 재탕하는 게 아니라, 흩어진 사실들 사이의 관계를 설명하는
// 것.
//
// ⚠️ screener.ts 상단 주석 참고: 이 앱은 "매수/매도 판단"을 하지 않는다는
// 원칙을 지켜왔어요(자본시장법 유사투자자문업 이슈). AI 응답도 이 원칙을
// 그대로 지키게 시스템 프롬프트에서 강하게 못박습니다 — 점수/확신도/목표가를
// 지어내지 않고, 이미 공개된 사실들의 관계만 설명하게 함.
//
// 종목 하나당 재무(1회) + 뉴스(1회) KIS/네이버 호출이 필요해서, 비용/시간을
// 감안해 스크리너 통과 종목 중 상위 CANDIDATE_LIMIT개만 대상으로 합니다.
// 외국인/기관 수급(investor-trend)은 종목당 최대 20번 호출(8~9초)이라
// 이번 버전엔 넣지 않았어요 — 나중에 필요하면 추가.
// ---------------------------------------------------------------------------

const CANDIDATE_LIMIT = 8;
const CLAUDE_MODEL_LABEL = "claude-sonnet-5";

export type AiPick = {
  ticker: string;
  name: string;
  highlight: string;
  caution: string | null;
};

export type AiPickResult =
  | { ok: true; picks: AiPick[] }
  | { ok: false; message: string };

type StockRow = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  cap: string;
  per: number | null;
  pbr: number | null;
  hi: number;
  lo: number;
  ma5over20: boolean;
  volRatio: number;
  rsi: number;
  macdRebound: boolean;
  screenerOk: boolean;
  screenerScore: number;
  recommendationRank: number;
};

function toStock(row: StockRow): Stock {
  return {
    ticker: row.ticker,
    name: row.name,
    sector: row.sector,
    price: row.price,
    chg: row.chg,
    cap: row.cap,
    per: row.per ?? 0,
    pbr: row.pbr,
    hi: row.hi,
    lo: row.lo,
    ma5over20: row.ma5over20,
    volRatio: row.volRatio,
    rsi: row.rsi,
    macdRebound: row.macdRebound,
  };
}

const SYSTEM_PROMPT = `당신은 한국 주식 데이터를 요약하는 보조 도구입니다. 아래 원칙을 반드시 지키세요.

- "매수/매도/보유/지금 사세요/지금 파세요" 같은 지시형 결론을 절대 내리지 마세요.
- 점수, 확신도(%), 목표주가, 기대수익률처럼 실제로 계산되지 않은 값을 지어내지 마세요.
- 오직 주어진 데이터(스크리너 조건 충족 여부, 재무 스냅샷, 최근 뉴스 헤드라인)들 사이의
  관계를 사실에 기반해 설명하세요. 예: "이동평균·거래량 조건이 동시에 충족됐고, 최근
  영업이익 증가율도 플러스로 전환됐어요" 처럼 서로 다른 데이터를 연결해서 설명하되,
  주어지지 않은 사실을 추측해서 덧붙이지 마세요.
- 뉴스 sentiment 라벨은 단순 키워드 매칭이라 부정확할 수 있다는 점을 감안해서,
  단정적으로 인용하지 말고 참고 정도로만 쓰세요.
- 반대되는 근거(재무 악화, 부채비율 상승, 부정적 뉴스, 밸류에이션 부담 등)가 데이터에
  있으면 caution에 사실 그대로 적으세요. 없으면 caution은 null로 두세요.
- highlight/caution 모두 2문장 이내, 한국어 존댓말로 작성하세요.
- 반드시 JSON 배열만 출력하세요. 코드블록 표시(\`\`\`)나 다른 설명 텍스트는 절대 포함하지 마세요.

출력 형식 (배열 안 각 항목):
{"ticker": "005930", "highlight": "...", "caution": "..." 또는 null}`;

export async function generateAiPicks(): Promise<AiPickResult> {
  if (!claudeConfigured()) {
    return { ok: false, message: "ANTHROPIC_API_KEY가 설정되어 있지 않아요 (.env.local 확인)." };
  }

  const rows = await prisma.stock.findMany();
  if (rows.length === 0) {
    return { ok: false, message: "저장된 종목 유니버스가 없어요. 먼저 유니버스를 새로고침해주세요." };
  }

  const all = rows.map(toStock);
  const sectorAvgPer = sectorAveragePer(all);
  const sectorAvgPbr = sectorAveragePbr(all);

  const candidateRows = rows
    .filter((r) => r.screenerOk)
    .sort(
      (a, b) =>
        b.recommendationRank - a.recommendationRank || b.screenerScore - a.screenerScore,
    )
    .slice(0, CANDIDATE_LIMIT);

  if (candidateRows.length === 0) {
    return { ok: false, message: "지금 스크리너를 통과한 종목이 없어요." };
  }

  const candidates = candidateRows.map(toStock);

  const details = await Promise.all(
    candidates.map(async (s) => {
      const checks = screenerChecks(s);
      const rec = getRecommendation(s, sectorAvgPer[s.sector], sectorAvgPbr[s.sector]);
      const [financials, news] = await Promise.all([
        fetchFinancials(s.ticker).catch(() => null),
        fetchStockNews(s.name, 5).catch(() => null),
      ]);
      const latestFinancial = financials?.[0] ?? null;

      return {
        ticker: s.ticker,
        name: s.name,
        sector: s.sector,
        price: s.price,
        changePct: s.chg,
        screenerLabel: rec.label,
        screenerReason: rec.reason,
        screenerChecks: checks.map((c) => ({ label: c.label, pass: c.pass })),
        financialSnapshot: latestFinancial
          ? {
              year: latestFinancial.year,
              revenueGrowthPct: latestFinancial.revenueGrowthPct,
              opGrowthPct: latestFinancial.opGrowthPct,
              netIncomeGrowthPct: latestFinancial.netIncomeGrowthPct,
              roe: latestFinancial.roe,
              debtRatio: latestFinancial.debtRatio,
            }
          : null,
        recentNews: (news ?? []).slice(0, 5).map((n) => ({
          title: n.title,
          sentiment: n.sentiment,
        })),
      };
    }),
  );

  const userPrompt = `다음은 국내 주식 스크리너를 통과한 종목 ${details.length}개의 데이터입니다. 각 종목마다 highlight와 caution을 작성하세요.\n\n${JSON.stringify(details, null, 2)}`;

  const raw = await askClaude(SYSTEM_PROMPT, userPrompt);
  if (!raw) {
    return { ok: false, message: "Claude 응답을 받지 못했어요. 잠시 후 다시 시도해주세요." };
  }

  try {
    const jsonText = raw.trim().replace(/^```json\s*|```\s*$/g, "");
    const parsed = JSON.parse(jsonText) as Array<{
      ticker: string;
      highlight: string;
      caution: string | null;
    }>;

    const picks: AiPick[] = parsed
      .map((p) => {
        const stock = candidates.find((c) => c.ticker === p.ticker);
        if (!stock) return null;
        return {
          ticker: p.ticker,
          name: stock.name,
          highlight: p.highlight,
          caution: p.caution ?? null,
        };
      })
      .filter((p): p is AiPick => p !== null);

    if (picks.length === 0) {
      return { ok: false, message: "AI 응답에서 유효한 종목을 찾지 못했어요." };
    }

    return { ok: true, picks };
  } catch {
    return { ok: false, message: "AI 응답을 해석하지 못했어요." };
  }
}

export const AI_PICK_MODEL_LABEL = CLAUDE_MODEL_LABEL;
