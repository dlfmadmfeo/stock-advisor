import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// 이메일 발송 클라이언트 (서버 전용). 비밀번호 재설정(auth.ts의
// sendResetPassword) + 회원가입 이메일 인증(emailVerification.sendVerificationEmail)
// 둘 다 여기를 씁니다.
//
// 2026-09-14 세션: 원래 Resend(onboarding@resend.dev)로 시작했는데, 커스텀
// 도메인을 인증하기 전까지는 "Resend 가입 이메일 주소로만" 보낼 수 있는
// 샌드박스 제한이 있어서(실측 확인 — 다른 주소로 보내면 403) 실제 회원한테는
// 못 보냄. 도메인 구매 없이 아무 주소로나 무료로 보낼 수 있는 Gmail SMTP로
// 교체 — 지메일 계정의 "앱 비밀번호"만 있으면 됨(2단계 인증 켜야 발급 가능,
// myaccount.google.com/apppasswords). 하루 500통 제한이 있지만 이 앱
// 규모엔 충분합니다.
//
// kis.ts/dart.ts/claude.ts와 같은 패턴 — 설정 안 됐거나 발송이 실패해도
// 예외를 던지지 않고 false만 돌려줘요.
// ---------------------------------------------------------------------------

const GMAIL_USER = process.env.GMAIL_USER;
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

const transporter =
  GMAIL_USER && GMAIL_APP_PASSWORD
    ? nodemailer.createTransport({
        service: "gmail",
        auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
      })
    : null;

export function emailConfigured(): boolean {
  return transporter !== null;
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  if (!transporter) return false;
  try {
    await transporter.sendMail({
      from: `주식 어드바이저 <${GMAIL_USER}>`,
      to,
      subject,
      html,
    });
    return true;
  } catch {
    return false;
  }
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<boolean> {
  return sendEmail(
    to,
    "비밀번호 재설정 안내",
    `
      <p>비밀번호 재설정을 요청하셨어요.</p>
      <p><a href="${url}">여기를 눌러 새 비밀번호를 설정해주세요.</a></p>
      <p>요청하지 않으셨다면 이 메일을 무시하셔도 돼요.</p>
    `,
  );
}

export async function sendVerificationEmail(to: string, url: string): Promise<boolean> {
  return sendEmail(
    to,
    "이메일 주소를 인증해주세요",
    `
      <p>주식 어드바이저 가입을 환영해요.</p>
      <p><a href="${url}">여기를 눌러 이메일 주소를 인증해주세요.</a></p>
      <p>본인이 가입한 게 아니라면 이 메일을 무시하셔도 돼요.</p>
    `,
  );
}
