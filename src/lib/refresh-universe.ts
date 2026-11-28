// ---------------------------------------------------------------------------
// 유니버스 갱신 로직 (서버 전용). scripts/refresh-universe.ts(CLI)와
// /api/universe/refresh(버튼)가 함께 쓴다.
//
// 종목 목록은 KIS 종목마스터 파일(kospi_code.mst)의 시가총액으로 정렬해 상위 N개를
// 뽑는다(순위 API는 30건까지만 주기 때문, kis.ts fetchMarketCapRanking 참고).
// 종목별로 일봉/주봉/현재가를 조회해 스크리너 지표를 계산하고 Stock 테이블에 upsert한다.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { kisConfigured, fetchDailyBars, fetchWeeklyBars, fetchQuoteDetail } from "./kis";
import { fetchKospiMaster } from "./kospi-master";
import { computeScreenerInputs, computeMacdSeries, isMacdReboundSignal } from "./indicators";
import { formatMarketCapEok, type Stock } from "./stocks";
import {
  passesScreener,
  screenerScore,
  getRecommendation,
  sectorAveragePer,
  sectorAveragePbr,
} from "./screener";

const UNIVERSE_SIZE = 200;
// kis.ts 내부에 전역 rate limiter(초당 6건)가 있어서 여기 동시성은 그렇게
// 중요하지 않지만, 너무 크게 잡으면 큐만 길어지고 로그가 뒤섞이니 적당히 낮게.
const CONCURRENCY = 4;
const DEFAULT_SECTOR = "기타";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 여러 종목을 동시에 upsert하면 MySQL이 일시적으로 "Lock wait timeout"을 낼 수 있어,
// 종목을 건너뛰지 않고 짧게 재시도한다.
async function withLockRetry<T>(fn: () => Promise<T>, label: string, maxAttempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const isLockTimeout = e instanceof Error && e.message.includes("Lock wait timeout");
      if (!isLockTimeout || attempt >= maxAttempts) throw e;
      const backoffMs = 500 * attempt;
      console.warn(`  [재시도] ${label} — DB 락 대기 초과, ${backoffMs}ms 후 재시도 (${attempt}/${maxAttempts})`);
      await sleep(backoffMs);
    }
  }
}

// screener.ts의 getRecommendation label -> DB에 저장할 숫자 등급.
// 높을수록 좋음(완전충족=3)으로 둬서 screenerScore("높을수록 많이 통과")랑
// 같은 관례를 따름 — desc 정렬하면 완전충족이 먼저 나옴.
export function labelToRank(label: string): number {
  switch (label) {
    case "완전충족":
      return 3;
    case "조건충족":
      return 2;
    case "주의":
      return 0;
    default: // 보류
      return 1;
  }
}

// 2단계 패스: 전 종목 저장 후 업종 평균 PER/PBR을 계산해 등급(recommendationRank)을
// 다시 매긴다. 업종 평균은 다른 종목 데이터가 모두 있어야 계산되므로 processTicker()
// 안에서는 구할 수 없다. DB 값만 읽어 계산하므로 KIS 호출은 추가로 없다.
async function updateRecommendationRanks(): Promise<void> {
  const rows = await prisma.stock.findMany();
  const stocks: (Stock & { updatedAt: Date })[] = rows.map((r) => ({
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    price: r.price,
    chg: r.chg,
    cap: r.cap,
    per: r.per ?? 0,
    pbr: r.pbr,
    hi: r.hi,
    lo: r.lo,
    ma5over20: r.ma5over20,
    volRatio: r.volRatio,
    rsi: r.rsi,
    macdRebound: r.macdRebound,
    updatedAt: r.updatedAt,
  }));

  const avgPer = sectorAveragePer(stocks);
  const avgPbr = sectorAveragePbr(stocks);

  // 200개를 한 번에 Promise.all로 쏘면 같은 테이블에 순간적으로 너무 많은
  // UPDATE가 몰려서 이것도 락 경합 원인이 될 수 있어(위 processTicker의
  // upsert와 같은 문제), CONCURRENCY만큼씩 나눠서 처리합니다.
  for (let i = 0; i < stocks.length; i += CONCURRENCY) {
    const batch = stocks.slice(i, i + CONCURRENCY);
    await Promise.all(
      batch.map((s) => {
        const rec = getRecommendation(s, avgPer[s.sector], avgPbr[s.sector]);
        return withLockRetry(
          () =>
            prisma.stock.update({
              where: { ticker: s.ticker },
              data: {
                recommendationRank: labelToRank(rec.label),
                updatedAt: s.updatedAt,
              },
            }),
          `${s.ticker} recommendationRank update`,
        );
      }),
    );
  }
}

