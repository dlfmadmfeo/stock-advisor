import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

// better-auth 인증 엔드포인트(/api/auth/sign-in/email, sign-up/email, sign-out,
// get-session 등)를 이 catch-all 라우트 하나로 처리한다.
export const { GET, POST } = toNextJsHandler(auth);
