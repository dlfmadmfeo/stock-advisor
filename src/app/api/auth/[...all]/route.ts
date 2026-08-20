import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// 2026-08-20 세션: better-auth가 /api/auth/sign-in/email,
// /api/auth/sign-up/email, /api/auth/sign-out, /api/auth/get-session 같은
// 모든 인증 엔드포인트를 이 catch-all 라우트 하나로 처리합니다. 예전에
// 직접 만들었던 api/auth/{signup,login,logout,me}/route.ts는 더 이상 안
// 쓰여요(파일은 남겨뒀지만 안내 메시지만 반환하도록 바꿔놨어요).
export const { GET, POST } = toNextJsHandler(auth);
