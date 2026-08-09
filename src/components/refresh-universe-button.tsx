"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useAdvisorStore } from "@/stores/use-advisor-store";

// 홈 화면 버튼. 누르면 /api/universe/refresh(=배치 스크립트와 같은 로직)를
// 실행해서 DB를 실제로 다시 채우고, 끝나면 /api/universe를 다시 불러와
// store를 갱신합니다. 종목 30개 x KIS 호출이라 15~30초 정도 걸려요.
export function RefreshUniverseButton() {
  const [state, setState] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const setUniverse = useAdvisorStore((s) => s.setUniverse);

  async function handleClick() {
    if (state === "loading") return;
    setState("loading");
    setMessage(null);
    try {
      const res = await fetch("/api/universe/refresh", { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setState("error");
        setMessage(data.message ?? "갱신에 실패했어요.");
        return;
      }
      setMessage(data.message ?? "갱신 완료");
      setState("done");

      // 갱신된 DB를 다시 읽어와 화면에 반영
      const universeRes = await fetch("/api/universe");
      const universeData = await universeRes.json();
      if (Array.isArray(universeData.stocks) && universeData.stocks.length > 0) {
        setUniverse(universeData.stocks, universeData.status ?? "db", universeData.updatedAt ?? null);
      }
    } catch (e) {
      setState("error");
      setMessage(e instanceof Error ? e.message : "갱신 중 오류가 발생했어요.");
    } finally {
      setTimeout(() => {
        setState((s) => (s === "loading" ? s : "idle"));
        setMessage(null);
      }, 4000);
    }
  }

  const loading = state === "loading";

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
