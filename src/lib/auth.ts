import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendResetPasswordEmail, sendVerificationEmail } from "@/lib/email";
import { afterAccountDelete, beforeAccountDelete } from "@/lib/account-deletion";

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
    // 2026-09-25 세션: 회원가입 이메일 인증 활성화. 이 값이 true면 인증 전
    // 계정은 로그인이 거부돼요(sign-in.mjs가 emailVerified === false면 403)
    // — 켜기 전에 기존 가입자 전원(관리자/데모/실가입자)을 emailVerified=true로
    // 미리 바꿔뒀어요(데모 계정은 가짜 도메인이라 인증 자체가 불가능). 앞으로
    // 이 플래그를 다시 끌 일이 있더라도 그 3명은 이미 인증 처리된 상태예요.
    requireEmailVerification: true,
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
  // 회원가입 시 실제로 존재하는 이메일인지 확인하는 절차. requireEmailVerification이
  // true라 sign-up.mjs가 가입 직후 이 콜백을 자동으로 호출해요. sendOnSignIn:
  // 인증 전 계정이 로그인을 시도하면(메일을 놓쳤거나 링크가 만료된 경우) 인증
  // 메일을 새로 보내줘요. 링크 유효시간은 기본 1시간이라 메일을 늦게 확인해도
  // 되게 24시간으로 늘림.
  emailVerification: {
    sendOnSignIn: true,
    expiresIn: 60 * 60 * 24,
    sendVerificationEmail: async ({ user, url }) => {
      await sendVerificationEmail(user.email, url);
    },
  },
  // 회원 탈퇴는 비밀번호를 같이 보내야만 되게 서버에서 강제해요. better-auth의
  // delete-user는 비밀번호를 안 보내면 "세션이 방금 만들어졌는지(freshAge,
  // 기본 24시간)"만 보고 통과시켜서, 세션 토큰만 탈취돼도 API 직접 호출로
  // 계정을 지울 수 있어요. freshAge를 줄여서 막으면 같은 신선도 검사를 쓰는
  // /list-sessions(활성 기기 화면)가 깨져서, 이 엔드포인트만 훅으로 막습니다.
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path === "/delete-user" && !ctx.body?.password) {
        throw new APIError("BAD_REQUEST", { message: "탈퇴하려면 비밀번호를 입력해야 해요." });
      }
    }),
  },
  session: {
    // ⚠️ 2026-09-24 세션: 실기기(프로덕션)에서 콜드스타트 만료 감지
    // (returning-user-mark.ts)를 테스트하려고 5분으로 임시 배포함 — 테스트
    // 끝나면 반드시 정식 값인 1시간(60 * 60)으로 되돌릴 것. 지난번에
    // 되돌리는 걸 깜빡해서 열흘 넘게 실가입자들이 5분마다 로그아웃되는
    // 사고가 있었음.
    expiresIn: 60 * 5,
  },
  // Prisma User.isAdmin 컬럼을 better-auth 세션에도 실어옵니다(2026-08-23
  // 세션). input:false라서 회원가입/프로필 수정 API로는 이 필드를 못 건드려요
  // — DB에서 직접 켜야만 관리자가 됨(스스로 관리자 체크박스를 켜는 걸 막음).
  user: {
    // 회원 탈퇴(2026-09-25 세션, Google Play 계정 삭제 요구사항). 클라이언트가
    // 비밀번호를 같이 보내야만 삭제돼요(delete-user 엔드포인트가 검증). 데모/관리자
    // 계정 보호와 실시간 구독 정리는 account-deletion.ts 참고.
    deleteUser: {
      enabled: true,
      beforeDelete: async (user) => {
        await beforeAccountDelete(user as { id: string; email: string; isAdmin?: boolean });
      },
      afterDelete: async (user) => {
        await afterAccountDelete(user);
      },
    },
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
