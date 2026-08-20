import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:8081";
const TICKER_RE = /^\d{6}$/;

// 2026-08-14 세션: 프론트(WatchlistBody.addTicker)가 티커를 body 대신 URL
// 경로에 넣는 방식으로 바뀌면서, 원래 src/app/api/watchlist/route.ts에
// 있던 POST 핸들러를 이쪽(경로 기반)으로 옮겨왔습니다. DELETE랑 같은
// 위치(경로에 ticker)에 있는 게 REST스럽게 더 일관돼서 이대로 유지.
//
// 2026-08-18 세션: 회원가입/로그인 도입하면서 Watchlist가 (userId, ticker)
// 유니크로 바뀜. Spring(stock-advisor-server)은 어느 유저 건지 알 방법이
// 없어서(내부 API에 userId를 안 실음) 더 이상 Watchlist 테이블에 못 씀 —
// WatchlistController.add()/remove()에서 DB 쓰기 코드를 제거했어요. 그래서
// DB 쓰기는 이제 항상 여기(Next.js/Prisma)가 맡고, Spring은 실시간
// 구독(웹소켓)만 관리합니다. (예전엔 Spring이 먼저 써서 여기선 Spring
// 실패했을 때만 대신 썼는데, 그 전제가 없어졌어요.)
export async function POST(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

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

  const existing = await prisma.watchlist.findUnique({
    where: { userId_ticker: { userId: user.id, ticker } },
  });
  if (existing) {
    return NextResponse.json({ ok: true, message: "이미 관심종목에 있어요.", alreadyExists: true });
  }

  // Spring 서버(stock-advisor-server)에 구독 요청 — 구독 한도(40개, 전체
  // 유저 공유) 초과 등은 여기서 걸러짐. 이미 다른 유저가 담아둬서 구독
  // 중이면 Spring이 "이미 구독 중"으로 바로 200을 줌 — 그래도 이 유저
  // 개인 row는 새로 만들어야 하니 아래 create는 그대로 진행.
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
    // stock-advisor-server가 꺼져있거나 연결 자체가 안 되는 경우. DB엔
    // 그대로 추가하고, 실시간 구독은 안 되고 있다는 걸 알려줌 (서버 켜지면
    // 재시작 시 DB에서 distinct ticker를 다시 읽어감).
    console.error(`[watchlist POST] ${ticker} 실시간 구독 요청 실패:`, e);
    realtimeWarning =
      "실시간 서버(stock-advisor-server)에 연결할 수 없어 DB에만 추가됐어요. 서버를 켜면 다음 재시작 때 자동으로 구독돼요.";
  }

  try {
    await prisma.watchlist.create({ data: { userId: user.id, ticker } });
  } catch (e) {
    // P2002 = (userId, ticker) 유니크 제약 위반, 즉 "이미 있음". 위의
    // existing 체크가 놓친 경우(거의 동시에 두 번 클릭한 레이스 컨디션 등)에도
    // 500 대신 "이미 있음"으로 정상 처리합니다.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json({ ok: true, message: "이미 관심종목에 있어요.", alreadyExists: true });
    }
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

  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, message: "로그인이 필요해요." },
      { status: 401 },
    );
  }

  // 이 유저 row만 지움 — 다른 유저가 같은 종목을 아직 담아뒀을 수 있어서.
  await prisma.watchlist.deleteMany({ where: { userId: user.id, ticker } });

  // 실시간 구독은 전체 유저가 공유하는 자원이라, 이 유저가 지웠다고 바로
  // 끊어버리면 그 종목을 아직 보고 있는 다른 유저의 실시간 갱신이 끊겨요.
  // 아무도 안 담고 있을 때만 Spring에 구독 해제를 요청합니다.
  const stillWatchedByOthers = await prisma.watchlist.findFirst({ where: { ticker } });
  if (!stillWatchedByOthers) {
    try {
      await fetch(`${REALTIME_SERVER_URL}/watchlist/${ticker}`, { method: "DELETE" });
    } catch {
      // 실시간 서버 연결 실패는 조용히 무시 — DB만 정상적으로 지움.
    }
  }

  return NextResponse.json({ ok: true });
}
