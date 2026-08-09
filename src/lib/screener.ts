import type { Stock } from "./stocks";
import { SCREENER_PASS_THRESHOLD, SCREENER_THRESHOLDS } from "./screener-config";

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
