"use client";

// ---------------------------------------------------------------------------
// 마이페이지 "활성 기기" 화면의 실제 콘텐츠 (2026-09-13 세션). better-auth가
// 기본 제공하는 세션 관리 엔드포인트(list-sessions/revoke-session/
// revoke-other-sessions)를 authClient로 그대로 호출합니다 — 서버 쪽에
// 새 API 라우트를 안 만들어도 /api/auth/[...all]이 이미 처리해줘요.
//
// "이 기기"(현재 세션) 판별은 getSession()이 돌려주는 세션의 token과
// listSessions() 각 항목의 token을 비교해서 합니다. 현재 기기는 로그아웃
// 버튼을 안 보여줘요 — 그건 이미 마이페이지의 "로그아웃" 버튼이 하는
// 일이라 여기서 또 만들 필요가 없어서예요.
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { EmptyState } from "@/components/ui-primitives";

type SessionRow = {
  id: string;
  token: string;
  createdAt: string | Date;
  userAgent?: string | null;
};

function describeDevice(ua?: string | null): string {
  if (!ua) return "알 수 없는 기기";
  if (/android/i.test(ua)) return "안드로이드 기기";
  if (/iphone|ipad|ipod/i.test(ua)) return "iPhone/iPad";
  if (/windows/i.test(ua)) return "Windows";
  if (/macintosh|mac os/i.test(ua)) return "Mac";
  return "알 수 없는 기기";
}

export function DeviceSessionsContent() {
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [currentToken, setCurrentToken] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [{ data: list, error: listErr }, { data: session }] = await Promise.all([
      authClient.listSessions(),
      authClient.getSession(),
    ]);
    if (listErr) {
      setError("기기 목록을 불러오지 못했어요.");
      return;
    }
    setSessions((list ?? []) as SessionRow[]);
    setCurrentToken(session?.session?.token ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function revoke(token: string) {
    setBusyKey(token);
    try {
      await authClient.revokeSession({ token });
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  async function revokeOthers() {
    setBusyKey("__others__");
    try {
      await authClient.revokeOtherSessions();
      await load();
    } finally {
      setBusyKey(null);
    }
  }

  if (error) {
    return (
      <div className="px-5 pb-8 pt-3 lg:px-8">
        <EmptyState text={error} />
      </div>
    );
  }

  if (sessions === null) {
    return (
      <p className="px-5 py-10 text-center text-sm font-medium text-[#8b95a1]">
        불러오는 중...
      </p>
    );
  }

  const others = sessions.filter((s) => s.token !== currentToken);

  return (
    <section className="space-y-3 px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
      <p className="text-xs font-medium leading-5 text-[#8b95a1]">
        지금 이 계정으로 로그인돼 있는 기기 목록이에요. 본인이 쓰지 않는
        기기가 있으면 로그아웃시킬 수 있어요.
      </p>

      {others.length > 0 ? (
        <button
          className="w-full rounded-lg border border-[#f0999b] bg-white py-2.5 text-sm font-bold text-[#f04452] active:scale-[0.98] disabled:opacity-50"
          disabled={busyKey === "__others__"}
          onClick={revokeOthers}
          type="button"
        >
          다른 기기 전체 로그아웃
        </button>
      ) : null}

      <div className="overflow-hidden rounded-2xl bg-white ring-1 ring-[#e5e8eb]">
        {sessions.map((s, i) => {
          const isCurrent = s.token === currentToken;
          return (
            <div
              className={`flex items-center gap-3 px-4 py-3.5 ${
                i > 0 ? "border-t border-[#f2f4f6]" : ""
              }`}
              key={s.id}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-[15px] font-semibold text-[#191f28]">
                    {describeDevice(s.userAgent)}
                  </p>
                  {isCurrent ? (
                    <span className="shrink-0 rounded-full bg-[#e6f0ff] px-1.5 py-0.5 text-[10px] font-bold text-[#185fa5]">
                      이 기기
                    </span>
                  ) : null}
                </div>
                <p className="mt-0.5 text-[12px] font-medium text-[#8b95a1]">
                  {new Date(s.createdAt).toLocaleString("ko-KR")} 로그인
                </p>
              </div>
              {!isCurrent ? (
                <button
                  className="shrink-0 rounded-lg border border-[#e5e8eb] px-3 py-1.5 text-xs font-bold text-[#4e5968] active:scale-[0.97] disabled:opacity-50"
                  disabled={busyKey === s.token}
                  onClick={() => revoke(s.token)}
                  type="button"
                >
                  로그아웃
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
