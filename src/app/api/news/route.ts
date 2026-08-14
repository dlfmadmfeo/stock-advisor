import { NextRequest, NextResponse } from "next/server";
import { fetchStockNews, naverNewsConfigured } from "@/lib/naver-news";

// ---------------------------------------------------------------------------
// 종목별 뉴스 프록시. 클라이언트에 NAVER_CLIENT_SECRET을 노출하면 안 되니까
// (브라우저에서 직접 네이버 API를 호출하면 시크릿이 그대로 노출됨) 이 서버
// 라우트를 거쳐서 호출합니다. /api/quotes와 같은 패턴.
//
// 사용법: GET /api/news?name=삼성전자
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name) {
    return NextResponse.json(
      { ok: false, message: "name 쿼리 파라미터가 필요해요 (예: ?name=삼성전자).", articles: [] },
      { status: 400 },
    );
  }

  if (!naverNewsConfigured()) {
    return NextResponse.json({
      ok: false,
      message: "NAVER_CLIENT_ID / NAVER_CLIENT_SECRET이 없어요 (.env.local 확인).",
      articles: [],
    });
  }

  const articles = await fetchStockNews(name, 8);
  if (articles === null) {
    return NextResponse.json({
      ok: false,
      message: "뉴스를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
      articles: [],
    });
  }

  return NextResponse.json({ ok: true, message: "", articles });
}
