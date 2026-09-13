import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";

// 2026-09-13 세션: 예전엔 세션 상태를 전혀 안 보고 무조건 /login으로
// 보냈어요 — 그래서 로그인이 멀쩡히 살아있는 상태로 앱(Flutter WebView)을
// 껐다 켜도 매번 로그인 폼이 다시 떴습니다. Flutter 앱이 콜드 스타트마다
// 이 루트 경로(initialWebViewUrl)를 여는데, 여기서 세션을 확인 안 하면
// "로그인 상태 유지"가 사실상 의미가 없어져요. 세션이 있으면 홈으로,
// 없으면 로그인 화면으로 보냅니다.
export default async function Home() {
  const user = await getSessionUser();
  if (user) {
    redirect("/notifications");
  }

  // "화면 켜져있는 동안 세션이 만료됨"은 session-guard.tsx가 처리하는데,
  // "앱을 껐다가 세션 만료된 채로 다시 켬"(콜드 스타트)은 그 훅이 아예
  // 마운트되기 전이라 못 잡아요 — 여기서 따로 감지해야 합니다. 세션 쿠키
  // 자체는(better-auth.session_token, 프로덕션 HTTPS에선 __Secure- 접두사가
  // 붙음) 아직 브라우저에 남아있는데 getSessionUser()가 null을 준 경우
  // "예전엔 로그인했었는데 지금 세션이 무효화됨"으로 보고, 진짜 첫 방문
  // 손님(쿠키 자체가 없음)과 구분해서 후자만 안내 문구 없이 보냅니다.
  const cookieStore = await cookies();
  const hadSessionCookie = cookieStore
    .getAll()
    .some((c) => c.name.endsWith(".session_token"));
  redirect(hadSessionCookie ? "/login?expired=1" : "/login");
}
