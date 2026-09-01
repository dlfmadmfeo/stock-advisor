import type { DailyBar } from "./kis";
import { computeScreenerInputs, detectDropReversal, sma } from "./indicators";
import { getRecommendation, type RecommendationStrength } from "./screener";
import type { Stock } from "./stocks";

// ---------------------------------------------------------------------------
// 백테스트 엔진 (1차 버전).
//
// 규칙: getRecommendation()이 "매수"라고 판정한 날 종가에 진입했다고 가정하고,
// holdDays 거래일 뒤 종가에 청산했다고 가정했을 때의 수익률을 계산합니다.
// getRecommendation을 그대로 재사용하는 이유는, 실제 화면에서 "매수"로 보여주는
// 로직이랑 백테스트가 검증하는 로직이 어긋나지 않게 하기 위해서예요(로직이
// 두 군데로 갈라지면 나중에 화면 로직만 바꾸고 백테스트는 옛날 기준으로 도는
// 사고가 나기 쉬움).
//
// ⚠️ 1차 범위: PER/PBR 업종 상대 밸류에이션은 뺐습니다. 과거 특정 날짜 시점의
// PER/PBR을 구하려면 그 시점의 시가총액·순이익·순자산이 다 필요한데, 지금
// 갖고 있는 건 "지금 시점"의 PER/PBR뿐이라 과거로 끌어다 쓰면 미래 데이터를
// 과거에 쓰는 룩어헤드 편향이 생겨요. 그래서 getRecommendation을
// sectorAvgPer/sectorAvgPbr 없이 호출합니다 — 이 경우 내부적으로 밸류에이션
// 조건은 자동으로 꺼지고 4개 기술 지표만으로 판정됩니다.
//
// 룩어헤드 방지: 매일 시점의 지표는 "그날까지의 봉만" 잘라서 계산합니다
// (dailyBars.slice(0, i + 1)). 그날 이후 데이터를 지표 계산에 절대 안 씁니다.
// ---------------------------------------------------------------------------

export type ExitReason = "take_profit" | "stop_loss" | "time";

export type BacktestTrade = {
  date: string;
  entryPrice: number;
  exitDate: string;
  exitPrice: number;
  returnPct: number;
  exitReason: ExitReason;
  holdDaysActual: number; // 익절/손절로 조기 청산되면 holdDays보다 작을 수 있음
  strength: RecommendationStrength; // "강한 매수"(4/4)인지 "매수"(3/4+저평가)인지
};

export type BacktestOptions = {
  holdDays?: number; // 익절/손절에 안 걸리면 최대 이만큼 들고 있다가 청산 (기본 10)
  // 진입가 대비 이 비율(%) 도달 시 그날 즉시 익절/손절. null이면 해당 조건 비활성화
  // (예: takeProfitPct=3, stopLossPct=-2 → +3% 닿으면 익절, -2% 닿으면 손절).
  // 같은 날 둘 다 닿을 수 있는 경우(변동성 큰 날) 보수적으로 손절을 먼저 체크합니다.
  takeProfitPct?: number | null;
  stopLossPct?: number | null;
  // ⚠️ 아래 4개는 2026-08-14 세션에서 승률 개선 실험용으로 추가한 옵션입니다.
  // 전부 기본 꺼짐(기존 동작과 동일) — CLI에서 명시적으로 켜야 합니다.

  // true면 "강한 매수"(4/4 지표 전부 충족)만 신호로 인정하고 "매수"(3/4+저평가)는
  // 무시합니다. 단, 백테스트는 룩어헤드 편향 때문에 밸류에이션 없이 getRecommendation을
  // 호출하므로("강한 매수"만 나올 수 있음, hold/screener.ts 주석 참고) 지금 시점에는
  // 이 옵션이 백테스트 결과 자체를 바꾸지 않을 가능성이 높습니다. 그래도 나중에
  // 밸류에이션을 백테스트에 포함시키게 되면 바로 쓸 수 있도록 옵션을 만들어 둡니다.
  strongOnly?: boolean;
  // true면 "오늘도 매수 신호, 어제도 매수 신호"일 때만 진입합니다(2일 연속 확인).
  // 거래량 급증/골든크로스 같은 조건이 하루만 반짝 충족되는 하루짜리 휩쏘(가짜 신호)를
  // 걸러내려는 목적 — 신호 수는 줄지만 승률이 오르는지 확인하는 실험입니다.
  requireConfirmation?: boolean;
  // 양수를 주면(예: 60) 그 기간 이동평균 위에 있을 때만 매수를 허용합니다(장기 추세
  // 필터). 기존 4개 지표는 MA5/MA20(단기)까지만 보는데, 장기 하락 추세(예: MA60 아래)
  // 안에서 발생하는 단기 반등 신호를 걸러내려는 목적. null/0/미지정이면 비활성화.
  // ⚠️ dropReversal 모드와는 논리적으로 상충합니다(급락 직후엔 보통 MA 아래에
  // 있음) — 같이 켜면 신호가 거의 안 나올 수 있어요.
  trendFilterMaPeriod?: number | null;

  // "technical"(기본, 기존 4개 지표 기반 getRecommendation)과 "dropReversal"
  // (급락 후 안정화 패턴, indicators.ts의 detectDropReversal) 중 어떤 신호
  // 소스를 쓸지 선택합니다. 완전히 다른 전략이라 같이 섞지 않고 모드로 분리했어요.
  signalMode?: "technical" | "dropReversal";
};

