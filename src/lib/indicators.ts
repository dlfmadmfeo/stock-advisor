import type { DailyBar } from "./kis";

// ---------------------------------------------------------------------------
// 순수 계산 함수들. 실제 OHLCV 배열(오래된 날짜 → 최신 날짜 순)을 받아
// screener.ts가 쓰는 4개 지표(ma5over20 / volRatio / rsi)와 52주 고저를 계산합니다.
// ---------------------------------------------------------------------------

export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((sum, v) => sum + v, 0) / period;
}

// Wilder's smoothing 방식의 RSI(14)
export function rsi14(closes: number[]): number | null {
  const period = 14;
  if (closes.length < period + 1) return null;

  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 0; i < period; i++) {
    const change = changes[i];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  for (let i = period; i < changes.length; i++) {
    const change = changes[i];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return +(100 - 100 / (1 + rs)).toFixed(1);
}

export function volumeRatio(volumes: number[], period = 20): number | null {
  if (volumes.length < period + 1) return null;
  const today = volumes[volumes.length - 1];
  const avg = sma(volumes.slice(0, -1), period);
  if (!avg) return null;
  return +(today / avg).toFixed(2);
}

export function ma5over20(closes: number[]): boolean | null {
  const ma5 = sma(closes, 5);
  const ma20 = sma(closes, 20);
  if (ma5 === null || ma20 === null) return null;
  return ma5 > ma20;
}

// 지수이동평균의 "전체 시계열"을 반환합니다 (sma()는 마지막 한 값만 주는 것과
// 다름 — MACD는 매일의 EMA 값이 다 필요해서 시계열로 계산해야 함). 앞쪽
// period-1개는 아직 시드(SMA)가 안 채워진 구간이라 null.
function emaSeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return result;
  const k = 2 / (period + 1);
  const seed = sma(values.slice(0, period), period);
  if (seed === null) return result;
  result[period - 1] = seed;
  for (let i = period; i < values.length; i++) {
    const prev = result[i - 1] as number;
    result[i] = values[i] * k + prev * (1 - k);
  }
  return result;
}

export type MacdPoint = {
  date: string;
  close: number;
  macd: number;
  signal: number;
  histogram: number;
};

// MACD(12,26,9) — 가장 흔히 쓰는 기본 설정. EMA12에서 EMA26을 뺀 게
// MACD선, 그 MACD선의 EMA9가 시그널선, 둘의 차이가 히스토그램(모멘텀).
// bars는 오래된 날짜 -> 최신 날짜 순이어야 합니다.
export function computeMacdSeries(bars: DailyBar[]): MacdPoint[] {
  const closes = bars.map((b) => b.close);
  const emaFast = emaSeries(closes, 12);
  const emaSlow = emaSeries(closes, 26);
  const macdLine: (number | null)[] = closes.map((_, i) => {
    const fast = emaFast[i];
    const slow = emaSlow[i];
    return fast === null || slow === null ? null : fast - slow;
  });

  // 시그널선(=MACD선의 EMA9)은 MACD선 자체가 null이 아닌 구간부터만
  // 의미가 있어서, null을 뺀 값들만 따로 모아 EMA를 돌리고 원래 인덱스에
  // 다시 끼워 넣습니다.
  const firstValidIdx = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = new Array(closes.length).fill(null);
  if (firstValidIdx !== -1) {
    const macdOnly = macdLine.slice(firstValidIdx) as number[];
    const signalOnly = emaSeries(macdOnly, 9);
    for (let i = 0; i < signalOnly.length; i++) {
      signalLine[firstValidIdx + i] = signalOnly[i];
    }
  }

  const points: MacdPoint[] = [];
  for (let i = 0; i < bars.length; i++) {
    const macd = macdLine[i];
    const signal = signalLine[i];
    if (macd === null || signal === null) continue;
    points.push({
      date: bars[i].date,
      close: bars[i].close,
      macd: +macd.toFixed(1),
      signal: +signal.toFixed(1),
      histogram: +(macd - signal).toFixed(1),
    });
  }
  return points;
}

export type ScreenerInputs = {
  price: number;
  chg: number;
  ma5over20: boolean;
  volRatio: number;
  rsi: number;
  hi: number;
  lo: number;
};

// dailyBars: 최근 ~140일 일봉 (MA/거래량/RSI용), weeklyBars: 최근 ~52주 주봉 (52주 고저용)
export function computeScreenerInputs(dailyBars: DailyBar[], weeklyBars: DailyBar[]): ScreenerInputs | null {
  if (dailyBars.length < 21) return null;

  const closes = dailyBars.map((b) => b.close);
  const volumes = dailyBars.map((b) => b.volume);

  const golden = ma5over20(closes);
  const volRatioVal = volumeRatio(volumes);
  const rsiVal = rsi14(closes);
  if (golden === null || volRatioVal === null || rsiVal === null) return null;

  const latest = dailyBars[dailyBars.length - 1];
  const prevClose = dailyBars.length >= 2 ? dailyBars[dailyBars.length - 2].close : latest.close;
  const chg = prevClose ? +(((latest.close - prevClose) / prevClose) * 100).toFixed(1) : 0;

  const hiSource = weeklyBars.length ? weeklyBars : dailyBars;
  const loSource = hiSource;
  const hi = Math.max(...hiSource.map((b) => b.high));
  const lo = Math.min(...loSource.map((b) => b.low));

  return {
    price: Math.round(latest.close),
    chg,
    ma5over20: golden,
    volRatio: volRatioVal,
    rsi: rsiVal,
    hi: Math.round(hi),
    lo: Math.round(lo),
  };
}

