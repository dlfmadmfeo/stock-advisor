// ---------------------------------------------------------------------------
// 한국투자증권 KIS Open API 클라이언트 (서버 전용).
//
// 이 파일은 이 세션에서 KIS API를 직접 호출해 검증하지 못했습니다 (샌드박스
// 네트워크 제약). 공개된 KIS 문서 스펙대로 작성했지만, 실제 응답 필드명이나
// 제약(호출 빈도 제한, 토큰 재발급 주기 등)은 준희님이 `pnpm dev`로 직접
// 확인하면서 다듬어야 할 수 있어요. 에러가 나면 그대로 알려주세요.
//
// 필요 환경변수 (.env.local):
//   KIS_APP_KEY, KIS_APP_SECRET, KIS_ENV ("real" | "virtual")
// ---------------------------------------------------------------------------

const BASE_URL =
  process.env.KIS_ENV === "virtual"
    ? "https://openapivts.koreainvestment.com:29443"
    : "https://openapi.koreainvestment.com:9443";

const APP_KEY = process.env.KIS_APP_KEY;
const APP_SECRET = process.env.KIS_APP_SECRET;

export function kisConfigured(): boolean {
  return Boolean(APP_KEY && APP_SECRET);
}

export type DailyBar = {
  date: string; // yyyymmdd
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

// ---------------------------------------------------------------------------
// OAuth 토큰 발급 + 캐싱
// KIS는 토큰 발급 빈도 제한이 있어서(분당 1회 수준) 프로세스 메모리에 캐싱합니다.
// 서버리스 환경(Vercel 등)에서는 콜드스타트마다 새로 발급되니 참고하세요.
// ---------------------------------------------------------------------------
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error(
      "KIS_APP_KEY / KIS_APP_SECRET 환경변수가 없어요 (.env.local 확인)",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }

  const res = await fetch(`${BASE_URL}/oauth2/tokenP`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      appkey: APP_KEY,
      appsecret: APP_SECRET,
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `KIS 토큰 발급 실패 (${res.status}): ${text.slice(0, 300)}`,
    );
  }

  const json = await res.json();
  const token = json?.access_token;
  const expiresIn = Number(json?.expires_in ?? 86400); // 초 단위, 보통 24시간
  if (!token) throw new Error("KIS 토큰 응답에 access_token이 없어요");

  cachedToken = { token, expiresAt: Date.now() + expiresIn * 1000 };
  console.log(
    `KIS 토큰 발급 완료 (만료: ${new Date(cachedToken.expiresAt).toISOString()})`,
  );
  return token;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// 전역 rate limiter — kis.ts의 모든 호출이 이 큐를 거칩니다.
// 문서상 한도는 초당 20건이지만, 여러 곳(배치 스크립트의 병렬 종목 처리 등)에서
// 동시에 호출하면 순간적으로 몰려서 EGW00201(초당 거래건수 초과)이 자주 났기
// 때문에 실제로는 훨씬 보수적으로(초당 6건) 제한합니다.
// ---------------------------------------------------------------------------
const MAX_REQUESTS_PER_SECOND = 6;
const requestTimestamps: number[] = [];
let limiterQueue: Promise<void> = Promise.resolve();

function acquireSlot(): Promise<void> {
  const next = limiterQueue.then(async () => {
    for (;;) {
      const now = Date.now();
      while (requestTimestamps.length && now - requestTimestamps[0] >= 1000) {
        requestTimestamps.shift();
      }
      if (requestTimestamps.length < MAX_REQUESTS_PER_SECOND) {
        requestTimestamps.push(now);
        return;
      }
      await sleep(1000 / MAX_REQUESTS_PER_SECOND);
    }
  });
  limiterQueue = next.catch(() => {});
  return next;
}

async function kisGet(
  path: string,
  trId: string,
  params: Record<string, string>,
) {
  const { json } = await kisGetRaw(path, trId, params);
  return json;
}

// 순위분석류 API는 페이지가 여러 장으로 나뉘어서(tr_cont 헤더) 이어받아야 하므로
// 응답 헤더까지 그대로 반환하는 저수준 버전을 따로 둡니다.
async function kisGetRaw(
  path: string,
  trId: string,
  params: Record<string, string>,
  trCont: string = "",
  attempt: number = 0,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ json: any; trCont: string }> {
  await acquireSlot();

  const token = await getAccessToken();
  const url = new URL(BASE_URL + path);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      authorization: `Bearer ${token}`,
      appkey: APP_KEY as string,
      appsecret: APP_SECRET as string,
      tr_id: trId,
      tr_cont: trCont,
      custtype: "P",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const rateLimited = text.includes("EGW00201");
    if (rateLimited && attempt < 5) {
      const backoffMs = 400 * (attempt + 1);
      await sleep(backoffMs);
      return kisGetRaw(path, trId, params, trCont, attempt + 1);
    }
    throw new Error(
      `KIS API 호출 실패 (${res.status}) ${path}: ${text.slice(0, 300)}`,
    );
  }
  const json = await res.json();
  return { json, trCont: res.headers.get("tr_cont") ?? "" };
}