export type ExitBreakdown = {
  takeProfit: number;
  stopLoss: number;
  time: number;
};

export type BacktestResult = {
  ticker: string;
  holdDays: number;
  takeProfitPct: number | null;
  stopLossPct: number | null;
  usableDays: number; // 지표 계산이 가능했던(워밍업 이후) 일수
  signalCount: number; // 실제로 진입한(비중복) 거래 수
  wins: number;
  losses: number;
  winRate: number | null; // 0~100
  avgReturnPct: number | null;
  medianReturnPct: number | null;
  exitBreakdown: ExitBreakdown;
  avgHoldDaysActual: number | null;
  // 신호 여부와 무관하게, 지표 계산 가능했던 모든 날짜에서 holdDays 뒤 수익률을
  // 잰 평균 — "그냥 아무 날에나 사서 holdDays만큼 들고 있었으면 평균 얼마
  // 벌었을까"에 해당하는 공정한 비교 기준. avgReturnPct와 기간이 같아서
  // 직접 비교 가능합니다(예전의 buyAndHoldReturnPct는 기간이 달라서 오해를
  // 일으켰던 지표라 참고용으로만 남겨둡니다).
  baselineAvgReturnPct: number | null;
  edgeVsBaselinePct: number | null; // avgReturnPct - baselineAvgReturnPct (양수면 신호가 baseline보다 나음)
  buyAndHoldReturnPct: number | null; // ⚠️ 전체 기간(usableDays 전부) 단순 보유 수익률 — holdDays 단위 수익률과 기간이 달라 직접 비교하면 안 됨. 참고용.
  trades: BacktestTrade[];
  // 통계 검정(전체 집계에서 t-검정 할 때 풀링용)을 위한 원본 baseline 수익률
  // 배열. UI에는 안 쓰고 aggregateResults 내부 계산용입니다.
  baselineReturns: number[];
};

// MA20/RSI14/거래량비율(20일) 계산에 필요한 최소 일수 + 초기 노이즈를 줄이기
// 위한 여유분.
const WARMUP_DAYS = 40;
// 52주 고저 근사에 쓸 최대 트레일링 거래일 수 (실제 주봉 데이터 없이 일봉으로
// 근사 — 대략 1년치 거래일).
const YEAR_TRADING_DAYS = 252;

function buildStockSnapshot(
  ticker: string,
  inputs: {
    price: number;
    chg: number;
    ma5over20: boolean;
    volRatio: number;
    rsi: number;
    hi: number;
    lo: number;
  },
): Stock {
  return {
    ticker,
    name: ticker,
    sector: "",
    price: inputs.price,
    chg: inputs.chg,
    cap: "",
    per: 0,
    pbr: null,
    hi: inputs.hi,
    lo: inputs.lo,
    ma5over20: inputs.ma5over20,
    volRatio: inputs.volRatio,
    rsi: inputs.rsi,
    // 백테스트는 4개 스크리너 규칙(getRecommendation)만 시뮬레이션하고
    // macdRebound는 별개 독립 신호라 안 씀 — 항상 false로 둬도 결과에
    // 영향 없음.
    macdRebound: false,
  };
}

