import { cache } from "react";
import { prisma } from "./db";
import { getStock as getSampleStock, type Stock } from "./stocks";
import { rowToStock } from "./universe";

// ---------------------------------------------------------------------------
// 서버 전용: 종목 상세(/stock/[ticker])를 서버에서 렌더링하기 위한 데이터.
// 종목 한 개와 같은 업종 종목만 DB에서 읽어 첫 HTML에 담는다
// (크롤러가 실제 값을 보고, LCP·CLS가 클라이언트 데이터 도착에 묶이지 않도록).
//
// 결과 구분:
//  - found      : DB에 있는 종목 (stock + 같은 업종 종목)
//  - not-found  : DB는 정상인데 없는 종목, 샘플에도 없음 → 404
//  - unavailable: DB 조회 실패 또는 DB가 비어 있음(샘플 모드) → 클라이언트가 채우게
//                 두고 존재 여부를 단정하지 않는다(일시 장애로 404가 캐시되지 않게)
// ---------------------------------------------------------------------------

export type StockPageData =
  | { kind: "found"; stock: Stock; sectorStocks: Stock[]; updatedAt: Date }
  | { kind: "not-found" }
  | { kind: "unavailable" };

// generateMetadata와 페이지가 같은 요청에서 두 번 조회하지 않게 합니다.
export const getStockPageData = cache(
  async (ticker: string): Promise<StockPageData> => {
    try {
      const row = await prisma.stock.findUnique({ where: { ticker } });
      if (!row) {
        // 샘플 종목은 DB가 비어 있을 때 화면에 보이던 것이라 404로 만들지 않습니다.
        if (getSampleStock(ticker)) return { kind: "unavailable" };
        const total = await prisma.stock.count();
        return total > 0 ? { kind: "not-found" } : { kind: "unavailable" };
      }
      const sectorRows = await prisma.stock.findMany({
        where: { sector: row.sector },
        orderBy: { capEok: "desc" },
      });
      return {
        kind: "found",
        stock: rowToStock(row),
        sectorStocks: sectorRows.map(rowToStock),
        updatedAt: row.updatedAt,
      };
    } catch (e) {
      console.error(
        "[StockPage] DB 조회 실패, 클라이언트 렌더링으로 대체합니다:",
        e instanceof Error ? e.message : e,
      );
      return { kind: "unavailable" };
    }
  },
);

// sitemap / generateStaticParams용: 전체 종목 코드와 최종 갱신 시각.
export async function listStockTickers(): Promise<
  { ticker: string; updatedAt: Date }[]
> {
  try {
    return await prisma.stock.findMany({
      select: { ticker: true, updatedAt: true },
      orderBy: { capEok: "desc" },
    });
  } catch (e) {
    console.error(
      "[StockPage] 종목 목록 조회 실패:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
