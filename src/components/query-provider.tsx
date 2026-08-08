"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  // useState로 한 번만 생성 — 매 렌더링마다 새 QueryClient가 만들어지면
  // 캐시가 계속 초기화돼버립니다 (react-query 공식 문서에서 권장하는 패턴).
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000, // 15초 안에는 같은 쿼리 재요청 안 함
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
