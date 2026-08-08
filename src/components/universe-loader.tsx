"use client";

import { useEffect } from "react";
import { useAdvisorStore } from "@/stores/use-advisor-store";

// layout.tsx에서 한 번 렌더링되어, 앱이 열릴 때 /api/universe(배치로 계산된
// DB 유니버스)를 불러옵니다. 실패하거나 DB가 비어있으면 stocks.ts 샘플이
// 그대로 유지됩니다 (store 초기값 참고).
export function UniverseLoader() {
  const setUniverse = useAdvisorStore((s) => s.setUniverse);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/universe")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && Array.isArray(data.stocks) && data.stocks.length > 0) {
          setUniverse(data.stocks, data.status ?? "sample", data.updatedAt ?? null);
        }
      })
      .catch(() => {
        // 조용히 실패 — store 기본값(stocks.ts 샘플)이 그대로 남습니다.
      });
    return () => {
      cancelled = true;
    };
  }, [setUniverse]);

  return null;
}
