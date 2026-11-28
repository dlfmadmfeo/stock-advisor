// ---------------------------------------------------------------------------
// 재방문 마커 쿠키. 세션이 만료된 채로 앱을 다시 켰을 때 만료 안내를 보여주기 위해 쓴다.
//
// 세션 쿠키는 세션과 같은 시점에 사라지므로 이전 로그인 여부를 판단할 수 없다.
// 그래서 로그인·회원가입 성공 시 이 마커를 세우고(markReturningUser), 직접
// 로그아웃할 때만 지운다(clearReturningUserMark). page.tsx는 이 마커로 만료된
// 재방문과 첫 방문을 구분한다.
// ---------------------------------------------------------------------------

export const RETURNING_USER_COOKIE = "sa_returning";

export function markReturningUser() {
  const maxAgeSeconds = 60 * 60 * 24 * 400; // 브라우저 쿠키 Max-Age 상한(400일)
  document.cookie = `${RETURNING_USER_COOKIE}=1; path=/; max-age=${maxAgeSeconds}; SameSite=Lax`;
}

export function clearReturningUserMark() {
  document.cookie = `${RETURNING_USER_COOKIE}=; path=/; max-age=0`;
  document.cookie = `${SESSION_ONLY_COOKIE}=; path=/; max-age=0`;
}

// "로그인 상태 유지"를 끄고 로그인했다는 표시. better-auth의 dont_remember
// 쿠키는 HttpOnly라 앱(Flutter)이 믿고 쓰기 어렵고, 다시 "유지"로 로그인해도
// 안 지워지는 문제가 있어서 별도로 둡니다. 앱은 시작할 때 이 표시와 로그인
// 쿠키가 같이 있으면 로그인을 풀어서 로그인 화면으로 보냅니다(MainActivity.kt).
// 로그인할 때마다 지금 선택에 맞게 세우거나 지워요.
export const SESSION_ONLY_COOKIE = "sa_session_only";

export function markSessionOnly(sessionOnly: boolean) {
  if (sessionOnly) {
    document.cookie = `${SESSION_ONLY_COOKIE}=1; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
  } else {
    document.cookie = `${SESSION_ONLY_COOKIE}=; path=/; max-age=0`;
  }
}
