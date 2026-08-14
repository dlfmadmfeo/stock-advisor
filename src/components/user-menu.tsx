"use client";

// ---------------------------------------------------------------------------
// 우측 상단 프로필 드롭다운 (GNB, 2026-08-14 세션 추가). GitHub 우상단
// 아바타 메뉴 참고 — 아바타 클릭 → 프로필 요약 + 메뉴 리스트 + 로그아웃이
// 드롭다운으로 뜸.
//
// 홈 화면(HomeHeader, mobile-screens.tsx)에만 붙였어요. 하단 탭의 "관심"은
// 원래 라벨(하트 아이콘)대로 /watchlist로 고치고, 마이페이지는 이제 이
// 드롭다운을 통해서만 들어가는 구조로 바꿨습니다 — 하단 탭에 억지로 6번째
// 탭을 추가하는 대신, GitHub류 앱들처럼 "내 계정" 관련 진입점은 우상단
// 아바타로 모으는 편이 화면 낭비가 적어서요.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, ChevronRight, Heart, History, LogOut, UserRound } from "lucide-react";
import { LogoutConfirmModal } from "@/components/logout-button";
import { getStoredEmail } from "@/lib/session";

const MENU_ITEMS = [
  { href: "/mypage", icon: UserRound, label: "마이페이지" },
  { href: "/watchlist", icon: Heart, label: "관심종목" },
  { href: "/history", icon: History, label: "스크리너 이력" },
];

const DEFAULT_EMAIL = "kimtuja@example.com";

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const rootRef = useRef<HTMLDivElement>(null);

  // 로그인 화면(login-screen.tsx)에서 입력한 이메일을 localStorage에서 읽어와요.
  // 이 화면은 로그인 성공 후 새로 마운트되는 라우트라 마운트 시점에 한 번만
  // 읽으면 충분합니다.
  useEffect(() => {
    const stored = getStoredEmail();
    if (stored) setEmail(stored);
  }, []);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-label="프로필 메뉴 열기"
        className="grid h-10 w-10 place-items-center rounded-full bg-[#f2f7ff] ring-1 ring-[#e5e8eb] active:scale-[0.98]"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <UserRound className="h-5 w-5 text-[#3182f6]" />
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-40 w-64 rounded-2xl bg-white p-2 shadow-[0_12px_32px_rgba(25,31,40,0.16)] ring-1 ring-[#e5e8eb]">
          <div className="flex items-center gap-3 rounded-xl px-3 py-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#f2f7ff]">
              <UserRound className="h-5 w-5 text-[#3182f6]" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#191f28]">
                김투자님
              </p>
              <p className="truncate text-xs font-medium text-[#8b95a1]">
                {email}
              </p>
            </div>
          </div>

          <div className="my-1.5 h-px bg-[#f2f4f6]" />

          <nav>
            {MENU_ITEMS.map((item) => (
              <Link
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-semibold text-[#333d4b] hover:bg-[#f7f8fa]"
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <item.icon className="h-4 w-4 text-[#8b95a1]" />
                {item.label}
              </Link>
            ))}
            <button
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-[#333d4b] hover:bg-[#f7f8fa]"
              onClick={() => setOpen(false)}
              type="button"
            >
              <Bell className="h-4 w-4 text-[#8b95a1]" />
              알림 설정
              <ChevronRight className="ml-auto h-4 w-4 text-[#c3c9d1]" />
            </button>
          </nav>

          <div className="my-1.5 h-px bg-[#f2f4f6]" />

          <button
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-bold text-[#f04452] hover:bg-[#fdeeee]"
            onClick={() => {
              setOpen(false);
              setConfirmOpen(true);
            }}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            로그아웃
          </button>
        </div>
      ) : null}

      <LogoutConfirmModal onCancel={() => setConfirmOpen(false)} open={confirmOpen} />
    </div>
  );
}
