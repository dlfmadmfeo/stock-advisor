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
  ipAddress?: string | null;
};

// User-Agent에서 브라우저 종류를 추출 — MAC 주소 같은 진짜 기기 식별값은
// 브라우저가 서버로 아예 안 보내주는 값이라(로컬 네트워크 밖으로 안 나감)
// 얻을 방법이 없어요. 대신 User-Agent에 이미 실려있는 정보(기기 모델명,
// 브라우저 종류)를 더 자세히 뽑아서 보여줍니다(2026-09-13 세션).
function describeBrowser(ua: string): string {
  if (/SamsungBrowser/i.test(ua)) return "삼성 인터넷";
  if (/EdgA?\//i.test(ua)) return "Edge";
  if (/FxiOS|Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//i.test(ua)) return "Chrome";
  if (/Version\/[\d.]+.*Safari/i.test(ua)) return "Safari";
  return "브라우저";
}

// IP 주소는 "어느 네트워크에서 접속했는지"의 대략적인 출처 정보예요.
// 로컬 개발 서버 접속(::1, 0.0.0.0 형태의 IPv6 루프백, 127.0.0.1)은
// 사용자한테 의미 없는 값이라 안 보여줍니다.
function describeIp(ip?: string | null): string | null {
  if (!ip) return null;
  const isLoopback =
    ip === "127.0.0.1" ||
    ip === "::1" ||
    /^(0{1,4}:){7}0{1,4}$/.test(ip);
  return isLoopback ? null : ip;
}

function describeDevice(ua?: string | null): string {
  if (!ua) return "알 수 없는 기기";

  if (/android/i.test(ua)) {
    // "Android 16; SM-S948N Build/..." 형태에서 모델명만 뽑아냄. "K"처럼
    // 제조사가 기기명 대신 넣는 placeholder는 실제 모델명이 아니라서 걸러요.
    const match = ua.match(/Android\s+[\d.]+;\s*([A-Za-z0-9 _-]+?)(?:\s+Build\/|[;)])/);
    const model = match?.[1]?.trim();
    const hasRealModel = !!model && model.length > 2 && !/^[A-Z]{1,2}\d*$/.test(model);
    const modelLabel = hasRealModel ? model : "안드로이드";
    // Flutter 앱의 WebView는 UA에 "; wv)" 마커가 붙어요 — 웹 브라우저가
    // 아니라 이 앱 자체에서 로그인한 세션이라는 뜻이라 따로 표시할 가치가 있음.
    if (/;\s*wv\)/i.test(ua)) return `${modelLabel} · 앱`;
    return `${modelLabel} · ${describeBrowser(ua)}`;
  }
  if (/ipad/i.test(ua)) return `iPad · ${describeBrowser(ua)}`;
  if (/iphone/i.test(ua)) return `iPhone · ${describeBrowser(ua)}`;
  if (/windows/i.test(ua)) {
    if (/Claude\//i.test(ua)) return "Windows · Claude 앱";
    return `Windows · ${describeBrowser(ua)}`;
  }
  if (/macintosh|mac os/i.test(ua)) return `Mac · ${describeBrowser(ua)}`;
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
                  {describeIp(s.ipAddress) ? ` · ${describeIp(s.ipAddress)}` : ""}
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
