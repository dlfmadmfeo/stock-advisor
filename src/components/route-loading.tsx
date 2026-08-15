// ---------------------------------------------------------------------------
// 라우트 단위 loading.tsx에서 공통으로 쓰는 폴백 (2026-08-14 세션, Suspense
// 작업 확장). Next.js App Router는 각 라우트 폴더에 loading.tsx가 있으면
// 그 라우트의 page.tsx를 자동으로 <Suspense fallback={<Loading/>}>로
// 감싸줍니다 — 페이지 이동 시 새 라우트의 JS/데이터가 준비될 때까지 이전
// 화면 대신 이걸 보여줘요. AppShell(상단바 없는 버전)만 먼저 그려서 최소한
// "앱 틀"은 바로 보이게 하고, 본문 자리에만 로딩 문구를 넣었습니다.
//
// "use client" 없음 — AppShell 자체는 클라이언트 컴포넌트지만, 서버
// 컴포넌트인 이 파일에서 그냥 import해서 렌더링하면 됩니다(RSC가 지원하는
// "서버 컴포넌트가 클라이언트 컴포넌트를 렌더링" 패턴).
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
