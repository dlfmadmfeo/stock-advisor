import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// 로그인 뒤에서만 의미 있는 화면과 API는 크롤링하지 않게 합니다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin",
        "/mypage",
        "/devices",
        "/alerts",
        "/notifications",
        "/watchlist",
        "/ai-picks",
        "/login",
        "/signup",
        "/forgot-password",
        "/reset-password",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
