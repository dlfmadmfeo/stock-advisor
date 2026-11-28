import { headers } from "next/headers";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/db";
import { sendResetPasswordEmail, sendVerificationEmail } from "@/lib/email";
import { afterAccountDelete, beforeAccountDelete } from "@/lib/account-deletion";

// ---------------------------------------------------------------------------
// 인증은 better-auth와 Prisma 어댑터로 처리한다(기존 MySQL DB 사용).
// 직접 구현했던 scrypt+HMAC 세션 방식에서 옮겼으며, 이전 User.passwordHash로
// 저장된 비밀번호는 호환되지 않는다.
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
    // 회원가입 이메일 인증. 인증 전 계정은 로그인이 거부된다(403).
    // 기존 가입자는 활성화 전에 emailVerified=true로 처리했다.
    requireEmailVerification: true,
    minPasswordLength: 4,
    // 비밀번호 재설정 메일. 메일 설정이 없으면 email.ts가 false만 반환하고, 응답은
    // 항상 성공으로 돌려준다(이메일 가입 여부를 응답으로 노출하지 않기 위해).
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
    // 세션 만료: 운영 30일, 로컬 개발(npm run dev)만 5분.
    // 30일은 "로그인 상태 유지"를 선택했을 때의 값이고, 선택하지 않으면 better-auth가
    // 세션 쿠키(브라우저 종료 시 삭제)와 서버 만료 1일로 발급한다. updateAge(기본 1일)
    // 마다 만료일이 연장된다. 개발 모드만 짧게 둔 것은 만료 흐름을 반복 테스트하기
    // 위해서이며, NODE_ENV로 나눠 운영에 짧은 값이 배포되지 않게 했다.
    expiresIn: process.env.NODE_ENV === "development" ? 60 * 5 : 60 * 60 * 24 * 30,
  },
  // User.isAdmin을 세션에 포함한다. input:false라 회원가입·프로필 API로는 바꿀 수
  // 없고, DB에서 직접 설정해야 관리자가 된다.
  user: {
    // 회원 탈퇴(Google Play 계정 삭제 요구사항). 비밀번호를 함께 보내야 삭제된다.
    // 데모·관리자 계정 보호와 실시간 구독 정리는 account-deletion.ts 참고.
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

// 서버 컴포넌트·라우트 핸들러에서 로그인한 유저(민감 정보 제외)를 조회한다.
export async function getSessionUser(): Promise<{ id: string; email: string; isAdmin: boolean } | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, isAdmin: session.user.isAdmin };
}
