"use client";

// ---------------------------------------------------------------------------
// 비밀번호 재설정 요청 화면 (2026-09-13 세션). login-screen.tsx의 "비밀번호
// 찾기" 링크가 여기로 옵니다. 이메일을 받아 authClient.requestPasswordReset으로
// 재설정 링크를 발송(better-auth → src/lib/email.ts → Resend) 시키고,
// /reset-password?token=...로 돌아올 콜백 주소를 같이 넘겨요.
//
// 이메일이 실제로 가입돼 있는지 여부를 응답으로 구분하지 않습니다(계정
// 존재 여부를 노출하지 않는 게 보안 관례) — 성공 문구는 항상 똑같이
// "이메일을 확인해주세요"로 보여주고, 진짜 네트워크 오류일 때만 다른
// 문구를 띄웁니다.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Info, Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || submitting) return;
    setSubmitting(true);
    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: "/reset-password",
      });
      setSent(true);
    } catch {
      showToast("서버에 연결할 수 없어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f2f4f6] p-0 sm:p-4">
      <div
        className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white sm:h-[840px] sm:rounded-3xl sm:border sm:border-[#e5e8eb] sm:shadow-2xl"
        data-testid="forgot-password-webview"
      >
        <div className="flex items-center px-4 pt-4">
          <Link
            aria-label="뒤로가기"
            className="grid h-10 w-10 place-items-center rounded-full text-[#333d4b] active:scale-[0.98]"
            href="/login"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
        </div>

        {sent ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#eef4ff]">
              <Mail className="h-7 w-7 text-[#3182f6]" />
            </div>
            <h1 className="mt-4 text-[17px] font-extrabold text-[#191f28]">
              이메일을 확인해주세요
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-[#8b95a1]">
              {email} 주소로 가입된 계정이 있다면, 비밀번호 재설정 링크를
              보내드렸어요.
            </p>
            <Link
              className="mt-8 flex h-12 w-full items-center justify-center rounded-[14px] bg-gradient-to-br from-[#3182f6] to-[#1b64da] text-[15px] font-extrabold text-white"
              href="/login"
            >
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <form className="flex flex-1 flex-col px-6 pb-8 pt-6" onSubmit={handleSubmit}>
            <h1 className="text-[19px] font-extrabold tracking-tight text-[#191f28]">
              비밀번호 찾기
            </h1>
            <p className="mt-1.5 text-xs leading-5 text-[#8b95a1]">
              가입할 때 쓴 이메일 주소를 입력하시면, 비밀번호를 재설정할 수
              있는 링크를 보내드려요.
            </p>

            <div className="mt-7 space-y-[7px]">
              <label className="text-[12.5px] font-bold text-[#6b7684]" htmlFor="forgot-email">
                이메일
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b95a1]" />
                <input
                  autoComplete="email"
                  className="h-[50px] w-full rounded-[13px] border-[1.5px] border-[#e5e8eb] bg-[#f9fafb] pl-[42px] pr-4 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[#3182f6] focus:bg-white focus:ring-4 focus:ring-[#3182f6]/10"
                  id="forgot-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <button
              className="mt-7 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-[#3182f6] to-[#1b64da] text-[15px] font-extrabold text-white shadow-lg shadow-[#3182f6]/30 transition-transform active:scale-[0.98] disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  보내는 중...
                </>
              ) : (
                "재설정 링크 보내기"
              )}
            </button>
          </form>
        )}

        {toast ? (
          <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full bg-[#191f28] px-4 py-3 text-xs font-semibold text-white shadow-xl">
            <Info className="h-4 w-4 text-[#3182f6]" />
            {toast}
          </div>
        ) : null}
      </div>
    </main>
  );
}
