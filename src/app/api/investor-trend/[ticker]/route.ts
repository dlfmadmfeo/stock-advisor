import { NextResponse } from "next/server";
import { fetchInvestorTrend, kisConfigured } from "@/lib/kis";

const TICKER_RE = /^\d{6}$/;

// ---------------------------------------------------------------------------
// 종목별 외국인/기관/개인 순매수 추이(일별) 프록시. KIS 호출은 서버 전용
// 키(kis.ts)로만 해야 해서 클라이언트가 직접 못 부르고 이 라우트를 거칩니다
// (/api/news, /api/quotes와 같은 패턴).
//
// KIS 쪽 데이터가 "당일 장 종료 후 갱신"이라 자주 바뀌는 값이 아니에요 —
// 종목 하나당 최대 20번 KIS를 호출해야 해서(kis.ts의 fetchInvestorTrend
// 페이지네이션 주석 참고) 매번 새로 부르면 느리고 낭비라, 5분 캐시를 둡니다.
//
// 사용법: GET /api/investor-trend/005930
// ---------------------------------------------------------------------------
export const revalidate = 300;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!TICKER_RE.test(ticker)) {
    return NextResponse.json(
      { ok: false, message: "종목코드는 숫자 6자리여야 해요 (예: 005930).", days: [] },
      { status: 400 },
    );
  }

  if (!kisConfigured()) {
    return NextResponse.json({
      ok: false,
      message: "KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).",
      days: [],
    });
  }

  const days = await fetchInvestorTrend(ticker);
  if (days === null) {
    return NextResponse.json({
      ok: false,
      message: "투자자매매동향을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
      days: [],
    });
  }

  return NextResponse.json({ ok: true, message: "", days });
}
