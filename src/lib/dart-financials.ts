// ---------------------------------------------------------------------------
// 종목별 연도별 재무 정보 — DART(전자공시) 단일회사 전체 재무제표 기반 (서버 전용).
//
// 원래는 KIS 재무 API(finance/income-statement, finance/financial-ratio)를
// 썼는데, 2026-11 들어 KIS 쪽에서 재무비율 계열 경로가 404, 손익계산서가
// OPSQ0001(입력값 오류)을 돌려주기 시작해서(공식 예제대로 호출해도 동일) DART로
// 옮겼어요. DART는 금융감독원 공식 공시 데이터라 KIS 개편과 무관하게 안정적이고,
// 이미 DART_API_KEY를 공시 알림(dart.ts)에 쓰고 있습니다.
//
// 흐름:
//   1. 종목코드(6자리) → DART 회사코드(8자리): corpCode.xml(zip)을 한 번 받아
//      상장사만 추려 메모리에 24시간 캐시. (ETF는 회사코드가 없어서 "정보 없음")
//   2. fnlttSinglAcntAll(사업보고서)을 부르면 당기/전기/전전기 3개 연도가 한 번에
//      오기 때문에, 호출 2번(최근 + 3년 전)으로 최대 6개 연도를 만듭니다.
//   3. 매출/영업이익/순이익은 억원으로, ROE·부채비율·증가율은 계산해서 채웁니다.
//      DART는 비율을 따로 주지 않아서(KIS와 다른 점) 여기서 직접 계산해요.
//
// 필요 환경변수 (.env.local): DART_API_KEY
// ---------------------------------------------------------------------------

import AdmZip from "adm-zip";

const BASE_URL = "https://opendart.fss.or.kr/api";
const API_KEY = process.env.DART_API_KEY;

export function dartFinancialsConfigured(): boolean {
  return Boolean(API_KEY);
}

export type FinancialYear = {
  year: string; // 결산 년월 (예: "202412") — 화면은 앞 4자리만 씀
  // 억원 단위 (formatMarketCapEok가 이 단위를 기대함).
  revenue: number | null;
  operatingProfit: number | null;
  netIncome: number | null;
  opMarginPct: number | null; // 영업이익률(%) = 영업이익/매출액
  roe: number | null; // 지배주주 순이익 / 지배주주 자본(기말) — 기말 자본 기준 계산
  debtRatio: number | null; // 부채총계 / 자본총계
  eps: number | null; // 기본주당이익(원)
  bps: number | null; // DART 재무제표에 발행주식수가 없어서 제공하지 않음
  revenueGrowthPct: number | null; // 전년 대비(%)
  opGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
};

// ---------------------------------------------------------------------------
// 1) 종목코드 → 회사코드
// ---------------------------------------------------------------------------
// corpCode.xml은 <list> 블록 수만 개짜리 큰 파일(압축 3.6MB / 원문 29MB)이라
// 정규식으로 상장사(stock_code가 비어있지 않은 것)만 뽑습니다.
export function parseCorpCodeXml(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  // <list> 블록 하나씩 따로 봅니다. 비상장사는 stock_code가 비어 있는데, 블록을
  // 가로질러 한 번에 매칭하면 비상장사의 회사코드가 다음 상장사의 종목코드와
  // 잘못 짝지어질 수 있어요.
  const blockRe = /<list>([\s\S]*?)<\/list>/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(xml))) {
    const body = block[1];
    const stock = /<stock_code>\s*(\d{6})\s*<\/stock_code>/.exec(body);
    if (!stock) continue;
    const corp = /<corp_code>(\d{8})<\/corp_code>/.exec(body);
    if (corp) map.set(stock[1], corp[1]);
  }
  return map;
}

const CORP_MAP_TTL_MS = 24 * 60 * 60 * 1000;
let corpMap: { map: Map<string, string>; at: number } | null = null;
let corpMapInFlight: Promise<Map<string, string>> | null = null;

