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
import { formatMarketCapEok } from "./stocks";
import { passesScreener, screenerScore } from "./screener";

const UNIVERSE_SIZE = 200;
// kis.ts 내부에 전역 rate limiter(초당 6건)가 있어서 여기 동시성은 그렇게
// 중요하지 않지만, 너무 크게 잡으면 큐만 길어지고 로그가 뒤섞이니 적당히 낮게.
const CONCURRENCY = 4;
const DEFAULT_SECTOR = "기타";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  await prisma.stock.upsert({
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
  });

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
  }

  return {
    ok: true,
    total: ranking.length,
    succeeded: succeeded.length,
    removed: removedCount,
    message: `${succeeded.length}/${ranking.length}개 종목을 갱신했어요.`,
  };
}
