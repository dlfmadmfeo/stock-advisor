"use client";

import { createAuthClient } from "better-auth/react";

// 2026-08-20 세션: better-auth 클라이언트. login-screen.tsx(로그인/회원가입/
// 데모 로그인), logout-button.tsx(로그아웃), use-session.ts(세션 조회)가
// 이걸 통해서 /api/auth/[...all] 라우트를 호출해요. baseURL을 안 넘기면
// 같은 origin(/api/auth)을 알아서 씁니다.
export const authClient = createAuthClient();
