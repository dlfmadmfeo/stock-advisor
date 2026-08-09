"use client";

import { useEffect } from "react";
import { useAdvisorStore } from "@/stores/use-advisor-store";

// layout.tsx에 한 번 렌더링되어, 앱이 열릴 때 /api/quotes(서버 프록시)를 호출해
// 실시간 시세를 시도합니다. 실패하면 조용히 샘플 데이터 상태로 남습니다.
export function LiveQuoteLoader() {
  const setLiveQuotes = useAdvisorStore((s) => s.setLiveQuotes);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/quotes")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setLiveQuotes(data.quotes ?? {}, data.status ?? "sample", data.source ?? null);
      })
      .catch(() => {
        if (!cancelled) setLiveQuotes({}, "sample");
      });
    return () => {
      cancelled = true;
    };
  }, [setLiveQuotes]);

  return null;
}
