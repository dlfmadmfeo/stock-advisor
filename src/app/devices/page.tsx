import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { DeviceSessionsContent } from "@/components/device-sessions";
import { getSessionUser } from "@/lib/auth";

// watchlist/alerts/mypage와 같은 이유로 로그인 안 했으면 /login으로
// 보냅니다 — 계정별 로그인 기기 목록이라 비로그인 상태에선 의미가 없어요.
//
// 2026-09-13 세션: "여러 기기 로그인이 가능한데, 한쪽이 로그인하면 나머지
// 세션을 강제로 끊어야 하는 거 아니냐"는 질문에서 시작 — 이 앱은 폰(Flutter
// 앱)과 웹을 동시에 쓰는 게 자연스러운 구조라 강제 단일 세션은 UX상
// 손해라고 보고, 대신 사용자가 원할 때 직접 다른 기기를 로그아웃시킬 수
// 있는 화면을 추가했습니다. better-auth가 이미 제공하는 list-sessions/
// revoke-session/revoke-other-sessions 엔드포인트를 그대로 씁니다(새 API
// 라우트를 직접 만들 필요 없음 — /api/auth/[...all]이 이미 다 처리).
export default async function DevicesPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <BackTopBar title="활성 기기" />
      <DeviceSessionsContent />
    </AppShell>
  );
}
