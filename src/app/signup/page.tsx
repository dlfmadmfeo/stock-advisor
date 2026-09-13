import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getSessionUser } from "@/lib/auth";

// login/page.tsx와 같은 이유 — 이미 로그인해 있으면 회원가입 폼 대신 홈으로.
export default async function SignupPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/notifications");
  }
  return <LoginScreen mode="signup" />;
}
