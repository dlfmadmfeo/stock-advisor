"use client";

import { useAdvisorStore } from "@/stores/use-advisor-store";
import { useSession } from "@/lib/use-session";

const sourceLabel: Record<string, string> = {
  kis: "KIS 실시간 연동됨 (가격, 지표)",
  yahoo: "Yahoo 실시간 연동됨 (가격만, 지표는 예시값)",
  "yahoo-fallback": "KIS 실패 → Yahoo로 대체 (가격만, 지표는 예시값)",
};

// 내부 연동 상태(KIS/Yahoo/웹소켓) 표시라 관리자 계정에서만 보여준다.
function StatusLine({
  dotClass,
  textClass = "text-[#6b7684]",
  children,
}: {
  dotClass: string;
  textClass?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {children}
    </span>
  );
}

export function StatusPill() {
  const { data: session } = useSession();
  const status = useAdvisorStore((s) => s.liveStatus);
  const source = useAdvisorStore((s) => s.liveSource);

  if (!session?.isAdmin) return null;

  if (status === "checking") {
    return <StatusLine dotClass="bg-[#8b95a1]">실시간 연동 확인 중…</StatusLine>;
  }

  if (status === "live") {
    return (
      <StatusLine dotClass="bg-[#0b7a5a]">
        {source ? (sourceLabel[source] ?? "실시간 연동됨") : "실시간 연동됨"}
      </StatusLine>
    );
  }

  return (
    <StatusLine dotClass="bg-[#c2410c]" textClass="text-[#c2410c]">
      샘플 데이터 표시 중 (실시간 연동 실패)
    </StatusLine>
  );
}

// stock-advisor-server(Spring, KIS 웹소켓 → 브라우저 푸시)에 붙어있는지 보여주는
// 별도 표시. 이게 꺼져있어도 위 StatusPill(REST 폴링)은 정상 동작하니 필수는 아님.
export function WsStatusPill() {
  const { data: session } = useSession();
  const connected = useAdvisorStore((s) => s.wsConnected);

  if (!session?.isAdmin) return null;

  return connected ? (
    <StatusLine dotClass="bg-[#0b7a5a]">실시간 푸시 연결됨</StatusLine>
  ) : (
    <StatusLine dotClass="bg-[#b0b8c1]">실시간 푸시 연결 안 됨</StatusLine>
  );
}
