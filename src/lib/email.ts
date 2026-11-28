import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// 이메일 발송 클라이언트 (서버 전용). 비밀번호 재설정과 회원가입 이메일 인증에 쓴다.
//
// Gmail SMTP(앱 비밀번호, 하루 500통)를 사용한다. Resend는 도메인 인증 전에는
// 가입 주소로만 발송할 수 있어 교체했다.
//
// kis.ts/dart.ts/claude.ts와 같이, 설정이 없거나 발송에 실패해도 예외 없이 false를 돌려준다.
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
