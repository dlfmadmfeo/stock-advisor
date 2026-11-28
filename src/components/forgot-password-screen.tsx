"use client";

// ---------------------------------------------------------------------------
// 비밀번호 재설정 요청 화면. authClient.requestPasswordReset으로 재설정 링크를 보내고
// (email.ts), /reset-password?token=...으로 돌아올 주소를 함께 넘긴다.
//
// 계정 존재 여부를 노출하지 않도록 성공 문구는 항상 같게 보여주고, 네트워크 오류일
// 때만 다른 문구를 띄운다.
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, Info, Loader2, Mail } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { isValidEmail } from "@/lib/auth-error-message";

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
    if (submitting) return;
    if (!email) {
      showToast("이메일을 입력해주세요.");
      return;
    }
    if (!isValidEmail(email)) {
      showToast("올바른 이메일 형식이 아니에요. 예: you@example.com");
      return;
    }
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
        className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white sm:h-[840px] sm:rounded-lg sm:border sm:border-[#e5e8eb]"
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
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-[#eef4ff]">
              <Mail className="h-7 w-7 text-[var(--brand)]" />
            </div>
            <h1 className="mt-4 text-[17px] font-bold text-[#191f28]">
              이메일을 확인해주세요
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7684]">
              {email} 주소로 가입된 계정이 있다면, 비밀번호 재설정 링크를
              보내드렸어요.
            </p>
            <Link
              className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] text-[15px] font-bold text-white"
              href="/login"
            >
              로그인 화면으로
            </Link>
          </div>
        ) : (
          <form className="flex flex-1 flex-col px-6 pb-8 pt-6" noValidate onSubmit={handleSubmit}>
            <h1 className="text-[19px] font-bold tracking-tight text-[#191f28]">
              비밀번호 찾기
            </h1>
            <p className="mt-1.5 text-xs leading-5 text-[#6b7684]">
              가입할 때 쓴 이메일 주소를 입력하시면, 비밀번호를 재설정할 수
              있는 링크를 보내드려요.
            </p>

            <div className="mt-7 space-y-[7px]">
              <label className="text-[12.5px] font-bold text-[#6b7684]" htmlFor="forgot-email">
                이메일
              </label>
              <div className="relative">
                <input
                  autoComplete="email"
                  className="h-[50px] w-full rounded-md border border-[#e5e8eb] bg-[#f9fafb] pl-4 pr-4 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[var(--brand)] focus:bg-white focus:ring-1 focus:ring-[var(--brand)]"
                  id="forgot-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <button
              className="mt-7 flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-[var(--brand)] text-[15px] font-bold text-white active:bg-[var(--brand-strong)] disabled:opacity-70"
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
          <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-lg bg-[#191f28] px-4 py-3 text-[13px] font-medium text-white">
            <Info className="h-4 w-4 text-[var(--brand)]" />
            {toast}
          </div>
        ) : null}
      </div>
    </main>
  );
}
