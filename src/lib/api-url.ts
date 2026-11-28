// ---------------------------------------------------------------------------
// useSuspenseQuery의 queryFn은 최초 HTML 생성 시 서버에서도 실행되는데, Node.js의
// fetch는 상대 경로("/api/watchlist")를 처리하지 못한다. 그래서 서버에서 실행될 때만
// 절대 URL로 바꾼다. NEXT_PUBLIC_SITE_URL을 우선 쓰고, 없으면 localhost:PORT를 쓴다.
// ---------------------------------------------------------------------------

export function resolveApiUrl(path: string): string {
  if (typeof window !== "undefined") return path;

  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ??
    `http://localhost:${process.env.PORT ?? 3000}`;

  return `${base}${path}`;
}
