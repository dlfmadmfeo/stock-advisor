import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getSessionUser } from "@/lib/auth";

// 이미 로그인돼 있으면 홈으로 보낸다(앱 콜드 스타트나 주소 직접 입력 시).
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/notifications");
  }
  return <LoginScreen mode="login" />;
}
