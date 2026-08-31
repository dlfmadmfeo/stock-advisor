// ---------------------------------------------------------------------------
// Firebase Cloud Messaging 발송 (서버 전용). 관심종목 공시 감지 시 앱으로
// 푸시를 보내는 데 씁니다.
//
// KIS/DART와 달리 인증에 서비스 계정 키(JSON) 전체가 필요해요 — Firebase
// 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성으로 받은 JSON
// 파일 내용을 통째로 FIREBASE_SERVICE_ACCOUNT 환경변수에 넣습니다(줄바꿈
// 포함된 문자열이라 .env.local에서 한 줄로 넣으려면 JSON.stringify한 걸
// 그대로 붙여넣으면 됩니다 — 아래 파싱 부분 참고).
//
// 필요 환경변수 (.env.local): FIREBASE_SERVICE_ACCOUNT
// ---------------------------------------------------------------------------

import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let app: App | null = null;

export function fcmConfigured(): boolean {
  return Boolean(process.env.FIREBASE_SERVICE_ACCOUNT);
}

function getFirebaseApp(): App {
  if (app) return app;
  if (getApps().length) {
    app = getApps()[0];
    return app;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT 환경변수가 없어요 (.env.local 확인)");
  }
  const serviceAccount = JSON.parse(raw);
  app = initializeApp({ credential: cert(serviceAccount) });
  return app;
}

export type PushResult = {
  successCount: number;
  // 만료/미등록된 토큰(더 이상 유효하지 않음) — 호출부가 DB에서 지우는 데 씀.
  invalidTokens: string[];
};

// 토큰이 여러 개(유저가 기기 여러 대를 쓰는 경우)라도 한 번에 보냅니다.
// sendEachForMulticast는 토큰별 개별 성공/실패를 돌려줘서, "이 토큰은 이제
// 안 쓴다"(messaging/registration-token-not-registered,
// messaging/invalid-registration-token)를 구분해 반환합니다 — 호출부가
// 죽은 토큰을 PushToken 테이블에서 정리할 수 있게.
export async function sendPush(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<PushResult> {
  if (tokens.length === 0) return { successCount: 0, invalidTokens: [] };

  const messaging = getMessaging(getFirebaseApp());
  const res = await messaging.sendEachForMulticast({
    tokens,
    notification: { title, body },
    data,
  });

  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (r.success) return;
    const code = r.error?.code;
    if (
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token"
    ) {
      invalidTokens.push(tokens[i]);
    }
  });

  return { successCount: res.successCount, invalidTokens };
}
