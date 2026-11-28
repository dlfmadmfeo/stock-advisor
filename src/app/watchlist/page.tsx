import { redirect } from "next/navigation";
import { WatchlistScreen } from "@/components/mobile-screens";
import { getSessionUser } from "@/lib/auth";
import { getWatchlistItems } from "@/lib/watchlist-data";

// 유저별 데이터라 정적 생성 대상이 아니다. 빌드 타임 프리렌더링을 끄지 않으면
// 빌드 중 /api/watchlist 호출이 ECONNREFUSED로 실패하므로 요청마다 렌더링한다.
export const dynamic = "force-dynamic";

// 서버 컴포넌트에서 1) 비로그인이면 /login으로 보내고, 2) DB에서 초기 목록을 읽어
// WatchlistScreen에 넘긴다(SSR 중 자기 호출 401 문제 회피, use-watchlist.ts 참고).
export default async function WatchlistPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const initialItems = await getWatchlistItems(user.id);

  return <WatchlistScreen initialItems={initialItems} />;
}
