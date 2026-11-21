import { prisma } from "./db";
import { STOCKS, type Stock } from "./stocks";

// ---------------------------------------------------------------------------
// 서버 전용: 배치 스크립트(scripts/refresh-universe.ts)가 채워둔 DB 유니버스를
// 읽어옵니다. DB가 비어있거나(아직 배치를 안 돌렸거나) 연결에 실패하면 화면이
// 깨지지 않도록 stocks.ts의 10종목 샘플로 조용히 대체합니다.
// ---------------------------------------------------------------------------

export type UniverseResult = {
  stocks: Stock[];
  status: "db" | "sample";
  updatedAt: string | null;
};

// DB 행 → 화면용 Stock. 종목 상세 페이지(서버 렌더링)도 같은 변환을 쓰도록
// export 합니다.
export function rowToStock(r: {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  cap: string;
  per: number | null;
  pbr: number | null;
  hi: number;
  lo: number;
  ma5over20: boolean;
  volRatio: number;
  rsi: number;
  macdRebound: boolean;
}): Stock {
  return {
    ticker: r.ticker,
    name: r.name,
    sector: r.sector,
    price: r.price,
    chg: r.chg,
    cap: r.cap,
    per: r.per ?? 0,
    pbr: r.pbr ?? null,
    hi: r.hi,
    lo: r.lo,
    ma5over20: r.ma5over20,
    volRatio: r.volRatio,
    rsi: r.rsi,
    macdRebound: r.macdRebound,
  };
}

export async function getUniverse(): Promise<UniverseResult> {
  try {
    const rows = await prisma.stock.findMany({ orderBy: { capEok: "desc" } });
    if (rows.length === 0) {
      return { stocks: STOCKS, status: "sample", updatedAt: null };
    }

    const stocks: Stock[] = rows.map(rowToStock);

    const latest = rows.reduce<Date | null>(
      (acc, r) => (!acc || r.updatedAt > acc ? r.updatedAt : acc),
      null,
    );

    return { stocks, status: "db", updatedAt: latest ? latest.toISOString() : null };
  } catch (e) {
    console.error(
      "[Universe] DB 조회 실패, 샘플 데이터로 대체합니다:",
      e instanceof Error ? e.message : e,
    );
    return { stocks: STOCKS, status: "sample", updatedAt: null };
  }
}
