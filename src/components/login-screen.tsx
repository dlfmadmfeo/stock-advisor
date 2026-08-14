"use client";

// ---------------------------------------------------------------------------
// 로그인 화면 (2026-08-14 세션 추가, 이후 mind-budget 스타일로 재작업).
// mind-budget 프로젝트의 LoginScreen(C:\Users\jun\dev\mind-budget\src\
// components\LoginScreen.tsx)을 구조뿐 아니라 색상/톤까지 그대로 가져왔습니다
// — 바이올렛→인디고 그라데이션, slate 팔레트, 카카오/토스/Apple 소셜 버튼.
// 이 앱 나머지 화면(#191f28/#3182f6 토스블루 톤)과는 의도적으로 다른
// 룩앤필이에요.
//
// ⚠️ 실제 인증이 아닙니다. mind-budget의 LoginScreen과 마찬가지로 setTimeout
// 으로 흉내만 냅니다 — 이 프로젝트엔 세션/유저 테이블 등 인증 인프라가 전혀
// 없어서(단일 사용자용), 포트폴리오용 화면으로 먼저 만들었어요. 어떤
// 라우트도 이 화면 뒤에 보호돼 있지 않습니다.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Check,
  CreditCard,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  TrendingUp,
} from "lucide-react";
import { setStoredEmail } from "@/lib/session";

const DEMO_EMAIL = "demo@stock-advisor.app";
const DEMO_PASSWORD = "demo1234";

export function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(message: string) {
    setToast(message);
    setTimeout(() => setToast(null), 2200);
  }

  function fillDemoAccount() {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    showToast("데모 계정 정보를 채웠어요.");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) {
      showToast("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    setSubmitting(true);
    // 실제 인증 없이 흉내만 냅니다 — 상단 주석 참고. 대신 입력한 이메일은
    // localStorage에 저장해서 GNB 프로필 드롭다운(UserMenu)에 표시해요.
    setTimeout(() => {
      setStoredEmail(email);
      setSubmitting(false);
      setSuccess(true);
      setTimeout(() => router.push("/notifications"), 1100);
    }, 900);
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-slate-100 p-0 sm:p-4">
      <div
        className="relative flex h-dvh w-full max-w-md flex-col overflow-hidden border-slate-200 bg-white sm:h-[840px] sm:rounded-3xl sm:border sm:shadow-2xl"
        data-testid="login-webview"
      >
        <form
          className="flex h-full flex-col justify-between overflow-y-auto px-6 pb-8 pt-10"
          onSubmit={handleSubmit}
        >
          {/* 브랜딩 */}
          <div className="flex flex-col items-center text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-slate-200">
              <TrendingUp className="h-7 w-7 text-white" />
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-400">
              막연한 종목 감이 아니라, 공개 지표로 투명하게 걸러낸 결과만
              보여드려요.
            </p>
          </div>

          {/* 폼 */}
          <div className="my-auto space-y-6 py-8">
            <div className="space-y-1.5">
              <label
                className="text-xs font-bold text-slate-700"
                htmlFor="login-email"
              >
                이메일
              </label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="email"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  id="login-email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  type="email"
                  value={email}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label
                  className="text-xs font-bold text-slate-700"
                  htmlFor="login-password"
                >
                  비밀번호
                </label>
                <button
                  className="text-xs font-semibold text-indigo-600"
                  onClick={() =>
                    showToast("데모 화면이라 재설정은 지원하지 않아요.")
                  }
                  type="button"
                >
                  비밀번호 찾기
                </button>
              </div>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-10 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                  id="login-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호를 입력하세요"
                  type={showPassword ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={
                    showPassword ? "비밀번호 숨기기" : "비밀번호 보기"
                  }
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                  onClick={() => setShowPassword((v) => !v)}
                  type="button"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-500">
              <input
                checked={remember}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/30"
                onChange={(e) => setRemember(e.target.checked)}
                type="checkbox"
              />
              로그인 상태 유지
            </label>

            <button
              className="flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-gradient-to-r from-violet-600 to-indigo-600 text-sm font-bold text-white shadow-md shadow-indigo-200 active:scale-[0.98] disabled:opacity-70"
              disabled={submitting}
              type="submit"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  계정 정보 확인 중...
                </>
              ) : (
                <>로그인</>
              )}
            </button>

            <button
              className="h-11 w-full rounded-sm bg-[#191f28] text-sm font-semibold text-slate-500 text-white"
              onClick={fillDemoAccount}
              type="button"
            >
              데모 계정으로 채우기
            </button>
          </div>

          {/* 소셜 로그인 + 하단 */}
          <div className="space-y-5">
            {/* <div className="relative flex items-center justify-center">
              <div className="h-px w-full bg-slate-100" />
              <span className="absolute bg-white px-3 text-[11px] font-semibold text-slate-400">
                간편 로그인
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <button
                className="flex flex-col items-center gap-1.5"
                onClick={() =>
                  showToast("카카오 로그인은 데모에서 지원하지 않아요.")
                }
                type="button"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-[#FEE500] text-[#191919]">
                  <MessageCircle className="h-5 w-5" fill="currentColor" />
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  카카오
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1.5"
                onClick={() =>
                  showToast("토스 로그인은 데모에서 지원하지 않아요.")
                }
                type="button"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-blue-600 text-white">
                  <CreditCard className="h-5 w-5" />
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  토스
                </span>
              </button>
              <button
                className="flex flex-col items-center gap-1.5"
                onClick={() =>
                  showToast("Apple 로그인은 데모에서 지원하지 않아요.")
                }
                type="button"
              >
                <span className="grid h-11 w-11 place-items-center rounded-full bg-slate-900 text-base font-extrabold text-white">
                  A
                </span>
                <span className="text-[10px] font-semibold text-slate-500">
                  Apple
                </span>
              </button>
            </div> */}

            <p className="text-center text-xs text-slate-500">
              계정이 없으신가요?{" "}
              <button
                className="font-bold text-indigo-600"
                onClick={() =>
                  showToast("데모 화면이라 회원가입은 지원하지 않아요.")
                }
                type="button"
              >
                회원가입
              </button>
            </p>
          </div>
        </form>

        {/* 성공 오버레이 */}
        {success ? (
          <div className="absolute inset-0 grid place-items-center bg-white">
            <div className="flex flex-col items-center text-center">
              <div className="grid h-16 w-16 animate-bounce place-items-center rounded-full bg-emerald-50 text-emerald-500">
                <Check className="h-8 w-8" strokeWidth={3} />
              </div>
              <p className="mt-4 text-lg font-black text-slate-800">
                로그인 완료!
              </p>
              <p className="mt-1 text-sm text-slate-400">
                홈 화면으로 이동할게요.
              </p>
            </div>
          </div>
        ) : null}

        {/* 토스트 */}
        {toast ? (
          <div className="absolute left-1/2 top-6 flex -translate-x-1/2 items-center gap-2 rounded-full bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-xl">
            <Info className="h-4 w-4 text-indigo-400" />
            {toast}
          </div>
        ) : null}
      </div>
    </main>
  );
}
