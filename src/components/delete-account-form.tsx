"use client";

// ---------------------------------------------------------------------------
// 회원 탈퇴 폼 (2026-09-25 세션, Google Play 계정 삭제 요구사항). 비밀번호를
// 다시 입력받아 authClient.deleteUser로 보내요 — 서버(auth.ts의 hooks.before)가
// 비밀번호 없는 탈퇴 요청을 거부하니 여기서 우회할 수 없어요. 데모/관리자
// 계정은 서버가 막고, 그 메시지를 그대로 보여줍니다(account-deletion.ts).
// ---------------------------------------------------------------------------

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Eye, EyeOff, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SESSION_QUERY_KEY } from "@/lib/use-session";
import { intentionalLogout } from "@/components/session-guard";
import { clearReturningUserMark } from "@/lib/returning-user-mark";

const DELETED_ITEMS = [
  "계정 정보(이메일, 비밀번호)",
  "관심종목 목록",
  "공시 알림 설정",
  "알림용 기기 등록 정보",
  "로그인한 기기 목록",
];

export function DeleteAccountForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = password.length > 0 && agreed && !submitting;

  async function handleDelete(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    // 탈퇴로 세션이 사라지는 걸 session-guard.tsx가 "세션 만료"로 오해해서
    // 안내를 띄우지 않게 — 직접 로그아웃과 같은 처리(logout-button.tsx 참고).
    intentionalLogout.current = true;
    try {
      const { error: deleteError } = await authClient.deleteUser({ password });
      if (deleteError) {
        intentionalLogout.current = false;
        setError(
          deleteError.code === "INVALID_PASSWORD"
            ? "비밀번호가 맞지 않아요."
            : (deleteError.message ?? "탈퇴에 실패했어요. 잠시 후 다시 시도해주세요."),
        );
        return;
      }
      clearReturningUserMark();
      queryClient.setQueryData(SESSION_QUERY_KEY, null);
      router.push("/login?deleted=1");
    } catch {
      intentionalLogout.current = false;
      setError("서버에 연결할 수 없어요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8" onSubmit={handleDelete}>
      <div className="rounded-2xl bg-[#fff4f4] p-4 ring-1 ring-[#f9d3d6]">
        <p className="flex items-center gap-1.5 text-sm font-extrabold text-[#f04452]">
          <AlertTriangle className="h-4 w-4" />
          탈퇴하면 아래 정보가 모두 삭제돼요
        </p>
        <ul className="mt-2.5 list-disc space-y-1 pl-5 text-[13px] font-medium leading-5 text-[#4e5968]">
          {DELETED_ITEMS.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="mt-3 text-[12px] font-semibold text-[#8b95a1]">
          탈퇴 후에도 같은 이메일로 다시 가입할 수 있어요.
        </p>
      </div>

      <div className="mt-5 space-y-[7px]">
        <label className="text-[12.5px] font-bold text-[#6b7684]" htmlFor="delete-password">
          현재 비밀번호
        </label>
        <div className="relative">
          <input
            autoComplete="current-password"
            className={`h-[50px] w-full rounded-[13px] border-[1.5px] bg-white pl-4 pr-11 text-[14.5px] text-[#191f28] outline-none transition-colors placeholder:text-[#b0b8c1] focus:ring-4 ${
              error
                ? "border-[#f04452] focus:border-[#f04452] focus:ring-[#f04452]/10"
                : "border-[#e5e8eb] focus:border-[#f04452] focus:ring-[#f04452]/10"
            }`}
            id="delete-password"
            onChange={(e) => {
              setPassword(e.target.value);
              // 틀렸다는 안내는 다시 입력하기 시작하면 바로 지움.
              if (error) setError(null);
            }}
            placeholder="본인 확인을 위해 입력해주세요"
            type={showPassword ? "text" : "password"}
            value={password}
          />
          <button
            aria-label={showPassword ? "비밀번호 숨기기" : "비밀번호 보기"}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-[#8b95a1]"
            onClick={() => setShowPassword((v) => !v)}
            type="button"
          >
            {showPassword ? <EyeOff className="h-[17px] w-[17px]" /> : <Eye className="h-[17px] w-[17px]" />}
          </button>
        </div>
        {error ? <p className="text-[12px] font-semibold text-[#f04452]">{error}</p> : null}
        {/* 탈퇴엔 비밀번호가 필요해서, 잊은 사람이 막히지 않게 재설정 경로를 열어둠. */}
        <Link className="inline-block text-[12px] font-semibold text-[#3182f6]" href="/forgot-password">
          비밀번호를 잊으셨나요?
        </Link>
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-[9px] text-[13px] leading-[1.6] text-[#4e5968]">
        <input
          checked={agreed}
          className="mt-[3px] h-4 w-4 shrink-0 rounded border-[#c3c9d1] text-[#f04452] focus:ring-[#f04452]/30"
          onChange={(e) => setAgreed(e.target.checked)}
          type="checkbox"
        />
        <span>삭제된 정보는 복구할 수 없다는 것을 이해했어요.</span>
      </label>

      <button
        className="mt-6 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-[#f04452] text-[15px] font-extrabold text-white transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={!canSubmit}
        type="submit"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            탈퇴 처리 중...
          </>
        ) : (
          "탈퇴하기"
        )}
      </button>
    </form>
  );
}
