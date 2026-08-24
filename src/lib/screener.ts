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

export function screenerChecks(s: Stock): ScreenerRule[] {
  const t = SCREENER_THRESHOLDS;
  const recovered = s.price >= s.lo * t.reboundFromLowRatio || s.price >= s.hi * t.reboundFromHighRatio;
  return [
    { label: "5일 이동평균이 20일 이동평균 위 (골든크로스 상태)", pass: s.ma5over20 },
    {
      label: `거래량이 최근 20일 평균 대비 ${Math.round(t.volumeRatioMin * 100)}% 이상`,
      pass: s.volRatio >= t.volumeRatioMin,
    },
    {
      label: `52주 저점 대비 +${Math.round((t.reboundFromLowRatio - 1) * 100)}% 이상 반등, 또는 52주 고점 대비 -${Math.round((1 - t.reboundFromHighRatio) * 100)}% 이내`,
      pass: recovered,
    },
    {
      label: `RSI(14) ${t.rsiMin}~${t.rsiMax} 구간 (과매수·과매도 아님)`,
      pass: s.rsi >= t.rsiMin && s.rsi <= t.rsiMax,
    },
  ];
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
// 조건 충족 판정: 4개 스크리너 조건식 + (있으면) 업종 대비 PER/PBR 상대
// 밸류에이션만 조합한 규칙 기반 판정입니다. 실적·재무 데이터 심층 분석·
// 백테스트·AI 판단이 들어가지 않으므로 투자 자문이 아니고, "지금 이 조건들이
// 이런 상태다"를 요약해서 보여주는 용도예요.
//
// 2026-08-23 세션: 화면에 보이는 라벨(label)을 "강한 매수/매수/보유/매도"
// 에서 "완전충족/조건충족/보류/주의"로 바꿨습니다(4단계 구조는 유지, 문구만
// 교체). 자본시장법상 유사투자자문업은 "지표를 종합해서 매수/매도하라는
// 결론(판단)을 내리는 것"을 규제 대상으로 보는데, "매수/매도"라는 결론형
// 라벨이 정확히 그거였어요. 반면 "조건을 몇 개 충족했는지"는 공개 데이터를
// 기계적으로 계산한 사실(fact)이라 판단이 아니고, 그 사실을 보고 사고 팔지는
// 사용자가 스스로 결정하는 구조예요. "주의" 라벨은 임의로 지어낸 완곡어가
// 아니라, 한국거래소(KRX)가 이미 "투자주의/투자경고/투자위험" 종목처럼
// 공개 지표 기준으로 기계적으로 매기는 공식 등급 체계에서 쓰는 용어라
// "판단"이 아니라 "상태 표시"로 인정받는 선례가 있어서 그대로 가져왔어요.
// signal/strength 타입 값(buy/sell/hold, strong/normal) 자체는 안 바꿨는데,
// backtest.ts가 이 값들로 "강한 신호만 진입" 같은 내부 계산을 하고 있어서
// (화면에 뭐라고 표시되는지와 무관하게) 그 로직까지 건드리면 백테스트 결과가
// 달라질 수 있기 때문입니다 — 라벨 문구만 바꾸고 판정 로직/타입은 그대로.
//
//   - 완전충족 (구 강한 매수, strength: "strong"): 4개 지표를 전부 충족 +
//     RSI 과매수 아님 + 고평가 아님
//   - 조건충족 (구 매수, strength: "normal"): 3개만 충족했지만 RSI 과매수
//     아님 + 고평가 아님 + 업종 대비 저평가까지 확인된 경우
//   - 보류 (구 보유): 위 어디에도 안 걸리는 애매한 경우 — 조건은 일부
//     충족했는데 저평가 확인이 안 되거나(밸류에이션 데이터 없음/안 쌈)
//     RSI 과매도라 좀 더 지켜봐야 하는 경우
//   - 주의 (구 매도): 하락 추세(5일선이 20일선 아래)인 상태에서 RSI
//     과매수거나, 4개 중 1개 이하만 충족(추세가 매우 약함), 또는 고평가인데
//     추세까지 꺾인 경우
//
// PER/PBR이 둘 다 없는 종목(예: 적자 기업, 데이터 미확보)은 밸류에이션
// 판단을 아예 못 하는데, 이 경우도 "고평가 아님"으로 조용히 넘어가지 않게
// reason 문구에 명시적으로 표시합니다(valuationAvailable 필드 참고).
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
