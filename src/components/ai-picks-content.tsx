"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui-primitives";
import type { AiPick } from "@/lib/ai-picks";

// AI 추천 화면(관리자 전용)의 클라이언트 조각. 페이지 진입 시 서버에서 이미
// 캐시된 마지막 결과(있으면)를 받아서 바로 보여주고, "다시 생성하기"를
// 누르면 그때만 실제로 Claude를 호출합니다(방문할 때마다 자동 호출하면
// 비용/속도 둘 다 낭비 — refresh-universe-button.tsx와 같은 이유).
export function AiPicksContent({
  initialPicks,
  initialGeneratedAt,
}: {
  initialPicks: AiPick[] | null;
  initialGeneratedAt: string | null;
}) {
  const [picks, setPicks] = useState(initialPicks);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ai-picks/generate", { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.message ?? "생성에 실패했어요.");
        return;
      }
      setPicks(data.picks);
      setGeneratedAt(data.generatedAt);
    } catch {
      setError("서버에 연결할 수 없어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
        <p className="text-xs font-semibold leading-5 text-[#8b95a1]">
          AI가 스크리너 조건·재무 스냅샷·최근 뉴스를 바탕으로 작성한 설명이에요.
          매수·매도 판단이 아니라 데이터 사이의 관계를 요약한 참고 자료예요.
        </p>
        <button
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-[#3182f6] px-3 py-1.5 text-[12px] font-bold text-white transition active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          disabled={loading}
          onClick={handleGenerate}
          type="button"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "생성 중… (몇십 초 걸려요)" : "다시 생성하기"}
        </button>
        {generatedAt ? (
          <p className="mt-2 text-[11px] font-semibold text-[#8b95a1]">
            마지막 생성: {new Date(generatedAt).toLocaleString("ko-KR")}
          </p>
        ) : null}
        {error ? (
          <p className="mt-2 text-[11px] font-semibold text-[#ff5a5a]">{error}</p>
        ) : null}
      </div>

      {picks && picks.length > 0 ? (
        <div className="space-y-3">
          {picks.map((p) => (
            <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]" key={p.ticker}>
              <p className="text-sm font-bold text-[#191f28]">
                {p.name} <span className="font-medium text-[#8b95a1]">{p.ticker}</span>
              </p>
              <p className="mt-1.5 text-sm leading-5 text-[#4e5968]">{p.highlight}</p>
              {p.caution ? (
                <p className="mt-2 rounded-lg bg-[#fff8ec] px-2.5 py-1.5 text-[12px] font-semibold leading-4 text-[#b8860b]">
                  ⚠ {p.caution}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <EmptyState text="아직 생성된 분석이 없어요. 위 버튼으로 생성해보세요." />
      )}
    </div>
  );
}
