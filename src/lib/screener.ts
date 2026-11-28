import type { Stock } from "./stocks";
import {
  SCREENER_PASS_THRESHOLD,
  SCREENER_THRESHOLDS,
  SCREENER_TOTAL_RULES,
} from "./screener-config";

// ---------------------------------------------------------------------------
// 스크리너: 공개된 규칙을 기계적으로 적용합니다. "AI 판단"이 아니라 조건식
// 결과이며, 매수/매도 추천이 아닙니다. 임계값은 screener-config.ts에서 관리합니다.
// ---------------------------------------------------------------------------

export type ScreenerRule = {
  label: string;
  pass: boolean;
};

// 규칙 문구는 한 곳에서 만들어서, 종목 상세의 충족 현황(screenerChecks)과
// 홈의 "스크리너 기준" 안내가 항상 같은 문장을 쓰게 합니다. 순서와 개수는
// screenerChecks가 반환하는 배열과 같아야 해요(SCREENER_TOTAL_RULES).
const t = SCREENER_THRESHOLDS;
export const SCREENER_RULE_LABELS: readonly string[] = [
  "5일 이동평균이 20일 이동평균 위 (골든크로스 상태)",
  `거래량이 최근 20일 평균 대비 ${Math.round(t.volumeRatioMin * 100)}% 이상`,
  `52주 저점 대비 +${Math.round((t.reboundFromLowRatio - 1) * 100)}% 이상 반등, 또는 52주 고점 대비 -${Math.round((1 - t.reboundFromHighRatio) * 100)}% 이내`,
  `RSI(14) ${t.rsiMin}~${t.rsiMax} 구간 (과매수·과매도 아님)`,
];

export function screenerChecks(s: Stock): ScreenerRule[] {
  const recovered = s.price >= s.lo * t.reboundFromLowRatio || s.price >= s.hi * t.reboundFromHighRatio;
  const passes = [
    s.ma5over20,
    s.volRatio >= t.volumeRatioMin,
    recovered,
    s.rsi >= t.rsiMin && s.rsi <= t.rsiMax,
  ];
  return SCREENER_RULE_LABELS.map((label, i) => ({ label, pass: passes[i] }));
}

export function screenerScore(s: Stock): number {
  return screenerChecks(s).filter((r) => r.pass).length;
}

export function passesScreener(s: Stock): boolean {
  return screenerScore(s) >= SCREENER_PASS_THRESHOLD;
}

// ---------------------------------------------------------------------------
// 업종 평균 PER/PBR: 같은 업종 종목들의 값을 평균내서, 개별 종목이 업종 대비
// 싼지 비싼지 상대 비교하는 용도로 씁니다. 0 이하(적자 등 의미 없는 값)는
// 평균 계산에서 제외해요. 절대적인 "저평가/고평가" 판단이 아니라 지금 로드된
// 유니버스 안에서의 상대 위치일 뿐입니다.
// ---------------------------------------------------------------------------
function sectorAverage(stocks: Stock[], pick: (s: Stock) => number | null | undefined): Record<string, number> {
  const sums: Record<string, { total: number; count: number }> = {};
  for (const s of stocks) {
    const v = pick(s);
    if (!(typeof v === "number" && v > 0)) continue;
    const bucket = (sums[s.sector] ??= { total: 0, count: 0 });
    bucket.total += v;
    bucket.count += 1;
  }
  const result: Record<string, number> = {};
  for (const [sector, { total, count }] of Object.entries(sums)) {
    if (count > 0) result[sector] = total / count;
  }
  return result;
}

export function sectorAveragePer(stocks: Stock[]): Record<string, number> {
  return sectorAverage(stocks, (s) => s.per);
}

export function sectorAveragePbr(stocks: Stock[]): Record<string, number> {
  return sectorAverage(stocks, (s) => s.pbr);
}

