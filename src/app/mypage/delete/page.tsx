import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { EmptyState } from "@/components/ui-primitives";
import { getSessionUser } from "@/lib/auth";
import { accountDeletionBlockReason } from "@/lib/account-deletion";

// 회원 탈퇴 화면(2026-09-25 세션). 로그인한 사람만 의미가 있어서 다른 개인
// 화면(devices/alerts 등)과 같이 비로그인이면 /login으로 보냅니다. 데모/관리자는
// 어차피 서버가 거부하니, 비밀번호까지 입력하게 한 뒤 실패시키지 않고 처음부터
// 안내만 보여줍니다.
export default async function DeleteAccountPage() {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const blockReason = accountDeletionBlockReason(user);

  return (
    <AppShell>
      <BackTopBar title="회원 탈퇴" />
      {blockReason ? (
        <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
          <EmptyState text={blockReason} />
        </section>
      ) : (
        <DeleteAccountForm />
      )}
    </AppShell>
  );
}
