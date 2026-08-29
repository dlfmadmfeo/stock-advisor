import { NextResponse } from "next/server";
import { fetchDailyBars, kisConfigured } from "@/lib/kis";

const TICKER_RE = /^\d{6}$/;

// ---------------------------------------------------------------------------
// 종목 상세 화면의 주가 라인차트/MACD 카드가 쓰는 일봉 프록시. KIS 호출은
// 서버 전용 키로만 해야 해서 /api/news, /api/quotes와 같은 패턴으로 이
// 라우트를 거칩니다. fetchDailyBars는 KIS 호출 1건이라 빨라요(투자자매매
// 동향처럼 여러 페이지를 순회할 필요 없음) — maxDuration 기본값으로 충분.
//
// 사용법: GET /api/daily-bars/005930
// ---------------------------------------------------------------------------
export const revalidate = 300;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { ok: false, message: "종목코드는 숫자 6자리여야 해요 (예: 005930).", bars: [] },
      { status: 400 },
    );
  }

  if (!kisConfigured()) {
    return NextResponse.json({
      ok: false,
      message: "KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).",
      bars: [],
    });
  }

  const bars = await fetchDailyBars(ticker);
  if (bars === null) {
    return NextResponse.json({
      ok: false,
      message: "일봉 데이터를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
      bars: [],
    });
  }

  return NextResponse.json({ ok: true, message: "", bars });
}
