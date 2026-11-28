"use client";

// ---------------------------------------------------------------------------
// 로그아웃 버튼 + 확인 모달. LogoutConfirmModal을 export해 마이페이지 버튼과
// GNB 프로필 드롭다운(user-menu.tsx)이 같은 모달을 쓴다.
// 로그아웃은 authClient.signOut()(/api/auth/sign-out)으로 처리한다.
// ---------------------------------------------------------------------------

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { SESSION_QUERY_KEY } from "@/lib/use-session";
import { intentionalLogout } from "@/components/session-guard";
import { clearReturningUserMark } from "@/lib/returning-user-mark";

export function LogoutConfirmModal({
  open,
  onCancel,
}: {
  open: boolean;
  onCancel: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-[#191f28]/45 px-6">
      <div className="w-full max-w-[280px] rounded-lg bg-white p-5 text-center">
        <p className="text-sm font-bold text-[#191f28]">
          로그아웃 하시겠어요?
        </p>
        <p className="mt-1 text-xs font-medium text-[#6b7684]">
          다시 로그인해야 이용할 수 있어요.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            className="h-10 flex-1 rounded-md bg-[#f2f4f6] text-xs font-bold text-[#4e5968]"
            onClick={onCancel}
            type="button"
          >
            취소
          </button>
          <button
            className="h-10 flex-1 rounded-md bg-[#f04452] text-xs font-bold text-white"
            onClick={async () => {
              // session-guard.tsx가 이 직후의 세션 null 전이를 "직접
              // 로그아웃"으로 알아보고 만료 안내를 건너뛰게 하는 플래그.
              intentionalLogout.current = true;
              try {
                await authClient.signOut();
              } finally {
                // 직접 로그아웃했으니 다음에 앱을 다시 열어도 "세션
                // 만료" 안내가 뜨면 안 됨 — 마커도 같이 지움.
                clearReturningUserMark();
                queryClient.setQueryData(SESSION_QUERY_KEY, null);
                // replace로 이동: 로그아웃 전 화면이 기록에 남으면 로그인 화면에서 뒤로가기 시
                // 다시 나타난다.
                router.replace("/login");
              }
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
        className="mt-3 flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-[#f0999b] bg-white text-sm font-bold text-[#f04452] active:scale-[0.98]"
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
