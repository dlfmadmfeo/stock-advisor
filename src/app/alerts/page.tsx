import { redirect } from "next/navigation";
import { AlertSettingsScreen } from "@/components/mobile-screens";
import { getSessionUser } from "@/lib/auth";

// watchlist/page.tsx와 같은 이유로 로그인 안 했으면 /login으로 보냅니다 —
// 이 설정 자체가 로그인 유저 전용이라(비로그인 유저는 애초에 알림을 받을
// 방법이 없음, PushToken이 User에 묶여있어서), 화면에서 에러만 보여주는
// 대신 아예 로그인 화면으로 유도하는 게 자연스러워요.
export default async function AlertsPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }
  return <AlertSettingsScreen />;
}
