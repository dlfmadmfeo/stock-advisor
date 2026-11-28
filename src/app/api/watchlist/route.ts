import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWatchlistItems } from "@/lib/watchlist-data";

// ---------------------------------------------------------------------------
// 로그인한 유저의 관심종목 목록 조회(GET). 세션이 없으면 401.
// 추가·삭제는 [ticker]/route.ts에서 처리한다.
//
// 조회 로직은 watchlist-data.ts에 두고, 서버 컴포넌트(app/watchlist/page.tsx)도
// 같은 함수를 직접 호출한다. SSR 중 자기 자신에게 fetch하면 쿠키가 실리지 않아
// 401이 나기 때문이다.
//
// Watchlist 테이블이 관심종목의 기준 데이터이고, Spring 서버는 이 목록을 KIS
// 웹소켓으로 구독만 한다. 여러 유저가 같은 종목을 담아도 구독은 하나로 합친다.
// ---------------------------------------------------------------------------

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  const items = await getWatchlistItems(user.id);
  return NextResponse.json({ items });
}
