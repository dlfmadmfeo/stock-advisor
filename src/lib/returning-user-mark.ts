// ---------------------------------------------------------------------------
// 2026-09-23 세션: "앱을 완전히 껐다가 세션 만료된 채로 다시 켰을 때도
// 만료 안내가 뜨게 해달라"는 요청으로 추가.
//
// src/app/page.tsx는 세션 쿠키(better-auth.session_token)가 남아있는지로
// "예전에 로그인했었다"를 판단했는데, 그 쿠키의 Max-Age가 세션
// expiresIn(auth.ts)과 똑같아서 세션이 만료되는 바로 그 순간 쿠키도 같이
// 사라져요 — 그래서 정작 "만료된 채로 재실행"한 시점엔 이미 쿠키가 없어서
// 조용히 /login으로만 가고 안내가 안 떴습니다.
//
// 세션 쿠키와 별개로, "이 기기는 예전에 로그인한 적 있다"만 오래
// 기억해두는 마커 쿠키를 따로 둡니다 — 로그인/회원가입 성공 시 세워두고
// (markReturningUser), 사용자가 직접 로그아웃할 때만 지웁니다
// (clearReturningUserMark). 세션이 저절로 만료돼도 이 마커는 안 지워지니,
// page.tsx가 "만료됨" 안내와 "원래 손님" 첫 방문을 정확히 구분할 수 있어요.
// ---------------------------------------------------------------------------

export const RETURNING_USER_COOKIE = "sa_returning";

export function markReturningUser() {
  const maxAgeSeconds = 60 * 60 * 24 * 400; // 브라우저 쿠키 Max-Age 상한(400일)
  document.cookie = `${RETURNING_USER_COOKIE}=1; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function clearReturningUserMark() {
  document.cookie = `${RETURNING_USER_COOKIE}=; path=/; max-age=0`;
}