export function backtestTicker(
  ticker: string,
  dailyBars: DailyBar[],
  options: BacktestOptions = {},
): BacktestResult {
  // ⚠️ 기본값은 익절/손절 없음(고정 holdDays 청산)입니다. +3%/-2%로 시도해봤더니
  // 손절선이 익절선보다 진입가에 더 가까워서(구조적으로 먼저 닿기 쉬움) 승률
  // 39.8%, 우위 -2.06%p(p≈0, 통계적으로 확실히 나쁨)로 오히려 baseline보다
  // 못한 결과가 나와서 기본값을 되돌렸습니다. 다시 실험해보고 싶으면 CLI에서
  // --tp/--sl로 켜서 손익비를 신중하게 재설계한 다음 시도하세요.
  const {
    holdDays = 10,
    takeProfitPct = null,
    stopLossPct = null,
    strongOnly = false,
    requireConfirmation = false,
    trendFilterMaPeriod = null,
    signalMode = "technical",
  } = options;
  const trades: BacktestTrade[] = [];
  const baselineReturns: number[] = [];
  let usableDays = 0;
  // 이미 포지션을 들고 있는 동안엔 새 신호를 새 거래로 안 셉니다(비중복).
  // 이 인덱스보다 앞선 날에는 진입할 수 없다는 뜻 — 직전 거래의 청산일 다음날부터
  // 다시 진입 가능.
  let nextEntryAllowedAt = 0;
  // requireConfirmation용: "어제"의 필터 통과 여부(포지션 보유 여부와 무관하게
  // 매일 갱신) — 신호 연속성만 보므로 실제 진입 가능 여부(nextEntryAllowedAt)와는
  // 별개로 매일 추적합니다.
  let prevFilteredBuy = false;

  for (let i = WARMUP_DAYS; i < dailyBars.length - holdDays; i++) {
    // "오늘"(i번째)까지의 봉만 사용 — 미래 데이터 차단.
    const windowBars = dailyBars.slice(0, i + 1);
    const yearApprox = windowBars.slice(-YEAR_TRADING_DAYS);
    const inputs = computeScreenerInputs(windowBars, yearApprox);
    if (!inputs) continue;
    usableDays += 1;

    // baseline: 신호 여부와 무관하게, 지표 계산이 가능했던 모든 날에서
    // holdDays 뒤 수익률을 기록해둡니다(익절/손절 없이 순수 시간 기준) —
    // "이 종목을 아무 날에나 사서 holdDays만큼 들고 있었으면 평균 얼마였을까"에
    // 해당하는 공정한 비교 기준. 신호 쪽 수익률에 익절/손절이 붙어도, 둘 다
    // 같은 holdDays 기간 안에서 비교하는 거라 비교 자체는 여전히 유효해요.
    const baseEntry = dailyBars[i];
    const baseExit = dailyBars[i + holdDays];
    if (baseEntry && baseExit && baseEntry.close > 0) {
      baselineReturns.push(+(((baseExit.close - baseEntry.close) / baseEntry.close) * 100).toFixed(2));
    }

    const snapshot = buildStockSnapshot(ticker, inputs);

    // 신호 소스 분기: "technical"은 기존 4개 지표 기반 getRecommendation,
    // "dropReversal"은 급락 후 안정화 패턴(indicators.ts). strength는
    // dropReversal엔 개념이 없어서 null로 둡니다(집계에서 strong/normal
    // 분리는 technical 모드에서만 의미가 있어요).
    let rawBuy: boolean;
    let strength: RecommendationStrength = null;
    if (signalMode === "dropReversal") {
      const dr = detectDropReversal(windowBars);
      rawBuy = dr?.isCandidate ?? false;
    } else {
      const rec = getRecommendation(snapshot); // 밸류에이션 없이 = 기술 지표 4개만
      rawBuy = rec.signal === "buy";
      strength = rec.strength;
    }

    // 장기 추세 필터: 지정된 기간 이동평균 위일 때만 통과. 데이터가 아직
    // 부족해(초반 워밍업 구간) MA를 못 구하면 보수적으로 필터 실패 처리합니다.
    let trendOk = true;
    if (trendFilterMaPeriod && trendFilterMaPeriod > 0) {
      const closes = windowBars.map((b) => b.close);
      const longMa = sma(closes, trendFilterMaPeriod);
      trendOk = longMa !== null && inputs.price >= longMa;
    }

    const filteredBuy = rawBuy && (!strongOnly || strength === "strong") && trendOk;
    // 확인(confirmation) 옵션: 오늘/어제 이틀 연속 필터 통과한 신호만 실제 매수로 인정.
    // prevFilteredBuy는 포지션 보유 여부와 무관하게 매일 갱신해야 "연속성"이 맞습니다.
    const confirmedBuy = requireConfirmation ? filteredBuy && prevFilteredBuy : filteredBuy;
    prevFilteredBuy = filteredBuy;

    if (!confirmedBuy) continue;
    if (i < nextEntryAllowedAt) continue; // 이미 포지션 보유 중 — 겹치는 신호는 스킵

    const entryBar = dailyBars[i];
    if (!entryBar) continue;

    // holdDays 안에서 매일 고가/저가를 확인해 익절/손절 조건에 먼저 닿는지
    // 체크합니다. 둘 다 닿는 날엔 보수적으로 손절을 먼저 체크(하락 갭 등
    // 실제로 더 흔한 상황을 가정).
    let exitIndex = i + holdDays;
    let exitPrice: number | null = null;
    let exitReason: ExitReason = "time";
    for (let h = 1; h <= holdDays; h++) {
      const bar = dailyBars[i + h];
      if (!bar) break;
      const gainAtHigh = ((bar.high - entryBar.close) / entryBar.close) * 100;
      const lossAtLow = ((bar.low - entryBar.close) / entryBar.close) * 100;
      if (stopLossPct !== null && stopLossPct !== undefined && lossAtLow <= stopLossPct) {
        exitIndex = i + h;
        exitPrice = +(entryBar.close * (1 + stopLossPct / 100)).toFixed(2);
        exitReason = "stop_loss";
        break;
      }
      if (takeProfitPct !== null && takeProfitPct !== undefined && gainAtHigh >= takeProfitPct) {
        exitIndex = i + h;
        exitPrice = +(entryBar.close * (1 + takeProfitPct / 100)).toFixed(2);
        exitReason = "take_profit";
        break;
      }
    }
    if (exitPrice === null) {
      const timeBar = dailyBars[i + holdDays];
      if (!timeBar) continue;
      exitIndex = i + holdDays;
      exitPrice = timeBar.close;
      exitReason = "time";
    }

    const exitBar = dailyBars[exitIndex];
    const returnPct = +(((exitPrice - entryBar.close) / entryBar.close) * 100).toFixed(2);
    trades.push({
      date: entryBar.date,
      entryPrice: entryBar.close,
      exitDate: exitBar?.date ?? "",
      exitPrice,
      returnPct,
      exitReason,
      holdDaysActual: exitIndex - i,
      strength,
    });
    nextEntryAllowedAt = exitIndex; // 이 포지션이 끝나야 다음 거래 가능
  }

  const wins = trades.filter((t) => t.returnPct > 0).length;
  const losses = trades.filter((t) => t.returnPct <= 0).length;
  const returns = trades.map((t) => t.returnPct).sort((a, b) => a - b);
  const avgReturnPct = returns.length
    ? +(returns.reduce((sum, r) => sum + r, 0) / returns.length).toFixed(2)
    : null;
  const medianReturnPct = returns.length
    ? +returns[Math.floor(returns.length / 2)].toFixed(2)
    : null;

  const baselineAvgReturnPct = baselineReturns.length
    ? +(baselineReturns.reduce((sum, r) => sum + r, 0) / baselineReturns.length).toFixed(2)
    : null;
  const edgeVsBaselinePct =
    avgReturnPct !== null && baselineAvgReturnPct !== null
      ? +(avgReturnPct - baselineAvgReturnPct).toFixed(2)
      : null;

  const first = dailyBars[0];
  const last = dailyBars[dailyBars.length - 1];
  const buyAndHoldReturnPct =
    first && last && first.close > 0
      ? +(((last.close - first.close) / first.close) * 100).toFixed(2)
      : null;

  const exitBreakdown: ExitBreakdown = {
    takeProfit: trades.filter((t) => t.exitReason === "take_profit").length,
    stopLoss: trades.filter((t) => t.exitReason === "stop_loss").length,
    time: trades.filter((t) => t.exitReason === "time").length,
  };
  const avgHoldDaysActual = trades.length
    ? +(trades.reduce((sum, t) => sum + t.holdDaysActual, 0) / trades.length).toFixed(1)
    : null;

  return {
    ticker,
    holdDays,
    takeProfitPct: takeProfitPct ?? null,
    stopLossPct: stopLossPct ?? null,
    usableDays,
    signalCount: trades.length,
    wins,
    losses,
    winRate: trades.length ? +((wins / trades.length) * 100).toFixed(1) : null,
    avgReturnPct,
    medianReturnPct,
    exitBreakdown,
    avgHoldDaysActual,
    baselineAvgReturnPct,
    edgeVsBaselinePct,
    buyAndHoldReturnPct,
    trades,
    baselineReturns,
  };
}

