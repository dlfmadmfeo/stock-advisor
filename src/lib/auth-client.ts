"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// better-auth 클라이언트. 로그인·회원가입, 로그아웃, 세션 조회가 이 클라이언트로
// /api/auth/[...all]을 호출한다(baseURL 생략 시 같은 origin).
// inferAdditionalFieldsClient로 User.isAdmin 타입을 클라이언트에서도 쓸 수 있게 한다.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
