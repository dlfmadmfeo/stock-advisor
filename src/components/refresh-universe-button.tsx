"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";
import { useAdvisorStore } from "@/stores/use-advisor-store";
import { useSession } from "@/lib/use-session";

const POLL_INTERVAL_MS = 5000;

// 유니버스 새로고침 버튼. /api/universe/refresh(배치 스크립트와 같은 로직)로 DB를
// 다시 채우고, 끝나면 /api/universe로 store를 갱신한다(보통 2~4분).
//
//  - 진행 상태는 useAdvisorStore에 둬서 화면을 오가도 유지된다.
//  - 앱을 다시 켜면 store도 초기화되므로, 마운트 시 서버(DB 락)에 갱신 중인지 묻고
//    진행 중이면 끝날 때까지 주기적으로 다시 확인한다.
//  - 관리자가 아니면 버튼을 숨긴다. 실제 차단은 서버의 403이 담당한다.
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
        className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium ring-1 transition ${
          loading
            ? "cursor-not-allowed bg-[#f2f4f6] text-[#6b7684] ring-[#e5e8eb]"
            : "bg-white text-[#4e5968] ring-[#e5e8eb] hover:bg-[#f2f4f6]"
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
          className={`absolute right-0 top-full z-10 mt-1 w-72 max-w-[calc(100vw-2rem)] whitespace-normal rounded bg-white p-1 text-[12px] font-semibold ${
            state === "error" ? "text-[#ff5a5a]" : "text-[#0b7a5a]"
          }`}
        >
          {message}
        </span>
      ) : null}
    </div>
  );
}
