import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { STOCKS, type Stock } from "@/lib/stocks";
import { passesScreener, screenerScore } from "@/lib/screener";
import { UNIVERSE_PAGE_SIZE, type SortDirection, type SortField } from "@/lib/constants";
import type { Prisma } from "@prisma/client";

// ---------------------------------------------------------------------------
// react-query의 useInfiniteQuery가 호출하는 진짜 서버 사이드 페이지네이션
// 라우트입니다. /api/universe(전체 한번에)와 달리 여기는 20개씩 잘라서
// 내려주고, 검색어/업종/스크리너 통과 여부 필터/정렬까지 DB 쿼리 단에서
// 처리해요 (프론트에서 200개 다 받아놓고 자르는 "가짜" 페이지네이션이 아님).
//
// 쿼리 파라미터: page(0부터), pageSize(기본 20, 최대 50), screenerOnly(1이면
// 스크리너 통과 종목만), sector(업종 필터), q(이름/코드 검색어),
// sort(screener|name|price|chg, 안 주면 기본 순서), dir(asc|desc)
// ---------------------------------------------------------------------------

const DEFAULT_PAGE_SIZE = UNIVERSE_PAGE_SIZE;
const MAX_PAGE_SIZE = 50;

function toOrderBy(sort: SortField | null, dir: SortDirection): Prisma.StockOrderByWithRelationInput[] {
  switch (sort) {
    case "screener":
      // 스크리너 점수가 같으면 최근에 갱신된(=최신 데이터인) 종목을 우선.
      return [{ screenerScore: dir }, { updatedAt: "desc" }];
    case "name":
      return [{ name: dir }];
    case "price":
      return [{ price: dir }];
    case "chg":
      return [{ chg: dir }];
    case "cap":
      return [{ capEok: dir }];
    default:
      return [{ capEok: "desc" }]; // 정렬 안 한 기본값 = 지금까지의 유니버스 순서
  }
}

// STOCKS 샘플 데이터엔 capEok(숫자) 필드가 없고 표시용 문자열(cap, 예:
// "2,069조원")만 있어서, 정렬하려면 숫자를 다시 뽑아내야 함. DB 경로(위
// toOrderBy)는 capEok 컬럼을 직접 쓰니 이 파싱이 필요 없음 — 샘플 폴백
// (DB가 비어있을 때)에서만 씀.
function parseCapEok(cap: string): number {
  const n = Number(cap.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function sortSample(stocks: Stock[], sort: SortField | null, dir: SortDirection): Stock[] {
  const copy = [...stocks];
  const mul = dir === "asc" ? 1 : -1;
  switch (sort) {
    case "screener":
      return copy.sort((a, b) => mul * (screenerScore(a) - screenerScore(b)));
    case "name":
      return copy.sort((a, b) => mul * a.name.localeCompare(b.name, "ko"));
    case "price":
      return copy.sort((a, b) => mul * (a.price - b.price));
    case "chg":
      return copy.sort((a, b) => mul * (a.chg - b.chg));
    case "cap":
      return copy.sort((a, b) => mul * (parseCapEok(a.cap) - parseCapEok(b.cap)));
    default:
      return copy;
  }
}

function toStock(r: {
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
  };
}

// DB(Watchlist 배치 결과)가 아직 비어있을 때(맨 처음 실행이라 refresh-universe를
// 안 돌린 경우)를 위한 대체 경로. 샘플 10종목 안에서만 필터링하고, 페이지네이션은
// 의미가 없을 만큼 적은 수라 첫 페이지에 다 담아 보냅니다.
function sampleFallback(
  screenerOnly: boolean,
  sector: string | null,
  q: string | null,
  sort: SortField | null,
  dir: SortDirection,
): Stock[] {
  const filtered = STOCKS.filter((s) => {
    if (screenerOnly && !passesScreener(s)) return false;
    if (sector && sector !== "전체" && s.sector !== sector) return false;
    if (q && !s.name.includes(q) && !s.ticker.includes(q)) return false;
    return true;
  });
  return sortSample(filtered, sort, dir);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Math.max(0, Number(searchParams.get("page") ?? "0") || 0);
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(searchParams.get("pageSize") ?? String(DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE),
  );
  const screenerOnly = searchParams.get("screenerOnly") === "1";
  const sector = searchParams.get("sector");
  const q = searchParams.get("q")?.trim() || null;
  const sortParam = searchParams.get("sort");
  const sort: SortField | null =
    sortParam === "screener" ||
    sortParam === "name" ||
    sortParam === "price" ||
    sortParam === "chg" ||
    sortParam === "cap"
      ? sortParam
      : null;
  const dirParam = searchParams.get("dir");
  const dir: SortDirection = dirParam === "asc" ? "asc" : "desc";

  const where: Prisma.StockWhereInput = {};
  if (screenerOnly) where.screenerOk = true;
  if (sector && sector !== "전체") where.sector = sector;
  if (q) {
    where.OR = [{ name: { contains: q } }, { ticker: { contains: q } }];
  }

  try {
    const [rows, total] = await Promise.all([
      prisma.stock.findMany({
        where,
        orderBy: toOrderBy(sort, dir),
        skip: page * pageSize,
        take: pageSize,
      }),
      prisma.stock.count({ where }),
    ]);

    if (total === 0 && page === 0) {
      const sample = sampleFallback(screenerOnly, sector, q, sort, dir);
      return NextResponse.json({
        stocks: sample,
        page: 0,
        pageSize,
        total: sample.length,
        hasMore: false,
        status: "sample",
      });
    }

    return NextResponse.json({
      stocks: rows.map(toStock),
      page,
      pageSize,
      total,
      hasMore: (page + 1) * pageSize < total,
      status: "db",
    });
  } catch (e) {
    console.error("[Universe/paged] 조회 실패:", e instanceof Error ? e.message : e);
    return NextResponse.json(
      { stocks: [], page, pageSize, total: 0, hasMore: false, status: "sample" },
      { status: 200 },
    );
  }
}
