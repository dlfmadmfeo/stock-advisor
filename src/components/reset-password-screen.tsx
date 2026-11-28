"use client";

// ---------------------------------------------------------------------------
// 새 비밀번호 설정 화면. 메일 링크를 누르면 better-auth가 유효한 토큰은 ?token=...,
// 만료·무효는 ?error=INVALID_TOKEN을 붙여 이 경로로 보낸다. 마운트 시 한 번만 읽으면
// 되는 값이라 useSearchParams 대신 window.location을 쓴다.
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { authErrorMessage } from "@/lib/auth-error-message";
import { MIN_PASSWORD_LENGTH } from "@/components/login-screen";

export function ResetPasswordScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null | undefined>(undefined); // undefined = 아직 확인 전
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("error") === "INVALID_TOKEN" ? null : params.get("token"));
  }, []);

  const passwordMismatch = passwordConfirm.length > 0 && password !== passwordConfirm;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || submitting) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      showToast(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
      return;
    }
    if (password !== passwordConfirm) {
      showToast("비밀번호가 일치하지 않아요.");
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await authClient.resetPassword({ newPassword: password, token });
      if (error) {
        showToast(authErrorMessage(error, "재설정에 실패했어요. 다시 시도해주세요."));
        return;
      }
      router.push("/login?reset=1");
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
        data-testid="reset-password-webview"
      >
        {token === undefined ? null : token === null ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-[#fff0f0]">
              <AlertCircle className="h-7 w-7 text-[#f04452]" />
            </div>
            <h1 className="mt-4 text-[17px] font-bold text-[#191f28]">
              링크가 만료됐거나 올바르지 않아요
            </h1>
            <p className="mt-2 text-[13px] leading-6 text-[#6b7684]">
              비밀번호 재설정을 다시 요청해주세요.
            </p>
            <Link
              className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] text-[15px] font-bold text-white"
              href="/forgot-password"
            >
              다시 요청하기
            </Link>
          </div>
        ) : (
          <form className="flex flex-1 flex-col px-6 pb-8 pt-10" onSubmit={handleSubmit}>
            <h1 className="text-[19px] font-bold tracking-tight text-[#191f28]">
              새 비밀번호 설정
            </h1>
            <p className="mt-1.5 text-xs leading-5 text-[#6b7684]">
              새로 쓸 비밀번호를 입력해주세요.
            </p>

            <div className="mt-7 space-y-[7px]">
              <label className="text-[12.5px] font-bold text-[#6b7684]" htmlFor="reset-password">
                새 비밀번호
              </label>
              <div className="relative">
                <input
                  autoComplete="new-password"
                  className="h-[50px] w-full rounded-md border border-[#e5e8eb] bg-[#f9fafb] pl-4 pr-10 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[var(--brand)] focus:bg-white focus:ring-1 focus:ring-[var(--brand)]"
                  id="reset-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`${MIN_PASSWORD_LENGTH}자 이상 입력해주세요`}
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#6b7684]"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="h-[17px] w-[17px]" />
                  ) : (
                    <Eye className="h-[17px] w-[17px]" />
                  )}
                </button>
              </div>
            </div>

            <div className="mt-[18px] space-y-[7px]">
              <label
                className="text-[12.5px] font-bold text-[#6b7684]"
                htmlFor="reset-password-confirm"
              >
                새 비밀번호 확인
              </label>
              <div className="relative">
                <input
                  autoComplete="new-password"
                  className={`h-[50px] w-full rounded-md border bg-[#f9fafb] pl-4 pr-4 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:bg-white focus:ring-1 ${
                    passwordMismatch
                      ? "border-[#f04452] bg-[#fff6f6] focus:border-[#f04452] focus:ring-[#f04452]"
                      : "border-[#e5e8eb] focus:border-[var(--brand)] focus:ring-[var(--brand)]"
                  }`}
                  id="reset-password-confirm"
                  onChange={(e) => setPasswordConfirm(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력해주세요"
                  type={showPassword ? "text" : "password"}
                  value={passwordConfirm}
                />
              </div>
              {passwordMismatch ? (
                <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#f04452]">
                  <AlertCircle className="h-3 w-3" />
                  비밀번호가 일치하지 않아요
                </p>
              ) : null}
            </div>

            <button
              className="mt-7 flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-[var(--brand)] text-[15px] font-bold text-white active:bg-[var(--brand-strong)] disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  변경하는 중...
                </>
              ) : (
                "비밀번호 변경"
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
