"use client";

import { createAuthClient } from "better-auth/react";
import { inferAdditionalFields } from "better-auth/client/plugins";
import type { auth } from "@/lib/auth";

// 2026-08-20 세션: better-auth 클라이언트. login-screen.tsx(로그인/회원가입/
// 데모 로그인), logout-button.tsx(로그아웃), use-session.ts(세션 조회)가
// 이걸 통해서 /api/auth/[...all] 라우트를 호출해요. baseURL을 안 넘기면
// 같은 origin(/api/auth)을 알아서 씁니다.
//
// 2026-08-23 세션: inferAdditionalFieldsClient<typeof auth>()를 추가해서
// User.isAdmin(auth.ts의 additionalFields) 타입이 이 클라이언트에도 그대로
// 넘어오게 함 — 이거 없으면 data.user.isAdmin이 타입상 안 잡혀서
// use-session.ts에서 매번 as로 우회해야 함.
export const authClient = createAuthClient({
  plugins: [inferAdditionalFields<typeof auth>()],
});
