import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { RETURNING_USER_COOKIE } from "@/lib/returning-user-mark";

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
  // 마운트되기 전이라 못 잡아요 — 여기서 따로 감지해야 합니다.
  //
  // 2026-09-23 세션: 처음엔 세션 쿠키(better-auth.session_token) 자체가
  // 남아있는지로 판단했는데, 그 쿠키의 Max-Age가 세션 expiresIn(auth.ts)과
  // 똑같아서 세션이 만료되는 순간 쿠키도 같이 사라져요 — 그래서 정작
  // "만료된 채로 재실행"하는 흔한 케이스에서 쿠키가 이미 없어 안내가 안
  // 떴습니다(사용자 지적으로 발견). 세션 쿠키와 수명이 분리된 별도 마커
  // (returning-user-mark.ts, 로그인 시 세우고 로그아웃 시에만 지움)로
  // "예전에 로그인했었는지"를 판단하도록 교체.
  const cookieStore = await cookies();
  const hadSessionCookie = cookieStore.get(RETURNING_USER_COOKIE)?.value === "1";
  redirect(hadSessionCookie ? "/login?expired=1" : "/login");
}
