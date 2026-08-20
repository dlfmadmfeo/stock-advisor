import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 2026-08-20 세션: 직접 구현했던 scrypt+HMAC 세션 방식 대신 better-auth
// 라이브러리로 교체했어요. Lucia(이전에 우리가 쓰던 방식과 같은 "직접
// 구현" 철학)가 공식적으로 유지보수를 중단하고 better-auth로 넘어가라고
// 안내한 게 계기 — 소셜 로그인(카카오/Apple)도 나중에 플러그인으로 붙이기
// 쉬워짐. Prisma 어댑터를 써서 기존 MySQL DB를 그대로 씁니다.
//
// 주의: 예전 User.passwordHash(scrypt 직접 구현)로 저장돼 있던 비밀번호는
// better-auth의 Account.password 저장 방식과 호환되지 않아요. 이미 가입한
// 계정이 있었다면 다시 가입해야 합니다.
// ---------------------------------------------------------------------------

export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "mysql" }),
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  // better-auth는 요청의 Origin 헤더가 baseURL(또는 이 목록)에 없으면 403으로
  // 막아요(CSRF 방지). 개발 중에 휴대폰으로 같은 와이파이에서
  // http://192.168.x.x:3000처럼 로컬 IP로 접속해서 테스트할 때 이 체크에
  // 걸려서 "Invalid origin" 에러가 났었어요 — 개발 환경에서만 사설 IP
  // 대역(192.168.*.*, 10.*.*.*, 172.16~31.*.*)을 와일드카드로 허용합니다.
  // 프로덕션 빌드(NODE_ENV=production)에서는 이 목록이 아예 안 들어가요.
  trustedOrigins:
    process.env.NODE_ENV === "development"
      ? [
          "http://localhost:3000",
          "http://192.168.*.*:3000",
          "http://10.*.*.*:3000",
          "http://172.16.*.*:3000",
        ]
      : undefined,
  emailAndPassword: {
    enabled: true,
    // 이메일 인증 메일을 보낼 서비스(예: Resend)를 아직 안 붙였어서, 일단
    // 가입 즉시 로그인되게 꺼둡니다. 나중에 메일 발송을 붙이면 true로.
    requireEmailVerification: false,
    minPasswordLength: 4,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30일 — 예전 SESSION_MAX_AGE_SECONDS와 동일
  },
});

// 서버 컴포넌트/라우트 핸들러에서 로그인한 유저(민감 정보 제외)를 조회.
// 예전 auth.ts의 getSessionUser()와 같은 이름/반환 형태를 유지해서, 이 함수를
// 쓰던 watchlist/page.tsx, api/watchlist/route.ts, api/watchlist/[ticker]/
// route.ts는 그대로 두고 이 함수 내부 구현만 better-auth로 바꿨어요.
export async function getSessionUser(): Promise<{ id: string; email: string } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email };
}
