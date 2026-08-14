// ---------------------------------------------------------------------------
// 데모 로그인 세션 (2026-08-14 세션 추가). 실제 인증 인프라가 없어서
// (login-screen.tsx 상단 주석 참고) 로그인 폼에 입력한 이메일을 localStorage에
// 저장해뒀다가, GNB 프로필 드롭다운(user-menu.tsx)이 읽어서 보여줍니다.
// 로그아웃하면 지워요.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "stock-advisor:userEmail";

export function setStoredEmail(email: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, email);
}

export function getStoredEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(STORAGE_KEY);
}

export function clearStoredEmail() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
