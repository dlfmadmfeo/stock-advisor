"use client";

// ---------------------------------------------------------------------------
// 로그인/회원가입 화면. /login과 /signup은 별도 라우트이고, 이 컴포넌트는 mode를
// prop으로 받는다(새로고침하거나 주소로 바로 들어와도 맞는 화면이 뜨도록).
//
//  - 상단 탭으로 로그인/회원가입 페이지 이동
//  - 회원가입: 비밀번호 확인(불일치 시 즉시 표시), 길이 진행 표시(서버가 검사하는
//    "8자 이상"만 반영), 약관 동의 체크박스(제출 전 필수)
//  - 카카오/Apple 버튼은 실연동 전까지 숨김
// ---------------------------------------------------------------------------

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { SESSION_QUERY_KEY } from "@/lib/use-session";
import { markReturningUser, markSessionOnly } from "@/lib/returning-user-mark";
import { authErrorMessage, isValidEmail } from "@/lib/auth-error-message";
// 데모 로그인 버튼을 숨겨서 사용하지 않음
// import { DEMO_EMAIL, DEMO_PASSWORD } from "@/lib/demo-account";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Mail,
  TrendingUp,
} from "lucide-react";

type Mode = "login" | "signup";

// "로그인 상태 유지" 체크 여부를 기억해 두는 localStorage 키.
const REMEMBER_STORAGE_KEY = "sa_remember_me";

// reset-password-screen.tsx도 같은 값을 씀(서버 쪽 auth.ts의
// minPasswordLength: 4와 반드시 맞춰야 해요 — 화면 문구용 상수라 자동으로
// 동기화되진 않습니다).
export const MIN_PASSWORD_LENGTH = 4;

// 데모 계정 값은 탈퇴 방지(auth.ts)와 공유해서 src/lib/demo-account.ts에 둡니다.


