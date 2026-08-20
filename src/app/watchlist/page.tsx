import { redirect } from "next/navigation";
import { WatchlistScreen } from "@/components/mobile-screens";
import { getSessionUser } from "@/lib/auth";
import { getWatchlistItems } from "@/lib/watchlist-data";

// 이 화면(WatchlistBody)이 useSuspenseQuery로 /api/watchlist를 fetch하는데,
// 이 라우트는 동적 세그먼트가 없어서 Next.js가 기본적으로 빌드 타임에
// 정적 생성(SSG)을 시도합니다. 그러면 빌드 서버가 떠있지 않은 채로
// localhost:3000/api/watchlist를 호출하게 돼서 ECONNREFUSED로 빌드 자체가
// 실패해요(2026-08-14 세션에 실제로 겪음). 관심종목은 애초에 매 요청마다
// 달라지는 사용자별 데이터라 정적 생성 대상이 아니므로, 빌드 타임 프리렌더링
// 자체를 끄고 요청마다 렌더링하게 강제합니다.
export const dynamic = "force-dynamic";

// 2026-08-18 세션: 회원가입/로그인 도입하면서 이 페이지도 서버 컴포넌트로
// 바꿔서 1) 로그인 안 했으면 /login으로 보내고, 2) DB에서 초기 목록을 직접
// 읽어서 WatchlistScreen에 넘겨줍니다. 예전처럼 클라이언트 쪽
// useSuspenseQuery가 서버 렌더 패스에서 /api/watchlist를 자기 자신에게
// fetch하면 쿠키가 안 실려서 401이 났었어요(use-watchlist.ts 주석 참고) —
// 그 문제를 피하는 방법이기도 합니다.
export default async function WatchlistPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const initialItems = await getWatchlistItems(user.id);

  return <WatchlistScreen initialItems={initialItems} />;
}
