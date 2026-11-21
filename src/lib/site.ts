// 배포 주소. canonical / sitemap / Open Graph 절대 URL의 기준이에요.
// 다른 도메인(스테이징 등)에서 빌드할 땐 NEXT_PUBLIC_SITE_URL로 바꿉니다.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://stock-advisor2.vercel.app"
).replace(/\/$/, "");

export const SITE_NAME = "주식 어드바이저";