async function loadCorpMap(): Promise<Map<string, string>> {
  if (corpMap && Date.now() - corpMap.at < CORP_MAP_TTL_MS) return corpMap.map;
  if (corpMapInFlight) return corpMapInFlight;

  corpMapInFlight = (async () => {
    const res = await fetch(`${BASE_URL}/corpCode.xml?crtfc_key=${API_KEY}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`DART 회사코드 파일 다운로드 실패 (${res.status})`);
    const buf = Buffer.from(await res.arrayBuffer());
    // 키 오류 등이면 zip이 아니라 JSON/XML 에러 본문이 와요.
    const zip = (() => {
      try {
        return new AdmZip(buf);
      } catch {
        throw new Error(`DART 회사코드 응답이 zip이 아니에요: ${buf.toString("utf8", 0, 120)}`);
      }
    })();
    const entry = zip.getEntries().find((e) => e.entryName.toLowerCase().endsWith(".xml"));
    if (!entry) throw new Error("회사코드 zip 안에서 xml을 찾지 못했어요.");
    const map = parseCorpCodeXml(entry.getData().toString("utf8"));
    if (map.size === 0) throw new Error("회사코드 xml에서 상장사를 하나도 못 찾았어요(형식이 바뀌었을 수 있어요).");
    corpMap = { map, at: Date.now() };
    return map;
  })();

  try {
    return await corpMapInFlight;
  } finally {
    corpMapInFlight = null;
  }
}

// ---------------------------------------------------------------------------
// 2) DART 재무제표 호출
// ---------------------------------------------------------------------------
export type DartAccountRow = {
  sj_div?: string; // BS 재무상태표 / IS 손익계산서 / CIS 포괄손익계산서 / CF / SCE
  account_id?: string;
  account_nm?: string;
  thstrm_amount?: string; // 당기
  frmtrm_amount?: string; // 전기
  bfefrmtrm_amount?: string; // 전전기
};

type FsDiv = "CFS" | "OFS"; // 연결 / 별도

// 데이터가 없으면(status 013) 빈 배열, 그 밖의 오류(키 오류, 한도 초과 등)는 throw.
async function fetchStatement(
  corpCode: string,
  bsnsYear: number,
  fsDiv: FsDiv,
): Promise<DartAccountRow[]> {
  const url = new URL(`${BASE_URL}/fnlttSinglAcntAll.json`);
  url.searchParams.set("crtfc_key", API_KEY as string);
  url.searchParams.set("corp_code", corpCode);
  url.searchParams.set("bsns_year", String(bsnsYear));
  url.searchParams.set("reprt_code", "11011"); // 사업보고서(연간)
  url.searchParams.set("fs_div", fsDiv);

  const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`DART 재무제표 호출 실패 (${res.status})`);
  const json = (await res.json()) as { status?: string; message?: string; list?: DartAccountRow[] };
  if (json.status === "013") return [];
  if (json.status !== "000") {
    throw new Error(`DART 재무제표 오류 (${json.status}): ${json.message ?? ""}`);
  }
  return json.list ?? [];
}

// ---------------------------------------------------------------------------
// 3) 계정 추출 + 연도별 레코드 조립 (순수 함수 — tests/dart-financials.test.ts)
// ---------------------------------------------------------------------------
type RawYear = {
  revenue: number | null; // 원
  operatingProfit: number | null;
  netIncome: number | null;
  netIncomeOwners: number | null;
  equity: number | null;
  equityOwners: number | null;
  liabilities: number | null;
  eps: number | null; // 원(주당)
};

function parseAmount(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "" || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type Slot = "thstrm_amount" | "frmtrm_amount" | "bfefrmtrm_amount";
const SLOTS: Array<[Slot, number]> = [
  ["thstrm_amount", 0], // 당기 = 기준연도
  ["frmtrm_amount", -1], // 전기
  ["bfefrmtrm_amount", -2], // 전전기
];

// 같은 계정이 IS/CIS 여러 곳에 있을 수 있어서, 우선순위 순서로 첫 번째 일치만 씁니다.
function findRow(
  rows: DartAccountRow[],
  divs: string[],
  ids: string[],
  names: string[],
): DartAccountRow | undefined {
  for (const div of divs) {
    const inDiv = rows.filter((r) => r.sj_div === div);
    for (const id of ids) {
      const hit = inDiv.find((r) => r.account_id === id);
      if (hit) return hit;
    }
    for (const nm of names) {
      const hit = inDiv.find((r) => (r.account_nm ?? "").replace(/\s/g, "") === nm);
      if (hit) return hit;
    }
  }
  return undefined;
}

// 기준연도 한 번의 응답(3개 연도치)에서 연도별 원시값을 뽑습니다.
export function extractRawYears(rows: DartAccountRow[], baseYear: number): Map<number, RawYear> {
  const IS = ["IS", "CIS"];
  const picks = {
    // 금융지주 등은 매출액/영업이익 계정이 없어서 null로 남습니다(화면에서 "-").
    revenue: findRow(rows, IS, ["ifrs-full_Revenue", "ifrs_Revenue"], ["매출액", "수익(매출액)", "영업수익"]),
    operatingProfit: findRow(rows, IS, ["dart_OperatingIncomeLoss"], ["영업이익", "영업이익(손실)"]),
    netIncome: findRow(rows, IS, ["ifrs-full_ProfitLoss"], ["당기순이익", "당기순이익(손실)", "연결당기순이익"]),
    netIncomeOwners: findRow(rows, IS, ["ifrs-full_ProfitLossAttributableToOwnersOfParent"], []),
    equity: findRow(rows, ["BS"], ["ifrs-full_Equity"], ["자본총계"]),
    equityOwners: findRow(rows, ["BS"], ["ifrs-full_EquityAttributableToOwnersOfParent"], []),
    liabilities: findRow(rows, ["BS"], ["ifrs-full_Liabilities"], ["부채총계"]),
    eps: findRow(rows, IS, ["ifrs-full_BasicEarningsLossPerShare"], ["기본주당이익", "기본주당순이익"]),
  };

  const out = new Map<number, RawYear>();
  for (const [slot, offset] of SLOTS) {
    const year = baseYear + offset;
    const raw: RawYear = {
      revenue: parseAmount(picks.revenue?.[slot]),
      operatingProfit: parseAmount(picks.operatingProfit?.[slot]),
      netIncome: parseAmount(picks.netIncome?.[slot]),
      netIncomeOwners: parseAmount(picks.netIncomeOwners?.[slot]),
      equity: parseAmount(picks.equity?.[slot]),
      equityOwners: parseAmount(picks.equityOwners?.[slot]),
      liabilities: parseAmount(picks.liabilities?.[slot]),
      eps: parseAmount(picks.eps?.[slot]),
    };
    if (Object.values(raw).some((v) => v !== null)) out.set(year, raw);
  }
  return out;
}

const EOK = 100_000_000;
const round1 = (n: number) => Math.round(n * 10) / 10;
const toEok = (won: number | null) => (won === null ? null : Math.round(won / EOK));

function growthPct(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return round1(((cur - prev) / Math.abs(prev)) * 100);
}

// 연도별 원시값(여러 번 호출 결과 병합본) → 화면용 레코드(오래된 연도부터).
export function buildFinancialYears(raw: Map<number, RawYear>): FinancialYear[] {
  const ys = [...raw.keys()].sort((a, b) => a - b);
  const result: FinancialYear[] = [];

  for (const y of ys) {
    const cur = raw.get(y) as RawYear;
    const prev = raw.get(y - 1) ?? null;

    const ownersNet = cur.netIncomeOwners ?? cur.netIncome;
    const ownersEquity = cur.equityOwners ?? cur.equity;

    result.push({
      year: `${y}12`,
      revenue: toEok(cur.revenue),
      operatingProfit: toEok(cur.operatingProfit),
      netIncome: toEok(cur.netIncome),
      opMarginPct:
        cur.revenue !== null && cur.operatingProfit !== null && cur.revenue !== 0
          ? round1((cur.operatingProfit / cur.revenue) * 100)
          : null,
      roe:
        ownersNet !== null && ownersEquity !== null && ownersEquity > 0
          ? round1((ownersNet / ownersEquity) * 100)
          : null,
      debtRatio:
        cur.liabilities !== null && cur.equity !== null && cur.equity > 0
          ? round1((cur.liabilities / cur.equity) * 100)
          : null,
      eps: cur.eps,
      bps: null,
      revenueGrowthPct: growthPct(cur.revenue, prev?.revenue ?? null),
      opGrowthPct: growthPct(cur.operatingProfit, prev?.operatingProfit ?? null),
      netIncomeGrowthPct: growthPct(cur.netIncome, prev?.netIncome ?? null),
    });
  }

  // 표시할 값이 하나도 없는 연도는 뺍니다.
  return result.filter(
    (r) => r.revenue !== null || r.operatingProfit !== null || r.netIncome !== null,
  );
}

// ---------------------------------------------------------------------------
// 공개 함수. 반환값:
//   - 배열(비어있을 수 있음): 정상. 빈 배열은 ETF/신규상장처럼 "공시된 재무제표가 없음".
//   - null: 실제 실패(키 없음, DART 오류, 네트워크) — 라우트가 502로 응답.
// ---------------------------------------------------------------------------
export async function fetchFinancials(ticker: string): Promise<FinancialYear[] | null> {
  if (!API_KEY) return null;
  try {
    const corpCode = (await loadCorpMap()).get(ticker);
    if (!corpCode) return [];

    // 가장 최근 완결 사업연도부터 찾습니다. 1~3월엔 직전 연도 사업보고서가 아직
    // 안 나왔을 수 있어서 그땐 한 해 더 거슬러 올라가요. 연결(CFS) 우선, 없으면 별도(OFS).
    const thisYear = new Date().getFullYear();
    let base: number | null = null;
    let fsDiv: FsDiv = "CFS";
    let firstRows: DartAccountRow[] = [];
    search: for (const y of [thisYear - 1, thisYear - 2]) {
      for (const fs of ["CFS", "OFS"] as const) {
        const rows = await fetchStatement(corpCode, y, fs);
        if (rows.length) {
          base = y;
          fsDiv = fs;
          firstRows = rows;
          break search;
        }
      }
    }
    if (base === null) return [];

    const raw = extractRawYears(firstRows, base);

    // 한 번에 3개 연도가 오니까, 3년 전 기준으로 한 번 더 불러 최대 6개 연도로 만듭니다.
    // 이쪽 실패는 치명적이지 않아서(최근 3개년은 이미 있음) 로그만 남기고 진행해요.
    try {
      const olderRows = await fetchStatement(corpCode, base - 3, fsDiv);
      for (const [y, r] of extractRawYears(olderRows, base - 3)) {
        if (!raw.has(y)) raw.set(y, r);
      }
    } catch (e) {
      console.error(`[DART] ${ticker} 과거 재무제표 조회 실패(최근 3개년만 사용):`, e instanceof Error ? e.message : e);
    }

    return buildFinancialYears(raw);
  } catch (e) {
    console.error(`[DART] ${ticker} 재무정보 조회 실패:`, e instanceof Error ? e.message : e);
    return null;
  }
}
