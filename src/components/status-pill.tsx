"use client";

import { useAdvisorStore } from "@/stores/use-advisor-store";

const sourceLabel: Record<string, string> = {
  kis: "KIS 실시간 연동됨 (가격, 지표)",
  yahoo: "Yahoo 실시간 연동됨 (가격만, 지표는 예시값)",
  "yahoo-fallback": "KIS 실패 → Yahoo로 대체 (가격만, 지표는 예시값)",
};

export function StatusPill() {
  const status = useAdvisorStore((s) => s.liveStatus);
  const source = useAdvisorStore((s) => s.liveSource);

  if (status === "checking") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[11px] font-bold text-[#6b7684]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#8b95a1]" />
        실시간 연동 확인 중…
      </span>
    );
  }

  if (status === "live") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f9f1] px-2.5 py-1 text-[11px] font-bold text-[#00a878]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#00a878]" />
        {source ? (sourceLabel[source] ?? "실시간 연동됨") : "실시간 연동됨"}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff4e8] px-2.5 py-1 text-[11px] font-bold text-[#ff7a00]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#ff7a00]" />
      샘플 데이터 표시 중 (실시간 연동 실패)
    </span>
  );
}

// stock-advisor-server(Spring, KIS 웹소켓 → 브라우저 푸시)에 붙어있는지 보여주는
// 별도 뱃지. 이게 꺼져있어도 위 StatusPill(REST 폴링)은 정상 동작하니 필수는 아님.
export function WsStatusPill() {
  const connected = useAdvisorStore((s) => s.wsConnected);

  if (connected) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e6f9f1] px-2.5 py-1 text-[11px] font-bold text-[#00a878]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#00a878]" />
        실시간 푸시 연결됨
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f2f4f6] px-2.5 py-1 text-[11px] font-bold text-[#8b95a1]">
      <span className="h-1.5 w-1.5 rounded-full bg-[#b0b8c1]" />
      실시간 푸시 연결 안 됨
    </span>
  );
}