function yyyymmdd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

// ---------------------------------------------------------------------------
// 현재가 조회 (주식현재가 시세) — 가격/등락률뿐 아니라 PER, 시가총액,
// 52주 최고/최저도 이 응답 하나에 같이 들어있어서 함께 뽑아 씁니다.
// ---------------------------------------------------------------------------
export type QuoteDetail = {
  price: number;
  chg: number;
  per: number | null;
  marketCapEok: number | null; // 억원 단위 (KIS hts_avls 필드)
  w52High: number | null;
  w52Low: number | null;
  sector: string | null; // KIS 업종 한글명 (bstp_kor_isnm)
};

export async function fetchQuoteDetail(ticker: string): Promise<QuoteDetail | null> {
  try {
    const json = await kisGet(
      "/uapi/domestic-stock/v1/quotations/inquire-price",
      "FHKST01010100",
      {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: ticker,
      },
    );
    const out = json?.output;
    const price = Number(out?.stck_prpr);
    const chg = Number(out?.prdy_ctrt); // 전일 대비 등락률(%)
    if (!Number.isFinite(price)) return null;

    const per = Number(out?.per);
    const marketCap = Number(out?.hts_avls); // 억원
    const w52High = Number(out?.w52_hgpr);
    const w52Low = Number(out?.w52_lwpr);
    const sector = typeof out?.bstp_kor_isnm === "string" && out.bstp_kor_isnm.trim()
      ? out.bstp_kor_isnm.trim()
      : null;

    return {
      price: Math.round(price),
      chg: Number.isFinite(chg) ? +chg.toFixed(1) : 0,
      per: Number.isFinite(per) && per > 0 ? +per.toFixed(1) : null,
      marketCapEok: Number.isFinite(marketCap) && marketCap > 0 ? marketCap : null,
      w52High: Number.isFinite(w52High) && w52High > 0 ? Math.round(w52High) : null,
      w52Low: Number.isFinite(w52Low) && w52Low > 0 ? Math.round(w52Low) : null,
      sector,
    };
  } catch (e) {
    console.error(`[KIS] ${ticker} 현재가/PER/시가총액 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// 하위 호환용 (가격만 필요한 곳에서 사용)
export async function fetchCurrentPrice(ticker: string): Promise<{ price: number; chg: number } | null> {
  const detail = await fetchQuoteDetail(ticker);
  return detail ? { price: detail.price, chg: detail.chg } : null;
}

// ---------------------------------------------------------------------------
// 일봉 조회 (최근 ~140일, MA5/MA20/거래량비율/RSI14 계산용)
// ---------------------------------------------------------------------------
export async function fetchDailyBars(
  ticker: string,
): Promise<DailyBar[] | null> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 140);

    const json = await kisGet(
      "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
      "FHKST03010100",
      {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: ticker,
        FID_INPUT_DATE_1: yyyymmdd(start),
        FID_INPUT_DATE_2: yyyymmdd(end),
        FID_PERIOD_DIV_CODE: "D",
        FID_ORG_ADJ_PRC: "0",
      },
    );
    const rows = json?.output2;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // KIS는 보통 최신 날짜가 배열 앞쪽 — 계산 편하게 오래된 순으로 정렬
    const bars: DailyBar[] = rows
      .map((r: Record<string, string>) => ({
        date: r.stck_bsop_date,
        open: Number(r.stck_oprc),
        high: Number(r.stck_hgpr),
        low: Number(r.stck_lwpr),
        close: Number(r.stck_clpr),
        volume: Number(r.acml_vol),
      }))
      .filter((b: DailyBar) => Number.isFinite(b.close) && b.close > 0)
      .sort((a: DailyBar, b: DailyBar) => a.date.localeCompare(b.date));

    return bars.length ? bars : null;
  } catch (e) {
    console.error(`[KIS] ${ticker} 일봉 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 주봉 조회 (52주 최고/최저 계산용, 약 1년치를 한 번에 받기 위해 주봉 사용)
// ---------------------------------------------------------------------------
export async function fetchWeeklyBars(
  ticker: string,
): Promise<DailyBar[] | null> {
  try {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - 370);

    const json = await kisGet(
      "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
      "FHKST03010100",
      {
        FID_COND_MRKT_DIV_CODE: "J",
        FID_INPUT_ISCD: ticker,
        FID_INPUT_DATE_1: yyyymmdd(start),
        FID_INPUT_DATE_2: yyyymmdd(end),
        FID_PERIOD_DIV_CODE: "W",
        FID_ORG_ADJ_PRC: "0",
      },
    );
    const rows = json?.output2;
    if (!Array.isArray(rows) || rows.length === 0) return null;

    const bars: DailyBar[] = rows
      .map((r: Record<string, string>) => ({
        date: r.stck_bsop_date,
        open: Number(r.stck_oprc),
        high: Number(r.stck_hgpr),
        low: Number(r.stck_lwpr),
        close: Number(r.stck_clpr),
        volume: Number(r.acml_vol),
      }))
      .filter(
        (b: DailyBar) => Number.isFinite(b.high) && Number.isFinite(b.low),
      );

    return bars.length ? bars : null;
  } catch (e) {
    console.error(`[KIS] ${ticker} 주봉 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}

// ---------------------------------------------------------------------------
// 시가총액 상위 순위 (순위분석 > 국내주식 시가총액 상위, tr_id FHPST01740000)
// fid_input_iscd="2001"을 쓰면 KIS가 "코스피200" 구성종목 중 시가총액순으로
// 내려줍니다.
//
// 실측 확인(2026-08-02): 이 엔드포인트는 tr_cont를 "N"으로 보내 이어 요청해도
// 항상 같은 상위 30건만 돌려줍니다 — 계정/문서상 제약이 아니라 이 tr_id 자체가
// 30건 초과 페이지네이션을 지원하지 않는 것으로 보입니다. 그래서 지금은 상위
// 30개만 유니버스로 씁니다 (코스피200 "전체"가 아니라 "코스피200 중 시총 상위
// 30"). 전체 ~200개를 다 받으려면 종목마스터 파일(전 종목 리스트) + 종목별
// 개별 시세 조회 방식으로 바꿔야 하는데, 이건 나중에 필요해지면 다시 다룹니다.
// ---------------------------------------------------------------------------
export type RankedStock = {
  ticker: string;
  name: string;
  rank: number;
  price: number;
  chg: number; // 전일 대비율(%)
  capEok: number; // 억원 단위
};

export async function fetchMarketCapRanking(
  scope: "kospi200" | "kospi" | "kosdaq" | "all" = "kospi200",
  maxCount = 200,
): Promise<RankedStock[]> {
  const iscdByScope: Record<typeof scope, string> = {
    kospi200: "2001",
    kospi: "0001",
    kosdaq: "1001",
    all: "0000",
  };

  const params = {
    fid_input_price_2: "",
    fid_cond_mrkt_div_code: "J",
    fid_cond_scr_div_code: "20174",
    fid_div_cls_code: "0", // 0: 전체 (보통주+우선주)
    fid_input_iscd: iscdByScope[scope],
    fid_trgt_cls_code: "0",
    fid_trgt_exls_cls_code: "0",
    fid_input_price_1: "",
    fid_vol_cnt: "",
  };

  const results: RankedStock[] = [];
  const seenTickers = new Set<string>();
  let trCont = "";
  let page = 0;
  const maxPages = 20; // 안전장치 (200종목 / 페이지당 ~30건 기준으로 넉넉히)

  try {
    while (page < maxPages && results.length < maxCount) {
      const { json, trCont: nextTrCont } = await kisGetRaw(
        "/uapi/domestic-stock/v1/ranking/market-cap",
        "FHPST01740000",
        params,
        trCont,
      );

      const rows = json?.output;
      if (!Array.isArray(rows) || rows.length === 0) break;

      let newCount = 0;
      for (const r of rows) {
        const ticker = String(r.mksc_shrn_iscd ?? "").trim();
        const name = String(r.hts_kor_isnm ?? "").trim();
        const price = Number(r.stck_prpr);
        const chg = Number(r.prdy_ctrt);
        const capEok = Number(r.stck_avls);
        if (!ticker || !Number.isFinite(price)) continue;
        if (seenTickers.has(ticker)) continue; // 이미 받은 종목 — 다음 페이지가 실제로 안 넘어간 경우 대비
        seenTickers.add(ticker);
        newCount += 1;
        results.push({
          ticker,
          name,
          rank: Number(r.data_rank) || results.length + 1,
          price: Math.round(price),
          chg: Number.isFinite(chg) ? +chg.toFixed(1) : 0,
          capEok: Number.isFinite(capEok) ? capEok : 0,
        });
      }

      page += 1;
      console.log(
        `[KIS] 시가총액 순위 페이지 ${page}: ${rows.length}건 중 신규 ${newCount}건 (누적 ${results.length}, 응답 tr_cont="${nextTrCont}")`,
      );

      // 이 API는 응답 tr_cont 헤더가 신뢰할 만한 continuation 신호를 안 주는 걸로
      // 보여서(항상 빈 문자열), 이번 페이지에 새 종목이 하나도 없었으면(=같은 30개를
      // 반복해서 받은 것) 더 이상 페이지가 없다고 보고 중단합니다.
      if (newCount === 0) break;
      trCont = "N";
    }
  } catch (e) {
    console.error(
      `[KIS] 시가총액 순위(${scope}) 조회 실패:`,
      e instanceof Error ? e.message : e,
    );
  }

  return results.slice(0, maxCount);
}