async function processTicker(ticker: string, name: string, rank: number): Promise<string | null> {
  const [daily, weekly, detail] = await Promise.all([
    fetchDailyBars(ticker),
    fetchWeeklyBars(ticker),
    fetchQuoteDetail(ticker),
  ]);

  if (!daily || !weekly) {
    console.warn(`  [스킵] ${ticker} ${name} — 일봉/주봉 조회 실패`);
    return null;
  }

  const inputs = computeScreenerInputs(daily, weekly);
  if (!inputs) {
    console.warn(`  [스킵] ${ticker} ${name} — 지표 계산에 필요한 데이터 부족`);
    return null;
  }
  const macdRebound = isMacdReboundSignal(computeMacdSeries(daily));

  const price = detail?.price ?? inputs.price;
  const chg = detail?.chg ?? inputs.chg;
  const hi = detail?.w52High ?? inputs.hi;
  const lo = detail?.w52Low ?? inputs.lo;
  const capEok = detail?.marketCapEok ?? 0;
  const per = detail?.per ?? null;
  const pbr = detail?.pbr ?? null;
  const sector = detail?.sector ?? DEFAULT_SECTOR;

  const screenerInputForScore = {
    ticker,
    name,
    sector,
    price,
    chg,
    cap: formatMarketCapEok(capEok),
    per: per ?? 0,
    pbr,
    hi,
    lo,
    ma5over20: inputs.ma5over20,
    volRatio: inputs.volRatio,
    rsi: inputs.rsi,
    macdRebound,
  };

  await withLockRetry(() => prisma.stock.upsert({
    where: { ticker },
    create: {
      ticker,
      name,
      sector,
      market: "KOSPI", // 코스피200 유니버스만 받는 중이라 전부 KOSPI
      price,
      chg,
      cap: formatMarketCapEok(capEok),
      capEok,
      per,
      pbr,
      hi,
      lo,
      ma5over20: inputs.ma5over20,
      volRatio: inputs.volRatio,
      rsi: inputs.rsi,
      screenerOk: passesScreener(screenerInputForScore),
      screenerScore: screenerScore(screenerInputForScore),
      macdRebound,
    },
    update: {
      name,
      sector,
      price,
      chg,
      cap: formatMarketCapEok(capEok),
      capEok,
      per,
      pbr,
      hi,
      lo,
      ma5over20: inputs.ma5over20,
      volRatio: inputs.volRatio,
      rsi: inputs.rsi,
      screenerOk: passesScreener(screenerInputForScore),
      screenerScore: screenerScore(screenerInputForScore),
      macdRebound,
    },
  }), `${ticker} ${name} upsert`);

  console.log(`  [완료] #${rank} ${ticker} ${name} — ${price.toLocaleString()}원`);
  return ticker;
}

export type RefreshResult = {
  ok: boolean;
  total: number;
  succeeded: number;
  removed: number;
  message: string;
};

// 정상 실행은 보통 2~4분 걸려요(200종목 x KIS 호출 3건, 초당 6건 제한).
// 그보다 훨씬 오래 "실행 중"으로 남아있으면 크래시 등으로 락을 못 푼
// 상태라고 보고, 새 실행이 락을 다시 가져갈 수 있게 합니다 — 안 그러면
// 한 번 죽었을 때 영구히 새로고침이 막혀버려요.
const STALE_LOCK_MS = 10 * 60 * 1000;

