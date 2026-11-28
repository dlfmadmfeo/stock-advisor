"use client";

// ---------------------------------------------------------------------------
// 우측 상단 프로필 드롭다운(GNB). 아바타를 누르면 프로필 요약, 메뉴, 로그아웃이 뜬다.
// 홈 화면(HomeHeader)에만 두고, 마이페이지는 이 드롭다운으로만 진입한다
// (하단 탭을 늘리지 않고 계정 관련 진입점을 한곳에 모으기 위해).
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell, Heart, LogOut, UserRound } from "lucide-react";
import { LogoutConfirmModal } from "@/components/logout-button";
import { useSession } from "@/lib/use-session";

const MENU_ITEMS = [
  { href: "/mypage", icon: UserRound, label: "마이페이지" },
  { href: "/watchlist", icon: Heart, label: "관심종목" },
  { href: "/alerts", icon: Bell, label: "알림 설정" },
];

export function UserMenu() {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 실제 세션을 읽는다.
  const { data: user } = useSession();
  const email = user?.email ?? "로그인이 필요해요";
  const rootRef = useRef<HTMLDivElement>(null);

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
        className="grid h-11 w-11 place-items-center rounded-md text-[#333d4b] active:bg-[#f2f4f6]"
        onClick={() => setOpen((v) => !v)}
        type="button"
      >
        <UserRound className="h-5 w-5" />
      </button>

      {open ? (
        <div className="absolute right-2.5 top-12 z-40 w-64 rounded-lg border border-[#e5e8eb] bg-white p-1.5 shadow-[0_4px_16px_rgba(25,31,40,0.06)]">
          <div className="rounded-md px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-[#191f28]">
                {/* 아직 별도 닉네임 필드가 없어서 이메일 앞부분으로 대신
                    표시 — 나중에 User 테이블에 name 컬럼이 생기면 바꾸면 됨. */}
                {user ? `${user.email.split("@")[0]}님` : "게스트님"}
              </p>
              <p className="truncate text-xs font-medium text-[#6b7684]">
                {email}
              </p>
            </div>
          </div>

          <div className="my-1.5 h-px bg-[#f2f4f6]" />

          <nav>
            {MENU_ITEMS.map((item) => (
              <Link
                className="flex h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium text-[#333d4b] hover:bg-[#f7f8fa]"
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
              >
                <item.icon className="h-4 w-4 text-[#6b7684]" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="my-1.5 h-px bg-[#f2f4f6]" />

          <button
            className="flex h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm font-medium text-[#d6333f] hover:bg-[#fdeeee]"
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
