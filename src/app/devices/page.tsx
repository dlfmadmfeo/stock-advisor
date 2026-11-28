import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { DeviceSessionsContent } from "@/components/device-sessions";
import { getSessionUser } from "@/lib/auth";

// 로그인 기기 목록. 비로그인이면 /login으로 보낸다.
//
// 앱과 웹을 함께 쓰는 구조라 단일 세션을 강제하지 않고, 대신 사용자가 다른 기기를
// 직접 로그아웃할 수 있게 한다(better-auth의 list-sessions/revoke-session/
// revoke-other-sessions 사용).
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
