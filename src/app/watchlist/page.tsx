import { WatchlistScreen } from "@/components/mobile-screens";

// 이 화면(WatchlistBody)이 useSuspenseQuery로 /api/watchlist를 fetch하는데,
// 이 라우트는 동적 세그먼트가 없어서 Next.js가 기본적으로 빌드 타임에
// 정적 생성(SSG)을 시도합니다. 그러면 빌드 서버가 떠있지 않은 채로
// localhost:3000/api/watchlist를 호출하게 돼서 ECONNREFUSED로 빌드 자체가
// 실패해요(2026-08-14 세션에 실제로 겪음). 관심종목은 애초에 매 요청마다
// 달라지는 사용자별 데이터라 정적 생성 대상이 아니므로, 빌드 타임 프리렌더링
// 자체를 끄고 요청마다 렌더링하게 강제합니다.
export const dynamic = "force-dynamic";

export default function WatchlistPage() {
  return <WatchlistScreen />;
}
