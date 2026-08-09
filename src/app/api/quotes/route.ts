import { NextResponse } from "next/server";
import { formatMarketCapEok } from "@/lib/stocks";
import { kisConfigured, fetchDailyBars, fetchWeeklyBars, fetchQuoteDetail } from "@/lib/kis";
import { computeScreenerInputs } from "@/lib/indicators";
import { getUniverse } from "@/lib/universe";

// ---------------------------------------------------------------------------
// 서버 사이드 시세 프록시.
//
// 예전엔 이 라우트가 유니버스 전체(최대 200종목)를 매번 KIS에 다시 물어봤는데,
// 종목당 REST 호출 3번 x 전역 rate limiter(초당 6건) 때문에 페이지 최초 로드가
// 최악의 경우 1~2분씩 걸렸음(StatusPill이 그동안 "확인 중"으로 멈춰있었음).
//
// 근데 DB(Stock 테이블)에는 배치(refresh-universe)가 이미 계산해둔 지표가
// 그대로 들어있고, 관심종목은 stock-advisor-server가 실시간으로 갱신하고
// 있으니, 이 라우트에서 굳이 KIS를 또 부를 필요가 없음. 그래서 기본은
// DB 값을 그대로 반환하고, DB가 비어서 샘플 데이터로 대체된 경우에만
// (배치를 한 번도 안 돌린 상태) 소수 종목에 한해 KIS/Yahoo로 보강 조회함.
// ---------------------------------------------------------------------------

export const revalidate = 30;

type Quote = {
  price: number;
  chg: number;
  ma5over20?: boolean;
  volRatio?: number;
  rsi?: number;
  hi?: number;
  lo?: number;
  cap?: string;
  per?: number;
};

async function fetchFromKis(ticker: string): Promise<Quote | null> {
  const [daily, weekly, detail] = await Promise.all([
    fetchDailyBars(ticker),
    fetchWeeklyBars(ticker),
    fetchQuoteDetail(ticker),
  ]);
  if (!daily) return null;
  const inputs = computeScreenerInputs(daily, weekly ?? []);
  if (!inputs) return null;

  // inquire-price가 52주 고저를 직접 주면 그쪽이 더 정확하니 우선 사용,
  // 없으면 주봉에서 뽑은 값을 그대로 둡니다.
  const quote: Quote = { ...inputs };
  if (detail?.w52High) quote.hi = detail.w52High;
  if (detail?.w52Low) quote.lo = detail.w52Low;
  if (detail?.per) quote.per = detail.per;
  if (detail?.marketCapEok) quote.cap = formatMarketCapEok(detail.marketCapEok);

  return quote;
}

async function fetchFromYahoo(ticker: string): Promise<Quote | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}.KS?range=1d&interval=1d`,
      { signal: controller.signal, next: { revalidate: 30 } }
    );
    if (!res.ok) return null;
    const json = await res.json();
    const meta = json?.chart?.result?.[0]?.meta;
    if (!meta || typeof meta.regularMarketPrice !== "number") return null;
    const prevClose = meta.chartPreviousClose;
    const chg =
      typeof prevClose === "number" && prevClose > 0
        ? +(((meta.regularMarketPrice - prevClose) / prevClose) * 100).toFixed(1)
        : 0;
    return { price: Math.round(meta.regularMarketPrice), chg };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function GET() {
  const quotes: Record<string, Quote> = {};
  const useKis = kisConfigured();
  let kisSuccessCount = 0;

  const { stocks, status: universeStatus } = await getUniverse();

  if (universeStatus === "db") {
    // DB에 배치가 채워둔 값이 있으면 그대로 씀 — KIS 재호출 없음, 거의 즉시 응답.
    for (const s of stocks) {
      quotes[s.ticker] = {
        price: s.price,
        chg: s.chg,
        ma5over20: s.ma5over20,
        volRatio: s.volRatio,
        rsi: s.rsi,
        hi: s.hi,
        lo: s.lo,
        cap: s.cap,
        per: s.per,
      };
    }
    return NextResponse.json({ quotes, status: "live", source: "kis" });
  }

  // DB가 비어있어 샘플 종목(10개)으로 대체된 경우에만, 소수 종목이니 기존처럼
  // KIS(우선)/Yahoo(대체)로 직접 조회해서 실시간 배지를 보여줌.
  await Promise.allSettled(
    stocks.map(async (s) => {
      if (useKis) {
        const kisQuote = await fetchFromKis(s.ticker).catch((e) => {
          console.error(`[KIS] ${s.ticker} 스크리너 지표 계산 실패:`, e instanceof Error ? e.message : e);
          return null;
        });
        if (kisQuote) {
          quotes[s.ticker] = kisQuote;
          kisSuccessCount++;
          return;
        }
      }
      const yahooQuote = await fetchFromYahoo(s.ticker);
      if (yahooQuote) quotes[s.ticker] = yahooQuote;
    })
  );

  const status = Object.keys(quotes).length > 0 ? "live" : "sample";
  return NextResponse.json({
    quotes,
    status,
    source: useKis ? (kisSuccessCount > 0 ? "kis" : "yahoo-fallback") : "yahoo",
  });
}
