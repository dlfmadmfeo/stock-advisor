"use client";

// ---------------------------------------------------------------------------
// 로그아웃 버튼 + 확인 모달 (2026-08-14 세션 추가, 옵션 B: 별도 버튼 + 확인
// 모달). `LogoutConfirmModal`을 따로 export해서 마이페이지 버튼(`LogoutButton`)
// 이랑 GNB 프로필 드롭다운(`UserMenu`, user-menu.tsx)이 같은 모달을 재사용해요
// — 로그아웃 확인 UX가 앱 안에서 한 군데(이 파일)에만 있으면 되니까요.
//
// ⚠️ 로그인 화면과 마찬가지로 실제 인증이 아닙니다. 세션/쿠키를 지우는 로직
// 없이 그냥 /login으로 이동만 합니다.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { clearStoredEmail } from "@/lib/session";

export function LogoutConfirmModal({
  open,
  onCancel,
}: {
  open: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#191f28]/45 px-6">
      <div className="w-full max-w-[280px] rounded-2xl bg-white p-5 text-center">
        <p className="text-sm font-bold text-[#191f28]">
          로그아웃 하시겠어요?
        </p>
        <p className="mt-1 text-xs font-medium text-[#8b95a1]">
          다시 로그인해야 이용할 수 있어요.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            className="h-10 flex-1 rounded-lg bg-[#f2f4f6] text-xs font-bold text-[#4e5968]"
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-10 flex-1 rounded-lg bg-[#f04452] text-xs font-bold text-white"
            onClick={() => {
              clearStoredEmail();
              router.push("/login");
            }}
            type="button"
          >
            로그아웃
          </button>
        </div>
      </div>
    </div>
  );
}

// 마이페이지(src/app/mypage/page.tsx, 서버 컴포넌트)의 메뉴 카드 아래에 이
// 컴포넌트만 클라이언트로 끼워 넣습니다 — 확인 모달 상태(useState)와 페이지
// 이동(useRouter)이 필요한 부분만 분리한 거예요 (BackTopBar와 같은 패턴).
export function LogoutButton() {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <button
        className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-[#f0999b] bg-white text-sm font-bold text-[#f04452] active:scale-[0.98]"
        onClick={() => setConfirmOpen(true)}
        type="button"
      >
        <LogOut className="h-4 w-4" />
        로그아웃
      </button>
      <LogoutConfirmModal onCancel={() => setConfirmOpen(false)} open={confirmOpen} />
    </>
  );
}
