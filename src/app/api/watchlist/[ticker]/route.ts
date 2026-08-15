import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:8081";
const TICKER_RE = /^\d{6}$/;

// 2026-08-14 세션: 프론트(WatchlistBody.addTicker)가 티커를 body 대신 URL
// 경로에 넣는 방식으로 바뀌면서, 원래 src/app/api/watchlist/route.ts에
// 있던 POST 핸들러를 이쪽(경로 기반)으로 옮겨왔습니다. DELETE랑 같은
// 위치(경로에 ticker)에 있는 게 REST스럽게 더 일관돼서 이대로 유지.
export async function POST(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { ok: false, message: "종목코드는 숫자 6자리여야 해요 (예: 005930)." },
      { status: 400 },
    );
  }

  // stock-advisor-server의 RealtimeUpdateService는 DB Stock 테이블에 이미 있는
  // 종목만 실시간 갱신함(없으면 틱이 와도 그냥 무시됨). 그래서 유니버스(top
  // 200)에 없는 종목은 지금은 관심종목으로 못 넣게 막아둠 — 추가해봤자
  // 웹소켓 구독만 되고 화면엔 아무 것도 안 뜨는 상태가 되기 때문.
  const inUniverse = await prisma.stock.findUnique({ where: { ticker } });
  if (!inUniverse) {
    return NextResponse.json(
      {
        ok: false,
        message: "지금 유니버스(시가총액 상위 200종목)에 없는 종목이라 관심종목으로 추가할 수 없어요.",
      },
      { status: 400 },
    );
  }

  const existing = await prisma.watchlist.findUnique({ where: { ticker } });
  if (existing) {
    return NextResponse.json({ ok: true, message: "이미 관심종목에 있어요.", alreadyExists: true });
  }

  // Spring 서버에 먼저 구독 요청 — 구독 한도(40개) 초과 등은 여기서 걸러짐.
  let realtimeWarning: string | null = null;
  try {
    const res = await fetch(`${REALTIME_SERVER_URL}/watchlist/${ticker}`, { method: "POST" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, message: `실시간 구독 실패: ${text || res.statusText}` },
        { status: 409 },
      );
    }
  } catch (e) {
    // stock-advisor-server가 꺼져있거나(REALTIME_SERVER_URL이 프로덕션에서
    // localhost로 남아있는 경우 등) 연결 자체가 안 되는 경우. DB엔
    // 추가하되, 실시간 구독은 안 되고 있다는 걸 알려줌 (서버 켜지면
    // 재시작 시 DB에서 다시 읽어감). console.error를 안 찍으면 Vercel
    // Logs에도 아무 단서가 안 남아서(2026-08-14 세션에 실제로 겪음) 꼭 남김.
    console.error(`[watchlist POST] ${ticker} 실시간 구독 요청 실패:`, e);
    realtimeWarning = "실시간 서버(stock-advisor-server)에 연결할 수 없어 DB에만 추가됐어요. 서버를 켜면 다음 재시작 때 자동으로 구독돼요.";
  }

  try {
    await prisma.watchlist.create({ data: { ticker } });
  } catch (e) {
    console.error(`[watchlist POST] ${ticker} DB 저장 실패:`, e);
    return NextResponse.json(
      { ok: false, message: "관심종목 저장에 실패했어요. 잠시 후 다시 시도해주세요." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, warning: realtimeWarning });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  // 삭제는 실시간 서버가 꺼져있어도 항상 DB에서 지워지도록 함 (사용자가
  // 명시적으로 지워달라고 한 거니까, 실시간 해제 실패로 막을 이유가 없음).
  try {
    await fetch(`${REALTIME_SERVER_URL}/watchlist/${ticker}`, { method: "DELETE" });
  } catch {
    // 실시간 서버 연결 실패는 조용히 무시 — DB만 정상적으로 지움.
  }

  await prisma.watchlist.deleteMany({ where: { ticker } });

  return NextResponse.json({ ok: true });
}
