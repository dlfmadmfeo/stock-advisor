import { redirect } from "next/navigation";
import { LoginScreen } from "@/components/login-screen";
import { getSessionUser } from "@/lib/auth";

// 2026-09-13 세션: 이미 로그인해 있는데도 /login에 들어오면(위 루트 경로처럼
// Flutter 앱 콜드 스타트, 또는 주소를 직접 치는 경우) 로그인 폼이 그대로
// 보였어요 — "이미 로그인돼 있으면 홈으로" 체크가 아예 없었습니다.
export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    redirect("/notifications");
  }
  return <LoginScreen mode="login" />;
}
