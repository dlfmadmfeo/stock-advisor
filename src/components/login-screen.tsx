"use client";

// ---------------------------------------------------------------------------
// 로그인/회원가입 화면 (2026-08-14 세션 추가, 이후 mind-budget 스타일로
// 재작업했다가 2026-08-19 세션에 다시 리디자인).
//
// 2026-08-18 세션: /api/auth/login, /api/auth/signup을 진짜로 호출하도록
// 바꿨어요. User 테이블(email unique)이 생기면서 회원가입도 실제로 동작.
//
// 2026-08-19 세션: 바이올렛/인디고 그라데이션(mind-budget 톤)이 앱 나머지
// 화면(#191f28/#3182f6 토스블루 톤)이랑 안 맞아서, 토스블루로 통일해서
// 다시 그렸습니다(HTML 목업으로 먼저 미리보기 확인 후 반영). 이번에 같이
// 추가된 것들:
//  - 상단 탭(로그인/회원가입)으로 모드 전환 — 기존엔 하단 텍스트 링크만 있었음
//  - 회원가입 전용: 비밀번호 확인 필드(불일치 시 실시간 에러), 비밀번호 길이
//    진행 표시(strength bar — 서버가 길이만 검사해서 "8자 이상"만 반영,
//    "영문/숫자 포함" 같은 실제로 안 지켜지는 요구사항은 안 보여줌),
//    약관 동의 체크박스(제출 전 필수, 예전엔 문구만 있고 체크박스가 없었음)
//  - 카카오/Apple 버튼을 다시 노출(그동안 주석 처리돼 있었음) — 실제 연동은
//    없고 "준비 중" 토스트만 띄움
//
// 어떤 라우트도 아직 이 화면 뒤에 보호돼 있지는 않습니다(로그인 안 해도
// /watchlist 같은 화면 URL로 바로 들어갈 수 있음 — 별도 작업 필요. 단
// /watchlist는 서버 컴포넌트에서 세션 체크해서 /login으로 리다이렉트하도록
// 이미 고쳐둠, watchlist-data.ts 참고).
//
// 2026-08-20 세션: 로그인/회원가입을 한 화면 안에서 mode state로 탭
// 전환하던 방식에서, /login과 /signup을 서로 다른 라우트로 분리했어요.
// 이 컴포넌트는 이제 mode를 내부 state가 아니라 prop으로 받고(각 라우트의
// page.tsx가 넘겨줌), 탭/하단 링크는 setMode 대신 실제 페이지 이동(Link)을
// 씁니다 — 그래서 /login, /signup 각각 주소창에 직접 쳐서 들어가거나
// 새로고침해도 항상 맞는 화면이 떠요(예전 방식은 항상 /login 하나로만
// 들어가서 새로고침하면 회원가입 탭이 로그인 탭으로 리셋됐었음).
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { SESSION_QUERY_KEY } from "@/lib/use-session";
import {
  AlertCircle,
  Check,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Mail,
  TrendingUp,
} from "lucide-react";

type Mode = "login" | "signup";

const MIN_PASSWORD_LENGTH = 4;

