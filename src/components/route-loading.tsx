// ---------------------------------------------------------------------------
// 라우트별 loading.tsx가 공통으로 쓰는 폴백. App Router가 page.tsx를
// <Suspense fallback>으로 감싸므로, 페이지 이동 중에는 AppShell(상단바 없음)과
// 본문 로딩 문구만 먼저 보여준다. 서버 컴포넌트에서 클라이언트 컴포넌트인
// AppShell을 렌더링하므로 "use client"는 필요 없다.
// ---------------------------------------------------------------------------

import { AppShell } from "@/components/mobile-screens";
import { EmptyState } from "@/components/ui-primitives";

export function RouteLoadingFallback() {
  return (
    <AppShell>
      <div className="px-5 pb-8 pt-16 lg:px-8">
        <EmptyState text="불러오는 중..." />
      </div>
    </AppShell>
  );
}