// 업종 평균 대비 PER/PBR을 각각 비교해서, 둘 중 하나라도 크게 높으면
// "고평가", 둘 다 값이 있고 크게 낮으면 "저평가"로 봅니다. (보수적으로 잡되,
// PBR 데이터가 아직 없는 종목도 많을 수 있어서 PER만 있어도 판단은 동작해요.)
type Valuation = {
  overvalued: boolean;
  undervalued: boolean;
  detail: string | null;
};

function evaluateValuation(
  s: Stock,
  t: typeof SCREENER_THRESHOLDS,
  sectorAvgPer?: number,
  sectorAvgPbr?: number,
): Valuation {
  const perOver = s.per > 0 && !!sectorAvgPer && sectorAvgPer > 0 && s.per >= sectorAvgPer * t.perOvervaluedRatio;
  const perUnder = s.per > 0 && !!sectorAvgPer && sectorAvgPer > 0 && s.per <= sectorAvgPer * t.perUndervaluedRatio;
  const pbrOver = !!s.pbr && s.pbr > 0 && !!sectorAvgPbr && sectorAvgPbr > 0 && s.pbr >= sectorAvgPbr * t.pbrOvervaluedRatio;
  const pbrUnder = !!s.pbr && s.pbr > 0 && !!sectorAvgPbr && sectorAvgPbr > 0 && s.pbr <= sectorAvgPbr * t.pbrUndervaluedRatio;

  let detail: string | null = null;
  if (perOver && pbrOver) {
    detail = `PER(${s.per})·PBR(${s.pbr})이 둘 다 업종 평균(PER ${sectorAvgPer?.toFixed(1)} / PBR ${sectorAvgPbr?.toFixed(1)}) 대비 많이 높아요.`;
  } else if (perOver) {
    detail = `PER(${s.per})이 업종 평균(${sectorAvgPer?.toFixed(1)}) 대비 많이 높아요.`;
  } else if (pbrOver) {
    detail = `PBR(${s.pbr})이 업종 평균(${sectorAvgPbr?.toFixed(1)}) 대비 많이 높아요.`;
  } else if (perUnder && pbrUnder) {
    detail = `PER(${s.per})·PBR(${s.pbr})이 둘 다 업종 평균 대비 낮은 편이에요.`;
  } else if (perUnder) {
    detail = `PER(${s.per})이 업종 평균(${sectorAvgPer?.toFixed(1)}) 대비 낮은 편이에요.`;
  } else if (pbrUnder) {
    detail = `PBR(${s.pbr})이 업종 평균(${sectorAvgPbr?.toFixed(1)}) 대비 낮은 편이에요.`;
  }

  return { overvalued: perOver || pbrOver, undervalued: perUnder || pbrUnder, detail };
}

function hasValuationData(s: Stock): boolean {
  return s.per > 0 || !!(s.pbr && s.pbr > 0);
}

// ---------------------------------------------------------------------------
// 조건 충족 판정: 4개 스크리너 조건식과 (있으면) 업종 대비 PER/PBR 상대
// 밸류에이션을 조합한 규칙 기반 판정. 투자 판단이 아니라 현재 조건 상태를 요약한다.
//
// 화면 라벨은 매수/매도 같은 결론형 표현 대신 "완전충족/조건충족/보류/주의"를 쓴다
// (유사투자자문 소지를 피하기 위함, "주의"는 KRX 투자주의 등급 용어). 내부
// signal/strength 값(buy/sell/hold, strong/normal)은 backtest.ts가 사용하므로 유지한다.
//
//   - 완전충족 (strength: "strong"): 4개 지표 모두 충족 + RSI 과매수 아님 + 고평가 아님
//   - 조건충족 (strength: "normal"): 3개 충족 + RSI 과매수 아님 + 고평가 아님 +
//     업종 대비 저평가 확인
//   - 보류: 일부 충족했지만 저평가 확인이 안 되거나(데이터 없음 포함) RSI 과매도인 경우
//   - 주의: 하락 추세(5일선 < 20일선)에서 RSI 과매수, 1개 이하 충족, 또는 고평가인데
//     추세까지 꺾인 경우
//
// PER/PBR이 모두 없는 종목은 "고평가 아님"으로 넘기지 않고 reason에 명시한다
// (valuationAvailable 참고).
// ---------------------------------------------------------------------------

