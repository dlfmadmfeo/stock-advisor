import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendResetPasswordEmail, sendVerificationEmail } from "@/lib/email";

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
    // ⚠️ 2026-09-14 세션: 이메일 인증 발송(email.ts, Gmail SMTP)은 연결해
    // 뒀지만, GMAIL_USER/GMAIL_APP_PASSWORD를 실제로 넣어서 발송까지
    // 검증하기 전까지는 true로 안 바꿔요 — 이 값이 true인데 발송이 실패하면
    // 신규 가입자가 인증 메일을 영영 못 받아서 로그인 자체가 막혀버려요
    // (sign-in.mjs가 emailVerified === false면 로그인을 거부함). 검증 끝나면
    // true로.
    requireEmailVerification: false,
    minPasswordLength: 4,
    // 2026-09-13 세션: "비밀번호 찾기" 버튼이 그동안 토스트만 띄우고 실제
    // 재설정은 안 됐음(메일 발송 수단이 없었음) — 이메일 발송 연결하면서
    // 실제 동작하게 함. email.ts가 설정 안 됐으면 조용히 false만 반환하니,
    // 여기서 별도 에러 처리는 안 함(better-auth가 알아서 성공 응답을
    // 돌려주고, 실제 발송 실패는 로그로만 남음 — 이메일 존재 여부를 응답으로
    // 노출 안 하는 게 보안상 맞음).
    sendResetPassword: async ({ user, url }) => {
      await sendResetPasswordEmail(user.email, url);
    },
  },
  // 2026-09-14 세션: 회원가입 시 실제로 존재하는 이메일인지 확인하는 절차.
  // requireEmailVerification이 true가 되면 sign-up.mjs가 이 콜백을 자동으로
  // 호출해요(따로 트리거 안 해도 됨) — 검증 전까지는 이 콜백이 있어도
  // requireEmailVerification이 false라 실제로는 안 불려요.
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  session: {
    // ⚠️ 2026-09-13 세션: 테스트용으로 5분으로 임시로 줄여둠 — 테스트 끝나면
    // 정식 값인 7일로 되돌릴 것.
    expiresIn: 60 * 5,
  },
  // Prisma User.isAdmin 컬럼을 better-auth 세션에도 실어옵니다(2026-08-23
  // 세션). input:false라서 회원가입/프로필 수정 API로는 이 필드를 못 건드려요
  // — DB에서 직접 켜야만 관리자가 됨(스스로 관리자 체크박스를 켜는 걸 막음).
  user: {
    additionalFields: {
      isAdmin: {
        type: "boolean",
        defaultValue: false,
        input: false,
      },
    },
  },
});

// 서버 컴포넌트/라우트 핸들러에서 로그인한 유저(민감 정보 제외)를 조회.
// 예전 auth.ts의 getSessionUser()와 같은 이름/반환 형태를 유지해서, 이 함수를
// 쓰던 watchlist/page.tsx, api/watchlist/route.ts, api/watchlist/[ticker]/
// route.ts는 그대로 두고 이 함수 내부 구현만 better-auth로 바꿨어요.
export async function getSessionUser(): Promise<{ id: string; email: string; isAdmin: boolean } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin };
}