// ---------------------------------------------------------------------------
// 통계 검정 (Welch's t-test, 이분산 가정 — 신호 거래군과 baseline군의 표본
// 크기·분산이 다르니까 등분산을 가정하는 일반 t-test보다 이게 맞음).
// 정규분포 근사로 p-value를 계산합니다(Abramowitz & Stegun erf 근사, 오차
// 1.5e-7 수준). 자유도(df)가 수천 단위로 크게 나올 거라 t분포나 정규분포나
// 실질적으로 차이가 거의 없어서 이 근사로 충분합니다.
// ---------------------------------------------------------------------------
function mean(xs: number[]): number {
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

function sampleVariance(xs: number[], m: number): number {
  if (xs.length < 2) return 0;
  return xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / (xs.length - 1);
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}

function normalCdf(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export type TTestResult = {
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  tStat: number;
  // Welch–Satterthwaite 자유도. df가 크면(수백~수천) t분포가 사실상 정규분포와
  // 같아서, p-value는 정규분포 근사로 계산합니다.
  df: number;
  pValue: number;
  significantAt95: boolean; // p < 0.05
};

function welchTTest(sample1: number[], sample2: number[]): TTestResult | null {
  if (sample1.length < 2 || sample2.length < 2) return null;
  const n1 = sample1.length;
  const n2 = sample2.length;
  const m1 = mean(sample1);
  const m2 = mean(sample2);
  const v1 = sampleVariance(sample1, m1);
  const v2 = sampleVariance(sample2, m2);
  const se2 = v1 / n1 + v2 / n2;
  if (se2 <= 0) return null;
  const se = Math.sqrt(se2);
  const t = (m1 - m2) / se;
  const df =
    se2 ** 2 / ((v1 / n1) ** 2 / (n1 - 1) + (v2 / n2) ** 2 / (n2 - 1) || 1);
  const p = 2 * (1 - normalCdf(Math.abs(t)));

  return {
    n1,
    n2,
    mean1: +m1.toFixed(3),
    mean2: +m2.toFixed(3),
    tStat: +t.toFixed(3),
    df: +df.toFixed(1),
    pValue: +p.toFixed(4),
    significantAt95: p < 0.05,
  };
}

export type StrengthStats = {
  count: number;
  wins: number;
  winRate: number | null;
  avgReturnPct: number | null;
  edgeVsBaselinePct: number | null; // 같은 overallBaselineAvgReturnPct 대비
};

export type AggregateBacktestResult = {
  tickerCount: number;
  totalSignals: number;
  totalWins: number;
  overallWinRate: number | null;
  overallAvgReturnPct: number | null;
  // 종목별 baselineAvgReturnPct의 단순 평균 — overallAvgReturnPct와 기간이
  // 같아서 직접 비교 가능한 공정한 기준선입니다.
  overallBaselineAvgReturnPct: number | null;
  overallEdgeVsBaselinePct: number | null;
  avgBuyAndHoldReturnPct: number | null; // ⚠️ 참고용 — 기간이 달라 overallAvgReturnPct와 직접 비교 금지
  // 신호 거래 수익률 전체(풀링) vs baseline 수익률 전체(풀링)를 Welch's
  // t-test로 비교한 결과. null이면 표본이 너무 작아 검정 불가.
  significance: TTestResult | null;
  exitBreakdown: ExitBreakdown;
  // "강한 매수"(4/4)와 "매수"(3/4+저평가)를 나눠서, 강도가 높은 신호가 실제로
  // 더 나은 승률/수익률을 내는지 확인하기 위한 분리 집계입니다. baseline은
  // 강도와 무관하게 같은 값(overallBaselineAvgReturnPct)을 기준으로 삼아요.
  byStrength: { strong: StrengthStats; normal: StrengthStats };
};

function strengthStats(trades: BacktestTrade[], baseline: number | null): StrengthStats {
  const wins = trades.filter((t) => t.returnPct > 0).length;
  const avgReturnPct = trades.length
    ? +(trades.reduce((sum, t) => sum + t.returnPct, 0) / trades.length).toFixed(2)
    : null;
  return {
    count: trades.length,
    wins,
    winRate: trades.length ? +((wins / trades.length) * 100).toFixed(1) : null,
    avgReturnPct,
    edgeVsBaselinePct:
      avgReturnPct !== null && baseline !== null ? +(avgReturnPct - baseline).toFixed(2) : null,
  };
}

export function aggregateResults(results: BacktestResult[]): AggregateBacktestResult {
  const allTrades = results.flatMap((r) => r.trades);
  const allTradeReturns = allTrades.map((t) => t.returnPct);
  const allBaselineReturns = results.flatMap((r) => r.baselineReturns);
  const wins = allTrades.filter((t) => t.returnPct > 0).length;
  const bnh = results
    .map((r) => r.buyAndHoldReturnPct)
    .filter((v): v is number => typeof v === "number");
  const baselines = results
    .map((r) => r.baselineAvgReturnPct)
    .filter((v): v is number => typeof v === "number");

  const overallAvgReturnPct = allTrades.length
    ? +(allTrades.reduce((sum, t) => sum + t.returnPct, 0) / allTrades.length).toFixed(2)
    : null;
  const overallBaselineAvgReturnPct = baselines.length
    ? +(baselines.reduce((sum, v) => sum + v, 0) / baselines.length).toFixed(2)
    : null;

  return {
    tickerCount: results.length,
    totalSignals: allTrades.length,
    totalWins: wins,
    overallWinRate: allTrades.length ? +((wins / allTrades.length) * 100).toFixed(1) : null,
    overallAvgReturnPct,
    overallBaselineAvgReturnPct,
    overallEdgeVsBaselinePct:
      overallAvgReturnPct !== null && overallBaselineAvgReturnPct !== null
        ? +(overallAvgReturnPct - overallBaselineAvgReturnPct).toFixed(2)
        : null,
    avgBuyAndHoldReturnPct: bnh.length
      ? +(bnh.reduce((sum, v) => sum + v, 0) / bnh.length).toFixed(2)
      : null,
    significance: welchTTest(allTradeReturns, allBaselineReturns),
    exitBreakdown: {
      takeProfit: results.reduce((sum, r) => sum + r.exitBreakdown.takeProfit, 0),
      stopLoss: results.reduce((sum, r) => sum + r.exitBreakdown.stopLoss, 0),
      time: results.reduce((sum, r) => sum + r.exitBreakdown.time, 0),
    },
    byStrength: {
      strong: strengthStats(
        allTrades.filter((t) => t.strength === "strong"),
        overallBaselineAvgReturnPct,
      ),
      normal: strengthStats(
        allTrades.filter((t) => t.strength === "normal"),
        overallBaselineAvgReturnPct,
      ),
    },
  };
}