// DB row로 락을 관리한다(서버리스 인스턴스 간 메모리 미공유). updateMany의 WHERE
// 조건이 맞을 때만 UPDATE가 성공하는 점을 이용해, 동시에 호출돼도 하나만
// count===1을 받는다.
async function acquireRefreshLock(): Promise<boolean> {
  await prisma.refreshLock.upsert({
    where: { id: 1 },
    create: { id: 1, isRunning: false },
    update: {},
  });

  const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
  const result = await prisma.refreshLock.updateMany({
    where: {
      id: 1,
      OR: [{ isRunning: false }, { updatedAt: { lt: staleThreshold } }],
    },
    data: { isRunning: true },
  });
  return result.count === 1;
}

async function releaseRefreshLock(): Promise<void> {
  await prisma.refreshLock.update({
    where: { id: 1 },
    data: { isRunning: false },
  });
}

// 새로고침 버튼이 현재 갱신 중인지 서버(DB 락)에 확인할 때 쓴다. 앱을 다시 켜면
// 클라이언트 상태가 초기화되므로 서버 상태를 기준으로 한다. acquireRefreshLock과
// 같은 기준으로, 10분 넘게 isRunning=true인 락은 비정상 종료로 보고 실행 중이 아닌
// 것으로 취급한다.
export async function isRefreshRunning(): Promise<boolean> {
  const lock = await prisma.refreshLock.findUnique({ where: { id: 1 } });
  if (!lock?.isRunning) return false;
  const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
  return lock.updatedAt >= staleThreshold;
}

export async function refreshUniverse(): Promise<RefreshResult> {
  if (!kisConfigured()) {
    return {
      ok: false,
      total: 0,
      succeeded: 0,
      removed: 0,
      message: "KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).",
    };
  }

  if (!(await acquireRefreshLock())) {
    return {
      ok: false,
      total: 0,
      succeeded: 0,
      removed: 0,
      message: "이미 갱신이 진행 중이에요. 잠시 후 다시 시도해주세요.",
    };
  }

  try {
    console.log("코스피 종목마스터 파일 다운로드 중...");
    let master;
    try {
      master = await fetchKospiMaster();
    } catch (e) {
      return {
        ok: false,
        total: 0,
        succeeded: 0,
        removed: 0,
        message: `종목마스터 다운로드/파싱 실패: ${e instanceof Error ? e.message : String(e)}`,
      };
    }

    const ranking = master
      .filter((r) => r.capEok > 0)
      .sort((a, b) => b.capEok - a.capEok)
      .slice(0, UNIVERSE_SIZE)
      .map((r, i) => ({ ticker: r.ticker, name: r.name, rank: i + 1 }));

    if (ranking.length === 0) {
      return {
        ok: false,
        total: 0,
        succeeded: 0,
        removed: 0,
        message: "종목마스터에서 유효한 종목을 찾지 못했어요 (파싱 결과가 비어있음).",
      };
    }

    console.log(`시가총액 상위 ${ranking.length}개 종목 확인됨. 종목별 지표 계산 시작...`);

    const succeeded: string[] = [];
    for (let i = 0; i < ranking.length; i += CONCURRENCY) {
      const batch = ranking.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((r) => processTicker(r.ticker, r.name, r.rank)),
      );
      succeeded.push(...results.filter((t): t is string => Boolean(t)));
      await sleep(300);
    }

    let removedCount = 0;
    if (succeeded.length > 0) {
      const removed = await prisma.stock.deleteMany({
        // API 조회 실패는 편출 사유가 아닙니다. 마스터의 대상 목록으로 비교합니다.
        where: { ticker: { notIn: ranking.map((r) => r.ticker) } },
      });
      removedCount = removed.count;

      console.log("업종 평균 대비 등급(완전충족/조건충족/보류/주의) 계산 중...");
      await updateRecommendationRanks();
    }

    return {
      ok: succeeded.length > 0,
      total: ranking.length,
      succeeded: succeeded.length,
      removed: removedCount,
      message: succeeded.length === ranking.length
        ? `${succeeded.length}/${ranking.length}개 종목을 갱신했어요.`
        : `${succeeded.length}/${ranking.length}개 종목을 갱신했어요. 실패한 ${ranking.length - succeeded.length}개 종목의 기존 데이터는 유지합니다.`,
    };
  } finally {
    await releaseRefreshLock();
  }
}
