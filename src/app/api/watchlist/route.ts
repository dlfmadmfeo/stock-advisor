import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { getWatchlistItems } from "@/lib/watchlist-data";

// ---------------------------------------------------------------------------
// 사용자가 화면에서 보는 관심종목 목록 조회(GET)만 여기서 처리합니다.
// 추가(POST)/삭제(DELETE)는 둘 다 티커를 URL 경로에 받는 게 일관돼서
// src/app/api/watchlist/[ticker]/route.ts로 옮겼습니다(2026-08-14 세션).
//
// 2026-08-18 세션: Watchlist가 유저별로 분리되면서(userId 컬럼 추가) 이
// 라우트도 로그인한 유저 것만 돌려줘야 함 — 세션 없으면 401. 실제 조회
// 로직(Stock 테이블 조인 등)은 src/lib/watchlist-data.ts로 옮겨서
// app/watchlist/page.tsx(서버 컴포넌트)도 같은 로직을 재사용합니다 — SSR
// 최초 렌더 때 이 라우트를 자기 자신에게 fetch하면 쿠키가 안 실려서 401이
// 나는 문제를 피하려고, 페이지가 이 함수를 직접 호출해서 initialData로
// 넘겨주는 방식으로 바꿨어요.
//
// DB(Watchlist 테이블)가 "무엇을 관심종목으로 뒀는지"의 소스 오브 트루스이고,
// stock-advisor-server(Spring)는 이 목록을 KIS 웹소켓으로 실시간 구독하는
// 역할만 합니다(유저 단위가 아니라 전체 종목 합쳐서 하나로 구독 — 여러
// 유저가 같은 종목을 담아도 구독은 하나).
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
