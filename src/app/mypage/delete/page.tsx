import { redirect } from "next/navigation";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { DeleteAccountForm } from "@/components/delete-account-form";
import { EmptyState } from "@/components/ui-primitives";
import { getSessionUser } from "@/lib/auth";
import { accountDeletionBlockReason } from "@/lib/account-deletion";

// 회원 탈퇴 화면. 비로그인이면 /login으로 보낸다. 데모·관리자 계정은 서버가 거부하므로
// 비밀번호를 입력받기 전에 안내만 보여준다.
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
