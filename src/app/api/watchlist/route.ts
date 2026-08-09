import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

// ---------------------------------------------------------------------------
// 사용자가 화면에서 추가/삭제하는 관심종목 API.
//
// DB(Watchlist 테이블)가 "무엇을 관심종목으로 뒀는지"의 소스 오브 트루스이고,
// stock-advisor-server(Spring)는 이 목록을 KIS 웹소켓으로 실시간 구독하는
// 역할만 합니다. 그래서 추가/삭제할 때마다 Spring에도 알려서 즉시
// 구독/해제하게 만들되, Spring이 꺼져있어도(로컬 개발 중 안 띄워놨을 수 있음)
// DB 자체는 정상적으로 갱신되도록 설계했습니다 — Spring이 다음에 켜지면
// DB를 읽어서 다시 동기화됩니다(RealtimeWorkerApplication 참고).
// ---------------------------------------------------------------------------

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:8081";
const TICKER_RE = /^\d{6}$/;

export async function GET() {
  const rows = await prisma.watchlist.findMany({ orderBy: { addedAt: "asc" } });
  const tickers = rows.map((r) => r.ticker);

  const stocks = tickers.length
    ? await prisma.stock.findMany({ where: { ticker: { in: tickers } } })
    : [];
  const stockByTicker = new Map(stocks.map((s) => [s.ticker, s]));

  const items = rows.map((r) => {
    const s = stockByTicker.get(r.ticker);
    return {
      ticker: r.ticker,
      addedAt: r.addedAt.toISOString(),
      // 유니버스(top 200)에 없는 종목이면 시세 정보가 없을 수 있음 — 그땐
      // 화면에서 "종목명/시세 정보 없음"으로 표시하면 됨.
      name: s?.name ?? null,
      sector: s?.sector ?? null,
      price: s?.price ?? null,
      chg: s?.chg ?? null,
      cap: s?.cap ?? null,
    };
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const ticker = typeof body?.ticker === "string" ? body.ticker.trim() : "";

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
  } catch {
    // stock-advisor-server가 꺼져있는 경우. DB엔 추가하되, 실시간 구독은
    // 안 되고 있다는 걸 알려줌 (서버 켜지면 재시작 시 DB에서 다시 읽어감).
    realtimeWarning = "실시간 서버(stock-advisor-server)에 연결할 수 없어 DB에만 추가됐어요. 서버를 켜면 다음 재시작 때 자동으로 구독돼요.";
  }

  await prisma.watchlist.create({ data: { ticker } });

  return NextResponse.json({ ok: true, warning: realtimeWarning });
}