// ---------------------------------------------------------------------------
// 급락-안정화(드롭 리버설) 신호 (2026-08-14 세션 추가).
//
// 기존 4개 지표는 "골든크로스 + 추세 확인" 계열이라 급락 직후 반등을 노리는
// 전략과는 반대 성격입니다(급락 직후엔 보통 MA5<MA20, RSI 과매도라 기존
// 스크리너를 통과 못 함). 그래서 완전히 별개의 판정 함수로 분리했습니다.
//
// 정의: 최근 lookbackDays 거래일 안에서
//   1) 고점(peak) 대비 저점(trough)까지 dropThresholdPct% 이상 하락(peak이
//      trough보다 먼저 나와야 "하락"으로 인정 — 순서 무관하게 최고/최저만
//      뽑으면 상승 구간을 하락으로 오인할 수 있어서 순서를 강제함).
//   2) 저점 이후 minDaysSinceTrough~maxDaysSinceTrough 거래일이 지남
//      (너무 이르면 "아직 하락 중"일 수 있고, 너무 늦으면 반등이 이미
//      끝났을 수 있어서 타이밍 창을 둠).
//   3) 저점 이후 신저점을 다시 갱신하지 않음(안정화 확인 — 여전히 떨어지고
//      있으면 후보에서 제외, noNewLowTolerancePct만큼의 노이즈는 허용).
//   4) 오늘 종가가 저점 대비 reboundToleranceFromTroughPct% 이내(이미 많이
//      올라버렸으면 "놓친 반등"이라 진입 매력이 떨어져서 제외).
//
// ⚠️ 뉴스/이벤트 원인은 전혀 안 봅니다 — 순수 가격 패턴으로만 "급락 후
// 안정화 구간"을 근사한 것이라, 실적 쇼크처럼 하락이 정당한(펀더멘털이
// 실제로 나빠진) 경우와 일시적 패닉/이벤트성 급락을 구분하지 못합니다.
// 그 구분은 백테스트로 검증 불가능한 영역이라 별도(뉴스 연동) 과제로 남겨둠.
// ---------------------------------------------------------------------------

export type DropReversalThresholds = {
  lookbackDays: number;
  dropThresholdPct: number;
  minDaysSinceTrough: number;
  maxDaysSinceTrough: number;
  reboundToleranceFromTroughPct: number;
  noNewLowTolerancePct: number;
};

export const DROP_REVERSAL_DEFAULTS: DropReversalThresholds = {
  lookbackDays: 20,
  dropThresholdPct: 10,
  minDaysSinceTrough: 2,
  maxDaysSinceTrough: 8,
  reboundToleranceFromTroughPct: 6,
  noNewLowTolerancePct: 1.5,
};

export type DropReversalSignal = {
  isCandidate: boolean;
  dropPct: number;
  daysSinceTrough: number;
  troughDate: string;
  peakDate: string;
};

export function detectDropReversal(
  bars: DailyBar[],
  opts: DropReversalThresholds = DROP_REVERSAL_DEFAULTS,
): DropReversalSignal | null {
  if (bars.length < opts.lookbackDays + 1) return null;
  const window = bars.slice(-opts.lookbackDays);

  let peakIdx = 0;
  for (let k = 1; k < window.length; k++) {
    if (window[k].close > window[peakIdx].close) peakIdx = k;
  }

  // 고점 이후 구간에서만 저점을 찾습니다 — 순서를 강제해야 "하락"이 성립.
  let troughIdx = -1;
  for (let k = peakIdx + 1; k < window.length; k++) {
    if (troughIdx === -1 || window[k].close < window[troughIdx].close) troughIdx = k;
  }
  if (troughIdx === -1) {
    return { isCandidate: false, dropPct: 0, daysSinceTrough: 0, troughDate: "", peakDate: window[peakIdx].date };
  }

  const peak = window[peakIdx].close;
  const trough = window[troughIdx].close;
  const dropPct = +(((peak - trough) / peak) * 100).toFixed(2);
  const daysSinceTrough = window.length - 1 - troughIdx;
  const todayClose = window[window.length - 1].close;

  const meetsDropThreshold = dropPct >= opts.dropThresholdPct;
  const withinTimingWindow =
    daysSinceTrough >= opts.minDaysSinceTrough && daysSinceTrough <= opts.maxDaysSinceTrough;
  const notAlreadyRallied = todayClose <= trough * (1 + opts.reboundToleranceFromTroughPct / 100);

  let madeNewLow = false;
  for (let k = troughIdx + 1; k < window.length; k++) {
    if (window[k].close < trough * (1 - opts.noNewLowTolerancePct / 100)) madeNewLow = true;
  }

  return {
    isCandidate: meetsDropThreshold && withinTimingWindow && notAlreadyRallied && !madeNewLow,
    dropPct,
    daysSinceTrough,
    troughDate: window[troughIdx].date,
    peakDate: window[peakIdx].date,
  };
}
