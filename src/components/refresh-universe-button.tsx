"use client";

import { RefreshCw } from "lucide-react";
import { useAdvisorStore } from "@/stores/use-advisor-store";
import { useSession } from "@/lib/use-session";

// 홈 화면 버튼. 누르면 /api/universe/refresh(=배치 스크립트와 같은 로직)를
// 실행해서 DB를 실제로 다시 채우고, 끝나면 /api/universe를 다시 불러와
// store를 갱신합니다. 종목 30개 x KIS 호출이라 15~30초 정도 걸려요.
//
// 진행 상태(state/message)는 이 컴포넌트의 로컬 state가 아니라
// useAdvisorStore에 둡니다 — 로컬 useState였을 땐 다른 화면으로 이동했다가
// 돌아오면 이 컴포넌트가 언마운트/재마운트되면서 idle로 리셋돼서, 서버
// 갱신이 실제로는 계속 진행 중인데도 로딩 표시가 사라져버렸어요
// (2026-08-22 세션에 발견). store는 컴포넌트 마운트 여부와 무관하게
// 값이 유지되니 화면을 오가도 진행 상태가 그대로 보입니다.
//
// 2026-08-23 세션: 서버(/api/universe/refresh)가 이제 관리자만 허용하도록
// 막혀있어서, 관리자가 아니면 이 버튼 자체를 안 보여줍니다. 이건 UX용
// 숨김일 뿐이고 실제 차단은 서버가 함 — 클라이언트 체크만 믿으면 안 되니까
// (누구나 개발자 도구로 우회 가능) 서버 쪽 403이 진짜 방어선입니다.
export function RefreshUniverseButton() {
  const { data: session } = useSession();
  const state = useAdvisorStore((s) => s.universeRefreshState);
  const message = useAdvisorStore((s) => s.universeRefreshMessage);
  const setRefreshState = useAdvisorStore((s) => s.setUniverseRefreshState);
  const setUniverse = useAdvisorStore((s) => s.setUniverse);

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
      setRefreshState("done", data.message ?? "갱신 완료");

      // 갱신된 DB를 다시 읽어와 화면에 반영
      const universeRes = await fetch("/api/universe");
      const universeData = await universeRes.json();
      if (Array.isArray(universeData.stocks) && universeData.stocks.length > 0) {
        setUniverse(universeData.stocks, universeData.status ?? "db", universeData.updatedAt ?? null);
      }
    } catch (e) {
      setRefreshState("error", e instanceof Error ? e.message : "갱신 중 오류가 발생했어요.");
    } finally {
      setTimeout(() => {
        // 타임아웃이 실행될 때 기준으로 최신 상태를 다시 읽어야 함 — 그
        // 사이에 사용자가 다시 눌러서 새 요청이 loading 중일 수 있음.
        if (useAdvisorStore.getState().universeRefreshState !== "loading") {
          setRefreshState("idle", null);
        }
      }, 4000);
    }
  }

  const loading = state === "loading";

  if (!session?.isAdmin) return null;

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