export type RecommendationSignal = "buy" | "sell" | "hold";
export type RecommendationStrength = "strong" | "normal" | null;

export type Recommendation = {
  signal: RecommendationSignal;
  strength: RecommendationStrength;
  label: string;
  reason: string;
  valuationAvailable: boolean;
};

export function getRecommendation(
  s: Stock,
  sectorAvgPer?: number,
  sectorAvgPbr?: number,
): Recommendation {
  const t = SCREENER_THRESHOLDS;
  const score = screenerScore(s);
  const overbought = s.rsi > t.rsiMax;
  const oversold = s.rsi < t.rsiMin;
  const downtrend = !s.ma5over20;
  const valuationAvailable = hasValuationData(s);
  const valuationNote = valuationAvailable
    ? ""
    : " (PER·PBR 데이터가 없어 밸류에이션은 확인 못 했어요.)";

  const { overvalued, undervalued, detail } = evaluateValuation(s, t, sectorAvgPer, sectorAvgPbr);

  if (downtrend && (overbought || score <= 1 || overvalued)) {
    return {
      signal: "sell",
      strength: null,
      label: "주의",
      reason:
        (overbought
          ? "5일선이 20일선 아래(하락 추세)인데 RSI는 과매수 구간이라 되돌림 위험이 있어요."
          : overvalued && detail
            ? `하락 추세인데 ${detail}`
            : `공개 지표 ${SCREENER_TOTAL_RULES}개 중 ${score}개만 충족해 추세가 약해요.`) + valuationNote,
      valuationAvailable,
    };
  }

  const fullScore = score >= SCREENER_TOTAL_RULES;
  const passScore = score >= SCREENER_PASS_THRESHOLD;

  if (fullScore && !overbought && !overvalued) {
    return {
      signal: "buy",
      strength: "strong",
      label: "완전충족",
      reason:
        (undervalued && detail
          ? `공개 지표 ${SCREENER_TOTAL_RULES}개를 전부 충족했고, ${detail}`
          : `공개 지표 ${SCREENER_TOTAL_RULES}개를 전부 충족했고 RSI도 과매수 구간이 아니에요.`) + valuationNote,
      valuationAvailable,
    };
  }

  if (passScore && !overbought && !overvalued && undervalued) {
    return {
      signal: "buy",
      strength: "normal",
      label: "조건충족",
      reason: `공개 지표 ${SCREENER_TOTAL_RULES}개 중 ${score}개만 충족했지만, ${detail}`,
      valuationAvailable,
    };
  }

  const holdReason = oversold
    ? "RSI가 과매도 구간이라 반등 여부를 좀 더 지켜볼 필요가 있어요."
    : overvalued && detail
      ? `조건은 일부 충족했지만 ${detail} 조건충족으로 보기엔 부담스러워요.`
      : passScore && !valuationAvailable
        ? `공개 지표 ${SCREENER_TOTAL_RULES}개 중 ${score}개를 충족했지만, 4개 전부는 아니고 PER·PBR 데이터도 없어서 밸류에이션(저평가 여부) 확인이 더 필요해요.`
        : passScore
          ? `공개 지표 ${SCREENER_TOTAL_RULES}개 중 ${score}개를 충족했지만, 업종 평균 대비 뚜렷하게 저평가는 아니라서 조건충족으로 올리진 않았어요.`
          : `공개 지표 ${SCREENER_TOTAL_RULES}개 중 ${score}개를 충족해 추세가 뚜렷하지 않아요.`;

  return {
    signal: "hold",
    strength: null,
    label: "보류",
    reason: holdReason,
    valuationAvailable,
  };
}
