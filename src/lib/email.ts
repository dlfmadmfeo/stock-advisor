import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Resend 이메일 발송 클라이언트 (서버 전용). 지금은 비밀번호 재설정 메일
// 하나만 씁니다(2026-09-13 세션, auth.ts의 sendResetPassword 콜백).
//
// kis.ts/dart.ts/claude.ts와 같은 패턴 — 설정 안 됐거나 발송이 실패해도
// 예외를 던지지 않고 false만 돌려줘요.
//
// ⚠️ 발신 주소를 아직 resend.dev 도메인(onboarding@resend.dev)으로 뒀어요 —
// 커스텀 도메인을 Resend에서 인증하기 전까지는 이 주소로 "Resend 계정 가입
// 시 등록한 이메일 주소"에만 보낼 수 있어요(다른 수신자는 막힘, Resend의
// 샌드박스 제한). 실제로 아무 이메일 주소로나 보내려면 도메인 인증이
// 필요합니다.
// ---------------------------------------------------------------------------

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

export function emailConfigured(): boolean {
  return resend !== null;
}

export async function sendResetPasswordEmail(to: string, url: string): Promise<boolean> {
  if (!resend) return false;

  try {
    const { error } = await resend.emails.send({
      from: "주식 어드바이저 <onboarding@resend.dev>",
      to,
      subject: "비밀번호 재설정 안내",
      html: `
        <p>비밀번호 재설정을 요청하셨어요.</p>
        <p><a href="${url}">여기를 눌러 새 비밀번호를 설정해주세요.</a></p>
        <p>요청하지 않으셨다면 이 메일을 무시하셔도 돼요.</p>
      `,
    });
    return !error;
  } catch {
    return false;
  }
}
