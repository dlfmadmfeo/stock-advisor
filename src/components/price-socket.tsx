"use client";

import { useEffect, useRef } from "react";
import { useAdvisorStore } from "@/stores/use-advisor-store";

// stock-advisor-server(Spring Boot)의 /ws/prices에 붙어서, 그쪽이 KIS 체결
// 틱을 처리할 때마다 보내주는 메시지를 실시간으로 받아 store에 반영합니다.
// 이 서버가 안 떠있어도(=로컬에서 안 돌리고 있어도) 앱 자체는 정상 동작해요 —
// 그냥 이 실시간 갱신만 안 될 뿐, 기존 /api/quotes, /api/universe 폴링은 그대로.
// 기본값은 "지금 이 페이지에 접속한 호스트"를 그대로 써서 8081 포트로 붙게
// 만듭니다. PC에서 localhost로 접속하면 ws://localhost:8081/ws/prices가 되고,
// 같은 와이파이의 모바일에서 192.168.x.x로 접속하면 ws://192.168.x.x:8081/ws/prices가
// 돼서 별도 설정 없이 둘 다 동작합니다. (env로 명시하면 그 값이 우선)
function getDefaultWsUrl() {
  if (typeof window === "undefined") return "ws://localhost:8081/ws/prices";
  return `ws://${window.location.hostname}:8081/ws/prices`;
}

const WS_URL = process.env.NEXT_PUBLIC_REALTIME_WS_URL ?? getDefaultWsUrl();

type PriceUpdateMessage = {
  ticker: string;
  price: number;
  chg: number;
  ma5over20: boolean;
  volRatio: number;
  rsi: number;
  hi: number;
  lo: number;
  screenerOk: boolean;
};

export function PriceSocket() {
  const mergeLiveQuote = useAdvisorStore((s) => s.mergeLiveQuote);
  const setWsConnected = useAdvisorStore((s) => s.setWsConnected);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(WS_URL);

      socket.onopen = () => {
        if (cancelled) return;
        setWsConnected(true);
      };

      socket.onmessage = (event) => {
        try {
          const data: PriceUpdateMessage = JSON.parse(event.data);
          if (!data?.ticker) return;
          mergeLiveQuote(data.ticker, {
            price: data.price,
            chg: data.chg,
            ma5over20: data.ma5over20,
            volRatio: data.volRatio,
            rsi: data.rsi,
            hi: data.hi,
            lo: data.lo,
          });
        } catch {
          // 파싱 실패한 메시지는 조용히 무시
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setWsConnected(false);
        // stock-advisor-server가 아직 안 떠있거나 재시작 중일 수 있으니 5초마다 재시도
        reconnectTimer.current = setTimeout(connect, 5000);
      };

      socket.onerror = () => {
        socket?.close();
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      socket?.close();
    };
  }, [mergeLiveQuote, setWsConnected]);

  return null;
}
