import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { getSessionUser } from "@/lib/auth";

// 회원 탈퇴 화면(2026-09-25 세션). 로그인한 사람만 의미가 있어서 다른 개인
// 화면(devices/alerts 등)과 같이 비로그인이면 /login으로 보냅니다.
export default async function DeleteAccountPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell>
      <BackTopBar title="회원 탈퇴" />
      <DeleteAccountForm />
    </AppShell>
  );
}
