// ---------------------------------------------------------------------------
// Suspense 전환(use-watchlist.ts, use-stock-news.ts) 후 발견된 버그 픽스
// (2026-08-14 세션). useSuspenseQuery의 queryFn은 컴포넌트가 서버에서
// 먼저 렌더링될 때도 실행되는데("use client" 컴포넌트도 Next.js가 최초
// HTML을 만들 때 서버에서 한 번 렌더링합니다), 그 서버 환경(Node.js)의
// fetch는 브라우저와 달리 상대 경로("/api/watchlist")를 못 알아듣고
// "Failed to parse URL" 에러를 던집니다. 예전엔 이 fetch가 useEffect 안에
// 있어서 브라우저에서만 실행됐기 때문에 문제가 없었어요.
//
// 그래서 서버에서 실행될 때만 절대 URL로 바꿔줍니다. 배포 환경(Vercel 등)
// 마다 호스트가 다를 수 있어서 NEXT_PUBLIC_SITE_URL을 우선 쓰고, 없으면
// 로컬 개발 기준(localhost:PORT)으로 fallback합니다.
// ---------------------------------------------------------------------------

export function resolveApiUrl(path: string): string {
  if (typeof window !== "undefined") return path;

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  return `${base}${path}`;
}
