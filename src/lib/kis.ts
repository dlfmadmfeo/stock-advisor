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
// 진행 중인 토큰 발급 요청. refresh-universe가 종목을 CONCURRENCY(4)개씩
// 병렬 처리하고, 종목 하나당 daily/weekly/quote 3건을 또 동시에 부르다 보니
// (processTicker 참고) 캐시가 비어있는 상태(서버리스 콜드스타트 직후 등)에서
// 최대 12개 호출이 한꺼번에 getAccessToken()에 들어올 수 있었음. 그런데 이
// 함수가 매번 cachedToken만 보고 없으면 각자 /oauth2/tokenP를 따로 쐈어서,
// "분당 1회 수준"인 KIS 토큰 발급 제한에 걸려 그 중 1건만 성공하고 나머지는
// 실패 — 하필 유니버스 맨 앞(시총 최상위, 즉 삼성전자/SK하이닉스)이 첫
// 배치라 계속 스킵되는 원인이었음(2026-08-22 세션, 새로고침해도 삼성전자가
// DB에 안 들어오는 문제를 추적하다 발견). 진행 중인 요청을 여기 공유해서
// 동시 호출이 몰려도 실제 HTTP 요청은 1건만 나가게 함.
let inFlightTokenRequest: Promise<string> | null = null;

async function getAccessToken(): Promise<string> {
  if (!APP_KEY || !APP_SECRET) {
    throw new Error(
      "KIS_APP_KEY / KIS_APP_SECRET 환경변수가 없어요 (.env.local 확인)",
    );
  }
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  if (inFlightTokenRequest) return inFlightTokenRequest;

  inFlightTokenRequest = (async () => {
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
  })();

  try {
    return await inFlightTokenRequest;
  } finally {
    inFlightTokenRequest = null;
  }
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
  pbr: number | null; // KIS pbr 필드 — per과 같은 응답에 같이 들어있어서 추가 호출 없이 파싱만 함
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
    // ⚠️ 이 세션은 KIS를 직접 호출해 검증 못 했어요 — "pbr"이 실제 응답
    // 필드명이 맞는지 pnpm dev로 한 번 찍어보고, 다르면 여기만 고치면 됩니다.
    const pbr = Number(out?.pbr);
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
      pbr: Number.isFinite(pbr) && pbr > 0 ? +pbr.toFixed(2) : null,
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
// 장기 일봉 조회 (백테스트용, 최대 수년치).
//
// ⚠️ 이 세션은 KIS를 직접 호출해 검증 못 했어요. inquire-daily-itemchartprice는
// (커뮤니티 자료 기준) 한 번 호출에 날짜 범위를 아무리 넓게 줘도 최대 100건
// 안팎만 돌려주는 것으로 알려져 있어서, 여기서는 날짜 범위를 CHUNK_DAYS씩
// 잘라 여러 번 호출해서 이어붙입니다. 실제로 돌려보면 한 번에 더 많이/적게
// 올 수도 있는데, 그래도 날짜 기준으로 자르고 중복 제거(dedupe)를 하기 때문에
// 안전합니다 — 다만 예상보다 API 호출 수가 늘어나면(=속도 느려지면) 여기
// CHUNK_DAYS를 조정하면 됩니다.
// ---------------------------------------------------------------------------
const HISTORY_CHUNK_DAYS = 95;

export async function fetchDailyBarsHistory(
  ticker: string,
  days: number,
  endDate?: Date,
): Promise<DailyBar[] | null> {
  const byDate = new Map<string, DailyBar>();
  // endDate를 주면 "그 날짜까지" 과거 데이터를 받아옵니다 — 백테스트를 최근
  // 구간뿐 아니라 예전 특정 기간(예: 하락장/횡보장 구간)으로도 돌려볼 수
  // 있게 하기 위함입니다.
  let cursorEnd = endDate ?? new Date();
  let remaining = days;
  let emptyChunksInARow = 0;

  try {
    while (remaining > 0 && emptyChunksInARow < 2) {
      const chunkDays = Math.min(HISTORY_CHUNK_DAYS, remaining);
      const start = new Date(cursorEnd);
      start.setDate(start.getDate() - chunkDays);

      const json = await kisGet(
        "/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice",
        "FHKST03010100",
        {
          FID_COND_MRKT_DIV_CODE: "J",
          FID_INPUT_ISCD: ticker,
          FID_INPUT_DATE_1: yyyymmdd(start),
          FID_INPUT_DATE_2: yyyymmdd(cursorEnd),
          FID_PERIOD_DIV_CODE: "D",
          FID_ORG_ADJ_PRC: "0",
        },
      );
      const rows = json?.output2;
      const bars: DailyBar[] = Array.isArray(rows)
        ? rows
            .map((r: Record<string, string>) => ({
              date: r.stck_bsop_date,
              open: Number(r.stck_oprc),
              high: Number(r.stck_hgpr),
              low: Number(r.stck_lwpr),
              close: Number(r.stck_clpr),
              volume: Number(r.acml_vol),
            }))
            .filter((b: DailyBar) => Number.isFinite(b.close) && b.close > 0 && b.date)
        : [];

      if (bars.length === 0) {
        emptyChunksInARow += 1;
      } else {
        emptyChunksInARow = 0;
        for (const b of bars) byDate.set(b.date, b);
      }

      remaining -= chunkDays;
      cursorEnd = new Date(start);
      cursorEnd.setDate(cursorEnd.getDate() - 1);
    }
  } catch (e) {
    console.error(`[KIS] ${ticker} 장기 일봉 조회 실패:`, e instanceof Error ? e.message : e);
    if (byDate.size === 0) return null;
  }

  const bars = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  return bars.length ? bars : null;
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
