"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useAdvisorStore } from "@/stores/use-advisor-store";
import { useSession } from "@/lib/use-session";

const POLL_INTERVAL_MS = 5000;

// 홈 화면 버튼. 누르면 /api/universe/refresh(=배치 스크립트와 같은 로직)를
// 실행해서 DB를 실제로 다시 채우고, 끝나면 /api/universe를 다시 불러와
// store를 갱신합니다. 종목 200개 x KIS 호출이라 보통 2~4분 걸려요.
//
// 진행 상태(state/message)는 이 컴포넌트의 로컬 state가 아니라
// useAdvisorStore에 둡니다 — 로컬 useState였을 땐 다른 화면으로 이동했다가
// 돌아오면 이 컴포넌트가 언마운트/재마운트되면서 idle로 리셋돼서, 서버
// 갱신이 실제로는 계속 진행 중인데도 로딩 표시가 사라져버렸어요
// (2026-08-22 세션에 발견). store는 컴포넌트 마운트 여부와 무관하게
// 값이 유지되니 화면을 오가도 진행 상태가 그대로 보입니다.
//
// 2026-08-24 세션: 그런데 useAdvisorStore도 결국 브라우저(WebView) 메모리
// 안에 있는 거라, **앱을 아예 껐다 켜면** 그 메모리 자체가 날아가서 똑같은
// 문제가 재발했어요(제보로 발견) — 서버는 계속 갱신 중인데 새로 뜬 화면은
// "새로고침" 버튼이 눌러도 되는 것처럼 보임. 그래서 마운트될 때 서버(DB
// 락, GET /api/universe/refresh)한테 "지금 진짜 갱신 중이야?"를 직접
// 물어보고, 맞으면 로딩 상태로 맞춘 뒤 끝날 때까지 주기적으로 다시 물어봐요
// — 클라이언트가 자기 기억이 아니라 서버 상태를 진실의 기준으로 삼도록 함.
//
// 2026-08-23 세션: 서버(/api/universe/refresh)가 이제 관리자만 허용하도록
// 막혀있어서, 관리자가 아니면 이 버튼 자체를 안 보여줍니다. 이건 UX용
// 숨김일 뿐이고 실제 차단은 서버가 함 — 클라이언트 체크만 믿으면 안 되니까
// (누구나 개발자 도구로 우회 가능) 서버 쪽 403이 진짜 방어선입니다.
export function RefreshUniverseButton() {
  const { data: session } = useSession();
  const isAdmin = session?.isAdmin ?? false;
  const state = useAdvisorStore((s) => s.universeRefreshState);
  const message = useAdvisorStore((s) => s.universeRefreshMessage);
  const setRefreshState = useAdvisorStore((s) => s.setUniverseRefreshState);
  const setUniverse = useAdvisorStore((s) => s.setUniverse);

  // 갱신이 끝난(또는 이미 끝나 있던) 걸 확인했을 때 공통으로 하는 마무리:
  // 최신 유니버스를 다시 읽어와 store에 반영 + 잠깐 있다가 idle로 되돌림.
  async function syncUniverseAfterRefresh(doneMessage: string) {
    setRefreshState("done", doneMessage);
    const universeRes = await fetch("/api/universe");
    const universeData = await universeRes.json();
    if (Array.isArray(universeData.stocks) && universeData.stocks.length > 0) {
      setUniverse(universeData.stocks, universeData.status ?? "db", universeData.updatedAt ?? null);
    }
    setTimeout(() => {
      if (useAdvisorStore.getState().universeRefreshState !== "loading") {
        setRefreshState("idle", null);
      }
    }, 4000);
  }

  // 관리자로 확인되면(=버튼이 실제로 보이면) 마운트 시 한 번 서버 상태를
  // 확인하고, 진행 중이면 끝날 때까지 폴링합니다.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function poll() {
      try {
        const res = await fetch("/api/universe/refresh");
        const data: { isRunning: boolean } = await res.json();
        if (cancelled) return;

        if (data.isRunning) {
          if (useAdvisorStore.getState().universeRefreshState !== "loading") {
            setRefreshState("loading", null);
          }
          timer = setTimeout(poll, POLL_INTERVAL_MS);
        } else if (useAdvisorStore.getState().universeRefreshState === "loading") {
          // 로딩 중으로 보고 있었는데 서버는 이미 끝나있었던 경우
          // (다른 탭/기기에서 시작한 걸 보고 있었거나, 폴링 사이 완료된 경우).
          await syncUniverseAfterRefresh("갱신 완료");
        }
      } catch {
        // 네트워크 문제 등은 조용히 무시하고 다음 폴링에서 다시 시도.
        if (!cancelled) timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  async function handleClick() {
    if (useAdvisorStore.getState().universeRefreshState === "loading") return;
    setRefreshState("loading", null);
    try {
      const res = await fetch("/api/universe/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setRefreshState("error", data.message ?? "갱신에 실패했어요.");
        return;
      }
      await syncUniverseAfterRefresh(data.message ?? "갱신 완료");
    } catch (e) {
      setRefreshState("error", e instanceof Error ? e.message : "갱신 중 오류가 발생했어요.");
      setTimeout(() => {
        if (useAdvisorStore.getState().universeRefreshState !== "loading") {
          setRefreshState("idle", null);
        }
      }, 4000);
    }
  }

  const loading = state === "loading";

  if (!isAdmin) return null;

  return (
    <div className="relative">
      <button
        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ring-1 transition ${
          loading
            ? "cursor-not-allowed bg-[#f2f4f6] text-[#8b95a1] ring-[#e5e8eb]"
            : "bg-white text-[#4e5968] ring-[#e5e8eb] hover:bg-[#f2f4f6] active:scale-[0.97]"
        }`}
        disabled={loading}
        onClick={handleClick}
        type="button"
      >
        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
        {loading ? "유니버스 갱신 중… (최대 몇 분 소요)" : "유니버스 새로고침"}
      </button>
      {message ? (
        <span
          className={`absolute right-0 top-full mt-1 whitespace-nowrap text-[11px] font-semibold ${
            state === "error" ? "text-[#ff5a5a]" : "text-[#00a878]"
          }`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
