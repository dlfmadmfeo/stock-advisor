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
  // 글꼴 파일은 이름이 바뀌지 않으니 1년 동안 다시 묻지 않고 캐시하게 합니다.
  // (public 파일의 기본값은 매번 재확인이라, 설정하지 않으면 방문마다 확인 요청이 나가요.)
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
        ],
      },
    ];
  },
};

export default nextConfig;
