import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";

// 2026-09-13 세션: 예전엔 세션 상태를 전혀 안 보고 무조건 /login으로
// 보냈어요 — 그래서 로그인이 멀쩡히 살아있는 상태로 앱(Flutter WebView)을
// 껐다 켜도 매번 로그인 폼이 다시 떴습니다. Flutter 앱이 콜드 스타트마다
// 이 루트 경로(initialWebViewUrl)를 여는데, 여기서 세션을 확인 안 하면
// "로그인 상태 유지"가 사실상 의미가 없어져요. 세션이 있으면 홈으로,
// 없으면 로그인 화면으로 보냅니다.
export default async function Home() {
  const user = await getSessionUser();
  redirect(user ? "/notifications" : "/login");
}