// 데모 계정 — DB에 미리 가입되어 있어야 동작합니다. 직접 /login 화면에서
// 이 이메일/비밀번호로 한 번 회원가입해두면 그 뒤로 계속 이 버튼으로
// 로그인돼요 (서버에 자동으로 시드하는 스크립트는 따로 없음).
const DEMO_EMAIL = "demo@stock-advisor.app";
const DEMO_PASSWORD = "demo1234";

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

  // mode/email/password를 state에서 읽지 않고 인자로 받는 이유: 데모 로그인
  // 버튼이 setEmail/setPassword로 state를 채우는 것과 동시에 바로 로그인
  // 요청까지 보내야 하는데, React state 업데이트는 비동기라 그 직후에
  // email/password state를 읽으면 아직 빈 문자열일 수 있음. 그래서 실제
  // 로그인 로직은 인자로 받은 값을 쓰게 분리함.
  //
  // 2026-08-20 세션: fetch(`/api/auth/${mode}`) 직접 호출하던 걸
  // better-auth 클라이언트(authClient)로 교체. authClient.signUp.email에는
  // name이 필수라서(better-auth User 모델 공통 필드), 화면엔 별도 입력란이
  // 없으니 이메일 앞부분을 이름으로 씀 — 나중에 실제 닉네임 입력을
  // 받고 싶으면 여기 name만 바꾸면 됨.
  async function submitLogin(targetMode: Mode, targetEmail: string, targetPassword: string) {
    setSubmitting(true);
    try {
      const { error } =
        targetMode === "signup"
          ? await authClient.signUp.email({
              email: targetEmail,
              password: targetPassword,
              name: targetEmail.split("@")[0],
            })
          : await authClient.signIn.email({
              email: targetEmail,
              password: targetPassword,
            });
      if (error) {
        showToast(error.message ?? "요청에 실패했어요.");
        return;
      }
      // 2026-08-20 세션: query-provider.tsx의 전역 staleTime(15초) 때문에,
      // 로그인 직전에 다른 화면에서 이미 세션 쿼리가 "비로그인"으로
      // 캐시돼있으면 로그인에 성공해도 15초 동안 그 캐시가 그대로 보여서
      // 헤더가 "게스트님"으로 남아있는 버그가 있었음. logout-button.tsx가
      // 로그아웃 후 캐시를 직접 갱신하는 것처럼, 로그인/회원가입 성공
      // 직후에도 세션 쿼리를 무효화해서 즉시 새로 불러오게 함.
      await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      setSuccess(true);
      setTimeout(() => router.push("/notifications"), 1100);
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

  function handleDemoLogin() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    submitLogin("login", DEMO_EMAIL, DEMO_PASSWORD);
  }

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
        className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-white sm:h-[840px] sm:rounded-3xl sm:border sm:border-[#e5e8eb] sm:shadow-2xl"
        data-testid="login-webview"
      >
        <form
          className="flex h-full flex-col overflow-y-auto px-6 pb-8 pt-10"
          onSubmit={handleSubmit}
        >
          {/* 브랜딩 */}
          <div className="flex flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#3182f6] to-[#1b64da] shadow-lg shadow-[#3182f6]/30">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <h1 className="mt-3 text-[19px] font-extrabold tracking-tight text-[#191f28]">
              주식 어드바이저
            </h1>
            <p className="mt-1.5 text-xs leading-5 text-[#8b95a1]">
              막연한 종목 감이 아니라, 공개 지표로 투명하게 걸러낸 결과만
              보여드려요.
            </p>
          </div>

          {/* 로그인/회원가입 탭 */}
          <div className="mt-7 flex gap-1 rounded-xl bg-[#f2f4f6] p-1">
            <Link
              className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold transition-all ${
                mode === "login"
                  ? "bg-white text-[#191f28] shadow-sm"
                  : "text-[#8b95a1]"
              }`}
              href="/login"
            >
              로그인
            </Link>
            <Link
              className={`flex-1 rounded-[9px] py-2.5 text-center text-[13px] font-bold transition-all ${
                mode === "signup"
                  ? "bg-white text-[#191f28] shadow-sm"
                  : "text-[#8b95a1]"
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
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b95a1]" />
                <input
                  autoComplete="email"
                  className="h-[50px] w-full rounded-[13px] border-[1.5px] border-[#e5e8eb] bg-[#f9fafb] pl-[42px] pr-4 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[#3182f6] focus:bg-white focus:ring-4 focus:ring-[#3182f6]/10"
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
                  <button
                    className="text-[12.5px] font-bold text-[#3182f6]"
                    onClick={() =>
                      showToast("아직 비밀번호 재설정은 지원하지 않아요.")
                    }
                    type="button"
                  >
                    비밀번호 찾기
                  </button>
                ) : null}
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b95a1]" />
                <input
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  className="h-[50px] w-full rounded-[13px] border-[1.5px] border-[#e5e8eb] bg-[#f9fafb] pl-[42px] pr-10 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:border-[#3182f6] focus:bg-white focus:ring-4 focus:ring-[#3182f6]/10"
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8b95a1]"
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
                <p className="text-[11px] font-medium text-[#8b95a1]">
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
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-[17px] w-[17px] -translate-y-1/2 text-[#8b95a1]" />
                  <input
                    autoComplete="new-password"
                    className={`h-[50px] w-full rounded-[13px] border-[1.5px] bg-[#f9fafb] pl-[42px] pr-10 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:bg-white focus:ring-4 ${
                      passwordMismatch
                        ? "border-[#f04452] bg-[#fff6f6] focus:border-[#f04452] focus:ring-[#f04452]/10"
                        : "border-[#e5e8eb] focus:border-[#3182f6] focus:ring-[#3182f6]/10"
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
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8b95a1]"
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
                  className="h-4 w-4 rounded border-[#c3c9d1] text-[#3182f6] focus:ring-[#3182f6]/30"
                  onChange={(e) => setRemember(e.target.checked)}
                  type="checkbox"
                />
                로그인 상태 유지
              </label>
            ) : (
              <div className="space-y-1.5">
                <label className="flex cursor-pointer items-start gap-[9px] text-xs leading-[1.6] text-[#6b7684]">
                  <input
                    checked={agreedToTerms}
                    className="mt-[3px] h-4 w-4 shrink-0 rounded border-[#c3c9d1] text-[#3182f6] focus:ring-[#3182f6]/30"
                    onChange={(e) => {
                      setAgreedToTerms(e.target.checked);
                      if (e.target.checked) setTermsError(false);
                    }}
                    type="checkbox"
                  />
                  <span>
                    <b className="font-bold text-[#191f28]">이용약관</b> 및{" "}
                    <b className="font-bold text-[#191f28]">개인정보 처리방침</b>에
                    동의합니다.
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
              className="flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-gradient-to-br from-[#3182f6] to-[#1b64da] text-[15px] font-extrabold text-white shadow-lg shadow-[#3182f6]/30 transition-transform active:scale-[0.98] disabled:opacity-70"
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

            {mode === "login" ? (
              <button
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-[13px] border-[1.5px] border-dashed border-[#c9d1db] text-[12.5px] font-bold text-[#6b7684] transition-colors active:bg-[#f2f4f6] disabled:opacity-60"
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
          </div>

          {/* 소셜 로그인 + 하단 */}
          <div className="mt-auto space-y-5 pt-8">
            <div className="relative flex items-center justify-center">
              <div className="h-px w-full bg-[#f2f4f6]" />
              <span className="absolute bg-white px-3 text-[11px] font-semibold text-[#8b95a1]">
                간편 로그인
              </span>
            </div>

            <div className="flex gap-2.5">
              <button
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-[#e5e8eb] bg-white text-[12.5px] font-bold text-[#6b7684]"
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
                className="flex h-12 flex-1 items-center justify-center gap-2 rounded-[13px] border-[1.5px] border-[#e5e8eb] bg-white text-[12.5px] font-bold text-[#6b7684]"
                onClick={() => showToast("Apple 로그인은 아직 준비 중이에요.")}
                type="button"
              >
                <span className="grid h-6 w-6 place-items-center rounded-full bg-[#111]">
                  <span className="text-[11px] font-extrabold text-white">A</span>
                </span>
                Apple
              </button>
            </div>

            <p className="text-center text-xs text-[#6b7684]">
              {mode === "login" ? (
                <>
                  계정이 없으신가요?{" "}
                  <Link className="font-bold text-[#3182f6]" href="/signup">
                    회원가입
                  </Link>
                </>
              ) : (
                <>
                  이미 계정이 있으신가요?{" "}
                  <Link className="font-bold text-[#3182f6]" href="/login">
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
              <div className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-[#e7f8ef] text-[#00c473]">
                <Check className="h-8 w-8" strokeWidth={3} />
              </div>
              <p className="mt-4 text-lg font-black text-[#191f28]">
                {mode === "login" ? "로그인 완료!" : "회원가입 완료!"}
              </p>
              <p className="mt-1 text-sm text-[#8b95a1]">
                홈 화면으로 이동할게요.
              </p>
            </div>
          </div>
        ) : null}

        {/* 토스트 */}
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
