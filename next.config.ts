import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  allowedDevOrigins: ["192.168.45.109"],
  // 개발 서버 좌하단에 뜨는 Turbopack/빌드 활동 인디케이터 배지 끄기.
  devIndicators: false,
};

export default nextConfig;
