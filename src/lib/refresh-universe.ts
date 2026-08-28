// ---------------------------------------------------------------------------
// 유니버스 갱신 로직 (서버 전용). scripts/refresh-universe.ts(CLI)와
// /api/universe/refresh(버튼 클릭)가 이 함수를 공유합니다.
//
// 종목 목록은 KIS 종목마스터 파일(kospi_code.mst)에서 뽑습니다 — 순위분석
// API(FHPST01740000)는 실측 결과 상위 30건까지만 줘서(kis.ts의
// fetchMarketCapRanking 주석 참고) 200종목을 못 채웠는데, 마스터 파일 자체에
// 시가총액이 이미 들어있어서 그걸로 내림차순 정렬 후 상위 N개를 뽑으면 순위
// API 없이도 진짜 ~200개를 채울 수 있습니다. (kospi-master.ts 참고 — 이
// 세션에서는 네트워크가 막혀 있어서 다운로드/파싱을 실측하지 못했습니다.)
//
// 종목별로는 여전히 일봉/주봉/현재가를 개별 조회해서 스크리너 지표를 계산하고
// MySQL(Prisma) Stock 테이블에 upsert 합니다.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { kisConfigured, fetchDailyBars, fetchWeeklyBars, fetchQuoteDetail } from "./kis";
import { fetchKospiMaster } from "./kospi-master";
import { computeScreenerInputs } from "./indicators";
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

// CONCURRENCY(4)개 종목을 동시에 upsert하다 보면 MySQL이 순간적으로
// "Lock wait timeout"을 낼 수 있어요(여러 요청이 같은 테이블/인접 row에
// 몰릴 때 InnoDB가 잠깐 대기시키는 것 — 2026-08-24 세션에 프로덕션에서
// 실제로 겪음). 이런 건 몇 초 뒤에 다시 시도하면 대부분 풀리는 일시적
// 현상이라, 종목 하나 스킵시키는 대신 짧게 재시도합니다.
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

// 2단계 패스: 200종목을 다 저장한 "다음"에 업종 평균 PER/PBR을 계산해서
// 각 종목의 완전충족/조건충족/보류/주의 등급을 다시 매기고 recommendationRank로
// 저장합니다(2026-08-23 세션, "등급순 정렬" 추가하면서 도입). getRecommendation이
// sectorAvgPer/sectorAvgPbr을 요구하는데, 그건 "같은 업종의 다른 종목들" 데이터가
// 있어야 계산되는 값이라 processTicker() 안에서(종목 하나씩 저장하는 시점에는)
// 는 아직 못 구함 — 그래서 screenerScore와 달리 배치 안에서 별도 후처리 단계로
// 뺐습니다. KIS API를 추가로 부르지 않고(DB에 이미 저장된 값만 읽음) 순수
// 계산 + DB 업데이트라 몇 초 안에 끝나요.
async function updateRecommendationRanks(): Promise<void> {
  const rows = await prisma.stock.findMany();
  const stocks: Stock[] = rows.map((r) => ({
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
              data: { recommendationRank: labelToRank(rec.label) },
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

// route.ts의 메모리 변수(let isRunning) 대신 DB row로 락을 관리합니다.
// Vercel 서버리스 인스턴스마다 메모리가 따로 놀아서 메모리 변수로는 실제
// 동시 실행을 못 막았어요(2026-08-24 세션, 프로덕션에서 MySQL "Lock wait
// timeout" 에러로 발견 — 두 refreshUniverse()가 진짜 동시에 같은 테이블에
// upsert하다가 난 에러). updateMany의 WHERE 조건에 맞는 row가 있어야만
// UPDATE가 성공하는 걸 이용한 원자적 조건부 획득이라, 여러 인스턴스가
// 동시에 호출해도 딱 하나만 count===1을 받습니다.
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
        where: { ticker: { notIn: succeeded } },
      });
      removedCount = removed.count;

      console.log("업종 평균 대비 등급(완전충족/조건충족/보류/주의) 계산 중...");
      await updateRecommendationRanks();
    }

    return {
      ok: true,
      total: ranking.length,
      succeeded: succeeded.length,
      removed: removedCount,
      message: `${succeeded.length}/${ranking.length}개 종목을 갱신했어요.`,
    };
  } finally {
    await releaseRefreshLock();
  }
}
