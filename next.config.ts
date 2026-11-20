import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  // 폰에서 같은 와이파이로 http://<PC IP>:3000 접속할 때 필요. 공유기가 PC IP를
  // 바꿔 주면 막히니까 사설 대역 와일드카드 + 현재 IP를 같이 둡니다.
  allowedDevOrigins: ["192.168.*.*", "192.168.45.24", "192.168.45.109"],
  // 개발 서버 좌하단에 뜨는 Turbopack/빌드 활동 인디케이터 배지 끄기.
  devIndicators: false,
};

export default nextConfig;
