// ---------------------------------------------------------------------------
// 백테스트 CLI (수동 실행: `pnpm backtest`)
//
// 기술 지표 4개(골든크로스/거래량비율/52주 반등/RSI)로 판정한 매수 신호가 이후
// 수익으로 이어졌는지 확인한다. PER/PBR 업종 밸류에이션은 룩어헤드 편향 때문에
// 제외했다(src/lib/backtest.ts 상단 참고). refresh-universe.ts와 같이 tsx 단독 실행 +
// .env.local 직접 로딩을 쓴다.
//
// 대상 종목 우선순위: --tickers > --universe(DB 유니버스, 최대 200개) > 샘플 10종목.
//
// 사용법:
//   pnpm backtest                            # 기본값 (holdDays=10, days=500, 샘플 10종목)
//   pnpm backtest -- --universe              # DB 유니버스 전체
//   pnpm backtest -- --universe --limit=50   # 시총 상위 50개만
//   pnpm backtest -- --hold=20               # 20거래일 보유
//   pnpm backtest -- --days=800              # 더 긴 과거 기간
//   pnpm backtest -- --tickers=005930,000660
//   pnpm backtest -- --end=2024-06-30 --days=250
//     특정 국면(하락장·횡보장)에서도 같은 규칙이 통하는지 보기 위한 기간 지정
//   pnpm backtest -- --tp=3 --sl=-2          # 익절/손절 (기본은 꺼짐, 고정 holdDays 청산)
//     +3%/-2%는 손절선이 더 가까워 손절이 먼저 닿기 쉬웠고(손절 5206건 vs 익절 3442건)
//     승률 39.8%, baseline 대비 -2.06%p로 나빠 기본값에서 뺐다.
//
// 승률 개선 실험 옵션 (기본 꺼짐, 조합 가능):
//   --strongOnly   4/4 신호만 인정 (백테스트는 밸류에이션 없이 판정하므로 결과 차이가
//                  작을 수 있다. byStrength.normal count가 0이면 그 경우)
//   --confirm      이틀 연속 신호일 때만 진입 (휩쏘 필터)
//   --trendMa=60   MA60 위일 때만 진입
//
// 급락 후 안정화 신호 (기존 4개 지표 대신 사용, indicators.ts detectDropReversal):
//   --dropReversal
//     --strongOnly는 무시된다. --trendMa와 함께 쓰면 대부분 걸러지므로 따로 테스트하고,
//     --confirm과는 함께 쓸 수 있다. 임계값은 indicators.ts의 DROP_REVERSAL_DEFAULTS에서 바꾼다.
//
// 종목 하나당 500일치를 받는 데 KIS 호출이 5~6번 필요하고 kis.ts의 rate limiter가
// 초당 6건이라, 200종목이면 수 분이 걸린다. 종목별 usableDays가 비정상적으로 적으면
// kis.ts의 HISTORY_CHUNK_DAYS와 파싱 로직을 먼저 확인한다.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function loadEnvLocal() {
  const envPath = path.resolve(scriptDir, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

function parseArg(name: string, fallback: string): string {
  const prefix = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  const { kisConfigured, fetchDailyBarsHistory } = await import("../src/lib/kis");
  const { backtestTicker, aggregateResults } = await import("../src/lib/backtest");
  const { STOCKS } = await import("../src/lib/stocks");
  type BacktestResult = Awaited<ReturnType<typeof backtestTicker>>;

  if (!kisConfigured()) {
    console.error("KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).");
    process.exit(1);
  }

  const holdDays = Number(parseArg("hold", "10"));
  const historyDays = Number(parseArg("days", "500"));
  const tickersArg = parseArg("tickers", "");
  const useUniverse = hasFlag("universe");
  const limitArg = parseArg("limit", "");
  const limit = limitArg ? Number(limitArg) : null;
  const endArg = parseArg("end", "");
  let endDate: Date | undefined;
  if (endArg) {
    const parsed = new Date(endArg);
    if (Number.isNaN(parsed.getTime())) {
      console.error(`--end 값이 날짜로 인식이 안 돼요: "${endArg}" (예: --end=2024-06-30)`);
      process.exit(1);
    }
    endDate = parsed;
  }
  // 기본값은 익절/손절 없음 — --tp=/--sl=를 명시적으로 줘야만 켜집니다.
  const tpArg = parseArg("tp", "");
  const slArg = parseArg("sl", "");
  const takeProfitPct = tpArg ? Number(tpArg) : null;
  const stopLossPct = slArg ? Number(slArg) : null;

  // 승률 개선 실험용 옵션 (기본값이면 기존 동작과 같다).
  const strongOnly = hasFlag("strongOnly");
  const requireConfirmation = hasFlag("confirm");
  const trendMaArg = parseArg("trendMa", "");
  const trendFilterMaPeriod = trendMaArg ? Number(trendMaArg) : null;
  // --dropReversal: "급락 후 안정화" 패턴을 신호 소스로 씀 (기존 4개 기술지표
  // 대신). backtest.ts의 detectDropReversal/indicators.ts 주석 참고.
  const signalMode: "technical" | "dropReversal" = hasFlag("dropReversal") ? "dropReversal" : "technical";

  const tickerNames = new Map<string, string>(STOCKS.map((s) => [s.ticker, s.name]));
  let tickers: string[];

  if (tickersArg) {
    tickers = tickersArg.split(",").map((t) => t.trim()).filter(Boolean);
  } else if (useUniverse) {
    const { prisma } = await import("../src/lib/db");
    const rows = await prisma.stock.findMany({
      orderBy: { capEok: "desc" },
      select: { ticker: true, name: true },
    });
    if (rows.length === 0) {
      console.error(
        "DB 유니버스가 비어있어요. 먼저 `pnpm refresh-universe`로 DB를 채운 뒤 --universe를 써주세요.",
      );
      process.exit(1);
    }
    for (const r of rows) tickerNames.set(r.ticker, r.name);
    tickers = rows.map((r) => r.ticker);
  } else {
    tickers = STOCKS.map((s) => s.ticker);
  }

  if (limit && limit > 0) tickers = tickers.slice(0, limit);

  console.log(
    `백테스트 시작: 종목 ${tickers.length}개(${useUniverse ? "DB 유니버스" : tickersArg ? "지정 종목" : "샘플"}), 최대 보유기간 ${holdDays}거래일` +
      `, 익절 ${takeProfitPct === null ? "없음" : `+${takeProfitPct}%`}, 손절 ${stopLossPct === null ? "없음" : `${stopLossPct}%`}` +
      `, 조회기간 ${endDate ? `${endDate.toISOString().slice(0, 10)}까지 ` : "최근 "}${historyDays}일` +
      `, 신호소스 ${signalMode === "dropReversal" ? "급락-안정화" : "기술지표 4개"}` +
      `, 강한매수만 ${strongOnly ? "예" : "아니오"}, 2일연속확인 ${requireConfirmation ? "예" : "아니오"}` +
      `, 추세필터 ${trendFilterMaPeriod ? `MA${trendFilterMaPeriod} 위` : "없음"}\n`,
  );

  const results: BacktestResult[] = [];
  for (const ticker of tickers) {
    const name = tickerNames.get(ticker) ?? ticker;
    process.stdout.write(`  ${ticker} ${name} 조회 중...`);
    const bars = await fetchDailyBarsHistory(ticker, historyDays, endDate);
    if (!bars || bars.length < 60) {
      console.log(` 스킵 (일봉 ${bars?.length ?? 0}개 — 데이터 부족)`);
      continue;
    }
    const result = backtestTicker(ticker, bars, {
      holdDays,
      takeProfitPct,
      stopLossPct,
      strongOnly,
      requireConfirmation,
      trendFilterMaPeriod,
      signalMode,
    });
    results.push(result);
    console.log(
      ` 완료 — 신호(비중복) ${result.signalCount}건, 승률 ${result.winRate ?? "N/A"}%, 평균수익률 ${result.avgReturnPct ?? "N/A"}% (baseline ${result.baselineAvgReturnPct ?? "N/A"}%, 우위 ${result.edgeVsBaselinePct ?? "N/A"}%p)`,
    );
  }

  console.log("\n" + "=".repeat(72));
  console.log("종목별 결과");
  console.log("=".repeat(72));
  console.log(
    [
      "종목",
      "일봉수",
      "신호(비중복)",
      "승",
      "패",
      "승률%",
      "평균%",
      "중앙값%",
      "baseline%",
      "우위%",
      "익절/손절/만료",
      "평균보유일",
      "바이앤홀드%(참고)",
    ].join("\t"),
  );
  for (const r of results) {
    console.log(
      [
        r.ticker,
        r.usableDays,
        r.signalCount,
        r.wins,
        r.losses,
        r.winRate ?? "-",
        r.avgReturnPct ?? "-",
        r.medianReturnPct ?? "-",
        r.baselineAvgReturnPct ?? "-",
        r.edgeVsBaselinePct ?? "-",
        `${r.exitBreakdown.takeProfit}/${r.exitBreakdown.stopLoss}/${r.exitBreakdown.time}`,
        r.avgHoldDaysActual ?? "-",
        r.buyAndHoldReturnPct ?? "-",
      ].join("\t"),
    );
  }

  const agg = aggregateResults(results);
  console.log("\n" + "=".repeat(72));
  console.log("전체 집계");
  console.log("=".repeat(72));
  console.log(`종목 수: ${agg.tickerCount}`);
  console.log(`전체 매수 신호 수(비중복): ${agg.totalSignals}`);
  console.log(`승리: ${agg.totalWins} / 전체 승률: ${agg.overallWinRate ?? "N/A"}%`);
  console.log(`신호당 평균 수익률(${holdDays}거래일 보유 기준): ${agg.overallAvgReturnPct ?? "N/A"}%`);
  console.log(
    `baseline(신호 무관, 같은 ${holdDays}거래일 보유 기준 평균): ${agg.overallBaselineAvgReturnPct ?? "N/A"}%`,
  );
  console.log(`→ 우위(신호 평균 - baseline): ${agg.overallEdgeVsBaselinePct ?? "N/A"}%p`);
  console.log(
    `청산 사유 분포: 익절 ${agg.exitBreakdown.takeProfit}건 / 손절 ${agg.exitBreakdown.stopLoss}건 / 기간만료 ${agg.exitBreakdown.time}건`,
  );

  console.log("\n" + "-".repeat(72));
  console.log("신호 강도별 분리 집계 (강한 매수 4/4  vs  매수 3/4+저평가)");
  console.log("-".repeat(72));
  const { strong, normal } = agg.byStrength;
  console.log(
    `강한 매수: ${strong.count}건, 승률 ${strong.winRate ?? "N/A"}%, 평균수익률 ${strong.avgReturnPct ?? "N/A"}%, 우위 ${strong.edgeVsBaselinePct ?? "N/A"}%p`,
  );
  console.log(
    `매수(3/4+저평가): ${normal.count}건, 승률 ${normal.winRate ?? "N/A"}%, 평균수익률 ${normal.avgReturnPct ?? "N/A"}%, 우위 ${normal.edgeVsBaselinePct ?? "N/A"}%p`,
  );
  console.log(
    "→ 둘 중 한쪽만 뚜렷하게 낫다면(예: 강한 매수만 우위가 크고 매수는 baseline과 비슷하거나 못하다면)," +
      " '매수'(3/4) 등급은 걸러내고 '강한 매수'만 신호로 쓰는 게 승률/우위를 실질적으로 올리는 방법이 될 수 있어요.",
  );
  console.log(
    `(참고, 기간이 달라 직접 비교 금지) 종목별 전체 기간 단순 보유 평균 수익률: ${agg.avgBuyAndHoldReturnPct ?? "N/A"}%`,
  );

  console.log("\n" + "-".repeat(72));
  console.log("통계적 유의성 (Welch's t-test: 신호 수익률 vs baseline 수익률)");
  console.log("-".repeat(72));
  if (agg.significance) {
    const sig = agg.significance;
    console.log(`신호 표본 수: ${sig.n1}건 (평균 ${sig.mean1}%)  vs  baseline 표본 수: ${sig.n2}건 (평균 ${sig.mean2}%)`);
    console.log(`t-statistic: ${sig.tStat}  /  자유도(df): ${sig.df}  /  p-value: ${sig.pValue}`);
    console.log(
      sig.significantAt95
        ? `→ p < 0.05: 통계적으로 유의미해요. 이 우위가 우연(노이즈)일 가능성은 낮다고 볼 수 있어요.`
        : `→ p ≥ 0.05: 통계적으로 유의미하지 않아요. 지금 나온 우위(${agg.overallEdgeVsBaselinePct ?? "N/A"}%p)가` +
            ` 우연히 나왔을 가능성을 배제할 수 없다는 뜻이에요 — "이 규칙이 진짜 통한다"고 확신하기엔 이릅니다.`,
    );
  } else {
    console.log("표본이 너무 작아서(신호 2건 미만) 검정을 못 했어요.");
  }

  console.log(
    "\n참고: '우위'가 0에 가깝거나 음수면, 이 신호가 그냥 아무 날에나 사서 같은 기간" +
      " 들고 있는 것보다 나을 게 없다는 뜻이에요. 승률이 50%를 크게 밑도는 것도 같은 신호입니다." +
      " 이런 경우 임계값을 조정하거나 규칙을 다시 설계해봐야 해요. p-value까지 같이 봐야" +
      " '우위가 있어 보인다'가 아니라 '진짜 우위가 있다'고 말할 수 있어요.",
  );

  if (useUniverse) {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  }
}

main().catch(async (e) => {
  console.error("백테스트 실행 중 오류:", e);
  try {
    const { prisma } = await import("../src/lib/db");
    await prisma.$disconnect();
  } catch {
    // db 연결을 아예 안 열었을 수도 있어서 실패해도 무시
  }
  process.exit(1);
});