export function LoginScreen({ mode }: { mode: Mode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordConfirm, setShowPasswordConfirm] = useState(false);
  const [remember, setRemember] = useState(true);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [termsError, setTermsError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [verificationPending, setVerificationPending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const isSignup = mode === "signup";
  // 확인란에 뭔가 입력됐을 때부터만 비교 — 타이핑 중간마다 매번 에러가 뜨면
  // 거슬려서, "아직 안 건드림"과 "다르게 입력함"을 구분함.
  const passwordMismatch =
    isSignup && passwordConfirm.length > 0 && password !== passwordConfirm;

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  // "로그인 상태 유지" 선택을 기억해요. 상태 기본값이 true라서 저장해 두지
  // 않으면 해제하고 나가도 다음에 로그인 화면이 열릴 때마다 다시 체크된
  // 채로 시작합니다. 서버 렌더와 어긋나지 않게 마운트 후에 읽어요.
  useEffect(() => {
    try {
      if (window.localStorage.getItem(REMEMBER_STORAGE_KEY) === "0") {
        setRemember(false);
      }
    } catch {
      // 저장소를 못 쓰는 환경(시크릿 모드 등)에서는 기본값(체크)을 그대로 씁니다.
    }
  }, []);

  function changeRemember(next: boolean) {
    setRemember(next);
    try {
      window.localStorage.setItem(REMEMBER_STORAGE_KEY, next ? "1" : "0");
    } catch {
      // 저장 실패는 무시 — 이번 화면에서만 적용됩니다.
    }
  }

  // 세션 만료로 session-guard.tsx가 /login?expired=1로 보낸 경우 안내를 보여준다.
  // 클라이언트에서 한 번만 확인하면 되는 값이라 useSearchParams(Suspense 경계 필요)
  // 대신 window.location을 읽는다.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("expired") === "1") {
      showToast("세션이 만료돼서 로그아웃됐어요. 다시 로그인해주세요.");
    }
    // reset-password-screen.tsx가 재설정 성공 후 /login?reset=1로 보내는
    // 경우 — 새 비밀번호로 다시 로그인해야 함을 안내.
    if (params.get("reset") === "1") {
      showToast("비밀번호가 변경됐어요. 새 비밀번호로 로그인해주세요.");
    }
    // 회원가입 인증 메일의 링크를 눌러서 better-auth가 /login?verified=1로
    // 돌려보낸 경우 — 이제 로그인할 수 있다고 안내.
    if (params.get("verified") === "1") {
      showToast("이메일 인증이 완료됐어요. 로그인해주세요.");
    }
    // 로그아웃한 상태에서 공시 알림을 눌러 들어온 경우(stock/[ticker]/page.tsx).
    // 세션이 만료된 거였다면 위의 expired 안내가 대신 뜹니다.
    if (params.get("loggedout") === "1") {
      showToast("로그아웃된 상태예요. 다시 로그인해주세요.");
    }
    // 회원 탈퇴(delete-account-form.tsx) 직후 돌아온 경우.
    if (params.get("deleted") === "1") {
      showToast("회원 탈퇴가 완료됐어요. 이용해주셔서 감사해요.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // mode/email/password를 인자로 받는 이유: 값을 state에 채우는 것과 동시에 로그인
  // 요청을 보내는 경우, state 업데이트가 비동기라 직후에 읽으면 빈 값일 수 있다.
  //
  // better-auth 클라이언트로 요청한다. signUp.email은 name이 필수인데 별도 입력란이
  // 없어서 이메일 앞부분을 이름으로 쓴다.
  async function submitLogin(targetMode: Mode, targetEmail: string, targetPassword: string) {
    setSubmitting(true);
    try {
      const { data, error } =
        targetMode === "signup"
          ? await authClient.signUp.email({
              email: targetEmail,
              password: targetPassword,
              name: targetEmail.split("@")[0],
              // 인증 메일 링크를 누르면 better-auth가 서버에서 바로 이
              // 주소로 리다이렉트해요(/api/auth/verify-email이 처리).
              callbackURL: "/login?verified=1",
            })
          : await authClient.signIn.email({
              email: targetEmail,
              password: targetPassword,
              // 체크 해제 시 세션 쿠키로 발급(브라우저 닫으면 로그아웃, 서버 만료 1일).
              rememberMe: remember,
            });
      if (error) {
        // 인증 전 계정의 로그인 — better-auth가 인증 메일을 새로 보냈어요
        // (auth.ts emailVerification.sendOnSignIn).
        if (error.code === "EMAIL_NOT_VERIFIED") {
          showToast("이메일 인증이 필요해요. 인증 메일을 다시 보냈으니 메일함을 확인해주세요.");
          return;
        }
        showToast(authErrorMessage(error, "요청에 실패했어요. 잠시 후 다시 시도해주세요."));
        return;
      }
      // 이메일 인증이 필요하면(auth.ts requireEmailVerification) 가입 직후에도 세션이
      // 생기지 않으므로(token: null), 홈으로 보내지 않고 메일 확인 안내를 보여준다.
      if (targetMode === "signup" && !data?.token) {
        setVerificationPending(true);
        return;
      }
      // 전역 staleTime(15초) 동안 이전의 "비로그인" 세션 캐시가 남아 헤더가 갱신되지
      // 않을 수 있으므로, 로그인·회원가입 직후 세션 쿼리를 무효화한다.
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      // 세션 쿠키보다 오래 남는 마커 — src/app/page.tsx가 콜드 스타트
      // 시 "만료됨" 안내 여부를 이걸로 판단합니다.
      markReturningUser();
      markSessionOnly(!remember);
      setSuccess(true);
      // replace로 이동: 로그인 화면이 기록에 남으면 홈에서 뒤로가기 시 캐시된
      // /login?expired=1이 복원돼 만료 안내가 다시 뜬다.
      setTimeout(() => router.replace("/notifications"), 1100);
    } catch {
      showToast("서버에 연결할 수 없어요.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      showToast("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (!isValidEmail(email)) {
      showToast("올바른 이메일 형식이 아니에요. 예: you@example.com");
      return;
    }
    if (isSignup) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        showToast(`비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.`);
        return;
      }
      if (password !== passwordConfirm) {
        showToast("비밀번호가 일치하지 않아요.");
        return;
      }
      if (!agreedToTerms) {
        setTermsError(true);
        return;
      }
    }

    await submitLogin(mode, email, password);
  }

  // 데모 로그인 버튼과 함께 숨김
  // function handleDemoLogin() {
  //   setEmail(DEMO_EMAIL);
  //   setPassword(DEMO_PASSWORD);
  //   submitLogin("login", DEMO_EMAIL, DEMO_PASSWORD);
  // }

  // 서버는 길이(8자 이상)만 검사하기 때문에, 강도 표시도 그것만 반영합니다 —
  // "영문+숫자 조합" 같은 실제로 강제 안 하는 기준을 보여주면 화면과 실제
  // 동작이 어긋나요.
  const passwordStrength =
    password.length === 0
      ? 0
      : password.length < MIN_PASSWORD_LENGTH
        ? -1 // 최소 길이 미달 표시
        : password.length < 12
          ? 2
          : password.length < 16
            ? 3
            : 4;

  return (
    <main className="grid min-h-dvh place-items-center bg-[#f2f4f6] p-0 sm:p-4">
      <div
        className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white sm:h-[840px] sm:rounded-lg sm:border sm:border-[#e5e8eb]"
        data-testid="login-webview"
      >
        <form
          noValidate
          className="animate-auth-mode-in flex h-full flex-col overflow-y-auto px-6 pb-8 pt-10"
          onSubmit={handleSubmit}
        >
          {/* 브랜딩 */}
          <div className="flex flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-lg bg-[var(--brand)]">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-3 text-[19px] font-bold tracking-tight text-[#191f28]">
              주식 어드바이저
            </h1>
            <p className="mt-1.5 text-balance break-keep text-[13px] leading-5 text-[#6b7684]">
              공개 지표로 투명하게 걸러낸 결과만 보여드려요.
            </p>
          </div>

          {/* 로그인/회원가입 탭 */}
          <div className="mt-7 flex gap-1 rounded-lg bg-[#f2f4f6] p-1">
            <Link
              className={`flex-1 rounded-md py-2.5 text-center text-[13px] font-bold transition-all ${
                mode === "login"
                  ? "bg-white text-[#191f28] ring-1 ring-[#e5e8eb]"
                  : "text-[#6b7684]"
              }`}
              href="/login"
            >
              로그인
            </Link>
            <Link
              className={`flex-1 rounded-md py-2.5 text-center text-[13px] font-bold transition-all ${
                mode === "signup"
                  ? "bg-white text-[#191f28] ring-1 ring-[#e5e8eb]"
                  : "text-[#6b7684]"
              }`}
              href="/signup"
            >
              회원가입
            </Link>
          </div>

          {/* 폼 */}
          <div className="mt-7 flex flex-col gap-[18px]">
            <div className="space-y-[7px]">
              <label
                className="text-[12.5px] font-bold text-[#6b7684]"
                htmlFor="login-email"
              >
                이메일
              </label>
              <div className="relative">
                <input
                  autoComplete="email"
                  className="h-[50px] w-full rounded-md border border-[#e5e8eb] bg-[#f9fafb] pl-4 pr-4 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[var(--brand)] focus:bg-white focus:ring-1 focus:ring-[var(--brand)]"
                  id="login-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <div className="space-y-[7px]">
              <div className="flex items-center justify-between">
                <label
                  className="text-[12.5px] font-bold text-[#6b7684]"
                  htmlFor="login-password"
                >
                  비밀번호
                </label>
                {mode === "login" ? (
                  <Link
                    className="text-[12.5px] font-bold text-[var(--brand)]"
                    href="/forgot-password"
                  >
                    비밀번호 찾기
                  </Link>
                ) : null}
              </div>
              <div className="relative">
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="h-[50px] w-full rounded-md border border-[#e5e8eb] bg-[#f9fafb] pl-4 pr-10 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[var(--brand)] focus:bg-white focus:ring-1 focus:ring-[var(--brand)]"
                  id="login-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "login"
                      ? "비밀번호를 입력하세요"
                      : `${MIN_PASSWORD_LENGTH}자 이상 입력해주세요`
                  }
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

              {isSignup && password.length > 0 ? (
                <div className="mt-0.5 flex gap-[5px]">
                  {[0, 1, 2, 3].map((i) => (
                    <i
                      key={i}
                      className="h-[3px] flex-1 rounded-full transition-colors"
                      style={{
                        background:
                          passwordStrength === -1
                            ? i === 0
                              ? "#f04452"
                              : "#e5e8eb"
                            : i < passwordStrength
                              ? "#00c473"
                              : "#e5e8eb",
                      }}
                    />
                  ))}
                </div>
              ) : null}
              {isSignup ? (
                <p className="text-[12px] font-medium text-[#6b7684]">
                  {MIN_PASSWORD_LENGTH}자 이상 입력해주세요
                </p>
              ) : null}
            </div>

            {isSignup ? (
              <div className="space-y-[7px]">
                <label
                  className="text-[12.5px] font-bold text-[#6b7684]"
                  htmlFor="login-password-confirm"
                >
                  비밀번호 확인
                </label>
                <div className="relative">
                  <input
                    autoComplete="new-password"
                    className={`h-[50px] w-full rounded-md border bg-[#f9fafb] pl-4 pr-10 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:bg-white focus:ring-1 ${
                      passwordMismatch
                        ? "border-[#f04452] bg-[#fff6f6] focus:border-[#f04452] focus:ring-[#f04452]"
                        : "border-[#e5e8eb] focus:border-[var(--brand)] focus:ring-[var(--brand)]"
                    }`}
                    id="login-password-confirm"
                    onChange={(e) => setPasswordConfirm(e.target.value)}
                    placeholder="비밀번호를 한 번 더 입력해주세요"
                    type={showPasswordConfirm ? "text" : "password"}
                    value={passwordConfirm}
                  />
                  <button
                    aria-label={
                      showPasswordConfirm ? "비밀번호 확인 숨기기" : "비밀번호 확인 보기"
                    }
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#6b7684]"
                    onClick={() => setShowPasswordConfirm((v) => !v)}
                    type="button"
                  >
                    {showPasswordConfirm ? (
                      <EyeOff className="h-[17px] w-[17px]" />
                    ) : (
                      <Eye className="h-[17px] w-[17px]" />
                    )}
                  </button>
                </div>
                {passwordMismatch ? (
                  <p className="flex items-center gap-1 text-[11.5px] font-semibold text-[#f04452]">
                    <AlertCircle className="h-3 w-3" />
                    비밀번호가 일치하지 않아요
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === "login" ? (
              <label className="-mt-1 flex items-center gap-2 text-xs text-[#6b7684]">
                <input
                  checked={remember}
                  className="h-4 w-4 rounded border-[#c3c9d1] text-[var(--brand)] focus:ring-[var(--brand)]/30"
                  onChange={(e) => changeRemember(e.target.checked)}
                  type="checkbox"
                />
                로그인 상태 유지
              </label>
            ) : (
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-[9px] text-xs leading-[1.6] text-[#6b7684]">
                  <input
                    checked={agreedToTerms}
                    className="mt-[3px] h-4 w-4 shrink-0 rounded border-[#c3c9d1] text-[var(--brand)] focus:ring-[var(--brand)]/30"
                    onChange={(e) => {
                      setAgreedToTerms(e.target.checked);
                      if (e.target.checked) setTermsError(false);
                    }}
                    type="checkbox"
                  />
                  {/* 별도 이용약관 문서가 없어 두 링크 모두 /privacy로 연결한다. */}
                  <span>
                    <Link className="font-bold text-[#191f28] underline" href="/privacy">
                      이용약관
                    </Link>{" "}
                    및{" "}
                    <Link className="font-bold text-[#191f28] underline" href="/privacy">
                      개인정보 처리방침
                    </Link>
                    에 동의합니다.
                  </span>
                </label>
                {termsError ? (
                  <p className="text-[11.5px] font-semibold text-[#f04452]">
                    약관에 동의해야 회원가입을 진행할 수 있어요.
                  </p>
                ) : null}
              </div>
            )}

            <button
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-md bg-[var(--brand)] text-[15px] font-bold text-white active:bg-[var(--brand-strong)] disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {mode === "login" ? "계정 정보 확인 중..." : "계정 만드는 중..."}
                </>
              ) : mode === "login" ? (
                <>로그인</>
              ) : (
                <>회원가입</>
              )}
            </button>

            {/* 데모 로그인 버튼(정식 출시 후 숨김)
            {mode === "login" ? (
              <button
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-[#c9d1db] text-[12.5px] font-bold text-[#6b7684] transition-colors active:bg-[#f2f4f6] disabled:opacity-60"
                disabled={submitting}
                onClick={handleDemoLogin}
                type="button"
              >
                <Loader2
                  className={`h-3.5 w-3.5 ${submitting ? "animate-spin" : "hidden"}`}
                />
                데모 계정으로 바로 둘러보기
              </button>
            ) : null}
            */}
          </div>

          {/* 소셜 로그인 + 하단 */}
          <div className="mt-auto space-y-5 pt-8">
            {/* 카카오/Apple 로그인(실연동 전까지 숨김)
            <div className="relative flex items-center justify-center">
              <div className="h-px w-full bg-[#f2f4f6]" />
              <span className="absolute bg-white px-3 text-[12px] font-semibold text-[#6b7684]">
                간편 로그인
              </span>
            </div>

            <div className="flex gap-2.5">
              <button
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-[#e5e8eb] bg-white text-[12.5px] font-bold text-[#6b7684]"
                onClick={() => showToast("카카오 로그인은 아직 준비 중이에요.")}
                type="button"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#FEE500]">
                  <svg
                    className="h-3.5 w-3.5"
                    fill="#191919"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 3C6.5 3 2 6.4 2 10.6c0 2.7 1.8 5.1 4.6 6.5-.2.7-.7 2.6-.8 3-.1.5.2.5.4.3.2-.1 2.7-1.8 3.8-2.6.6.1 1.3.1 2 .1 5.5 0 10-3.4 10-7.6S17.5 3 12 3Z" />
                  </svg>
                </span>
                카카오
              </button>
              <button
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-md border border-[#e5e8eb] bg-white text-[12.5px] font-bold text-[#6b7684]"
                onClick={() => showToast("Apple 로그인은 아직 준비 중이에요.")}
                type="button"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#111]">
                  <span className="text-[12px] font-bold text-white">A</span>
                </span>
                Apple
              </button>
            </div>
            */}

            <p className="text-center text-xs text-[#6b7684]">
              {mode === "login" ? (
                <>
                  계정이 없으신가요?{" "}
                  <Link className="font-bold text-[var(--brand)]" href="/signup">
                    회원가입
                  </Link>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <Link className="font-bold text-[var(--brand)]" href="/login">
                    로그인
                  </Link>
                </>
              )}
            </p>
          </div>
        </form>

        {/* 성공 오버레이 */}
        {success ? (
          <div className="absolute inset-0 grid place-items-center bg-white">
            <div className="flex flex-col items-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#e7f8ef] text-[#0b7a5a]">
                <Check className="h-8 w-8" strokeWidth={3} />
              </div>
              <p className="mt-4 text-lg font-bold text-[#191f28]">
                {mode === "login" ? "로그인했어요" : "가입이 끝났어요"}
              </p>
              <p className="mt-1 text-sm text-[#6b7684]">
                홈 화면으로 이동할게요.
              </p>
            </div>
          </div>
        ) : null}

        {/* 인증 메일 발송 안내 오버레이 (requireEmailVerification 켜진 뒤에만
            실제로 뜸 — auth.ts 참고) */}
        {verificationPending ? (
          <div className="absolute inset-0 grid place-items-center bg-white px-6">
            <div className="flex flex-col items-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#eef4ff]">
                <Mail className="h-8 w-8 text-[var(--brand)]" />
              </div>
              <p className="mt-4 text-lg font-bold text-[#191f28]">
                이메일을 확인해주세요
              </p>
              <p className="mt-1 text-sm leading-6 text-[#6b7684]">
                {email} 주소로 인증 메일을 보냈어요.
                <br />
                메일의 링크를 눌러야 로그인할 수 있어요.
              </p>
              <Link
                className="mt-8 flex h-12 w-full items-center justify-center rounded-md bg-[var(--brand)] text-[15px] font-bold text-white"
                href="/login"
              >
                로그인 화면으로
              </Link>
            </div>
          </div>
        ) : null}

        {/* 토스트 */}
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
