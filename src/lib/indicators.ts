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
