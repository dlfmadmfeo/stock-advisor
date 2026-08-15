"use client";

// ---------------------------------------------------------------------------
// UniverseLoader/LiveQuoteLoader/PriceSocket을 한데 묶는 래퍼 (2026-08-14
// 세션 추가). 원래 layout.tsx에서 셋 다 항상 렌더링했는데, 그러면 /login
// 화면(라이브 시세를 전혀 안 씀)에서도 /api/universe, /api/quotes를 호출하고
// 웹소켓까지 붙어버림. usePathname으로 /login에서는 아예 마운트하지 않게
// 걸러서, 로그인 화면 진입 시 불필요한 네트워크 요청을 없앴어요.
// ---------------------------------------------------------------------------

import { usePathname } from "next/navigation";
import { LiveQuoteLoader } from "@/components/live-quote-loader";
import { PriceSocket } from "@/components/price-socket";
import { UniverseLoader } from "@/components/universe-loader";

const SKIP_PATHS = new Set(["/login"]);

export function AppLoaders() {
  const pathname = usePathname();
  if (SKIP_PATHS.has(pathname)) return null;

  return (
    <>
      <UniverseLoader />
      <LiveQuoteLoader />
      <PriceSocket />
    </>
  );
}
