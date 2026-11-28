"use client";

// ---------------------------------------------------------------------------
// UniverseLoader/LiveQuoteLoader/PriceSocket을 묶는 래퍼. 시세를 쓰지 않는 /login에서는
// 마운트하지 않아 불필요한 API 호출과 웹소켓 연결을 막는다.
// ---------------------------------------------------------------------------

import { usePathname } from "next/navigation";
import { LiveQuoteLoader } from "@/components/live-quote-loader";
import { PriceSocket } from "@/components/price-socket";
import { UniverseLoader } from "@/components/universe-loader";
import { SessionGuard } from "@/components/session-guard";

const SKIP_PATHS = new Set(["/login"]);

export function AppLoaders() {
  const pathname = usePathname();
  // SessionGuard는 /login에서도 딱히 해롭진 않지만(이미 로그인 화면이라
  // 리다이렉트할 일이 없음), 아래 SKIP_PATHS 분기 자체가 /login에서 전체
  // 컴포넌트를 렌더링하지 않으므로 자연히 같이 빠집니다.
  if (SKIP_PATHS.has(pathname)) return null;

  return (
    <>
      <SessionGuard />
      <UniverseLoader />
      <LiveQuoteLoader />
      <PriceSocket />
    </>
  );
}
