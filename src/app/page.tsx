import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getSessionUser } from "@/lib/auth";
import { RETURNING_USER_COOKIE } from "@/lib/returning-user-mark";

// 루트 경로. Flutter 앱이 콜드 스타트마다 이 경로를 열기 때문에, 세션이 있으면
// 홈으로, 없으면 로그인 화면으로 보낸다(로그인 상태 유지가 동작하도록).
export default async function Home() {
  const user = await getSessionUser();
  if (user) {
    redirect("/notifications");
  }

  // 화면이 켜져 있는 동안의 세션 만료는 session-guard.tsx가 처리하지만, 만료된 채로
  // 앱을 다시 켜는 경우(콜드 스타트)는 그 훅이 마운트되기 전이라 여기서 감지한다.
  //
  // 세션 쿠키는 세션과 같은 시점에 만료돼 판단 근거로 쓸 수 없으므로, 수명이 분리된
  // 별도 마커(returning-user-mark.ts)로 이전 로그인 여부를 확인한다.
  const cookieStore = await cookies();
  const hadSessionCookie = cookieStore.get(RETURNING_USER_COOKIE)?.value === "1";
  redirect(hadSessionCookie ? "/login?expired=1" : "/login");
}
