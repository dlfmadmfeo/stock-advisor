// ---------------------------------------------------------------------------
// better-auth가 돌려주는 에러 문구는 영어("Invalid email or password" 등)라서
// 그대로 토스트에 띄우면 한국어 앱에 영어가 나와요. 에러 코드(error.code)를
// 한국어 문구로 바꿔서 쓰고, 모르는 코드는 영어 원문 대신 호출한 화면의
// 한국어 기본 문구(fallback)를 보여줍니다.
//
// auth.ts의 훅이 직접 던지는 에러(예: 탈퇴 시 비밀번호 필요)는 이미 한국어라서,
// 한글이 들어 있는 문구는 그대로 씁니다.
// ---------------------------------------------------------------------------

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "이메일 또는 비밀번호가 올바르지 않아요.",
  INVALID_PASSWORD: "비밀번호가 올바르지 않아요.",
  INVALID_EMAIL: "올바른 이메일 형식이 아니에요.",
  USER_NOT_FOUND: "가입된 계정을 찾을 수 없어요.",
  USER_ALREADY_EXISTS: "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써주세요.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "이미 가입된 이메일이에요. 로그인하거나 다른 이메일을 써주세요.",
  PASSWORD_TOO_SHORT: "비밀번호가 너무 짧아요.",
  PASSWORD_TOO_LONG: "비밀번호가 너무 길어요.",
  EMAIL_NOT_VERIFIED: "이메일 인증이 필요해요. 메일함을 확인해주세요.",
  EMAIL_ALREADY_VERIFIED: "이미 인증된 이메일이에요.",
  INVALID_TOKEN: "링크가 올바르지 않거나 만료됐어요. 다시 요청해주세요.",
  TOKEN_EXPIRED: "링크가 만료됐어요. 다시 요청해주세요.",
  SESSION_EXPIRED: "로그인이 만료됐어요. 다시 로그인한 뒤 시도해주세요.",
  SESSION_NOT_FRESH: "보안을 위해 다시 로그인한 뒤 시도해주세요.",
  CREDENTIAL_ACCOUNT_NOT_FOUND: "비밀번호로 가입한 계정을 찾을 수 없어요.",
  VALIDATION_ERROR: "입력한 내용을 확인해주세요.",
  MISSING_FIELD: "입력하지 않은 항목이 있어요.",
  INVALID_ORIGIN: "허용되지 않은 접근이에요.",
  FAILED_TO_CREATE_USER: "계정을 만들지 못했어요. 잠시 후 다시 시도해주세요.",
  FAILED_TO_CREATE_SESSION: "로그인하지 못했어요. 잠시 후 다시 시도해주세요.",
};

type AuthErrorLike = {
  code?: string;
  message?: string;
  status?: number;
} | null | undefined;

const HANGUL = /[가-힣]/;

export function authErrorMessage(error: AuthErrorLike, fallback: string): string {
  if (!error) return fallback;
  if (error.code && AUTH_ERROR_MESSAGES[error.code]) {
    return AUTH_ERROR_MESSAGES[error.code];
  }
  // 요청이 너무 많을 때(better-auth 기본 속도 제한)는 코드 없이 429로 와요.
  if (error.status === 429) {
    return "요청이 너무 많아요. 잠시 후 다시 시도해주세요.";
  }
  if (error.message && HANGUL.test(error.message)) return error.message;
  return fallback;
}

// 브라우저 기본 검증 문구("Please include an '@'...")는 기기 언어를 따라가서
// 영어로 나올 수 있어요. 폼에 noValidate를 달고 이 함수로 직접 검사합니다.
export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
