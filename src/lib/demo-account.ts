// 데모 계정 — DB에 미리 가입되어 있어야 동작합니다. 로그인 화면의 "데모 계정으로
// 바로 둘러보기" 버튼(login-screen.tsx)과, 이 계정이 회원 탈퇴로 지워지지
// 않게 막는 auth.ts의 beforeDelete가 같은 값을 써야 해서 한곳에 둡니다.
// 비밀번호가 클라이언트 번들에 그대로 들어있어서 누구나 이 계정으로 로그인할
// 수 있다는 점에 주의 — 그래서 이 계정은 탈퇴/비밀번호 변경 같은 계정 파괴적
// 동작이 서버에서 막혀 있어야 합니다.
export const DEMO_EMAIL = "demo@stock-advisor.app";
export const DEMO_PASSWORD = "demo1234";
