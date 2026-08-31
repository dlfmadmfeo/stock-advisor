import { NextResponse } from "next/server";
import { fetchFinancials, kisConfigured } from "@/lib/kis";

const TICKER_RE = /^\d{6}$/;

// ---------------------------------------------------------------------------
// 종목별 연도별 재무 정보(매출/영업이익/순이익/ROE/부채비율 등) 프록시.
// investor-trend route와 같은 패턴(TICKER_RE 검증, kisConfigured 체크,
// 실패는 항상 non-2xx + no-store — revalidate가 실패까지 캐시해버리는 걸
// 막기 위해서, 2026-08-24 세션에 investor-trend에서 겪은 버그 참고).
//
// revalidate는 investor-trend(300초)보다 훨씬 길게 뒀어요 — 재무제표는
// 연 1회(결산)만 갱신되는 값이라 5분 캐시는 낭비. 6시간이면 하루 몇 번
// KIS를 부르는 정도로 충분합니다.
// ---------------------------------------------------------------------------
export const revalidate = 21600;

function noStoreJson(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ ticker: string }> },
) {
  const { ticker } = await params;

  if (!TICKER_RE.test(ticker)) {
    return noStoreJson(
      { ok: false, message: "종목코드는 숫자 6자리여야 해요 (예: 005930).", years: [] },
      400,
    );
  }

  if (!kisConfigured()) {
    return noStoreJson(
      {
        ok: false,
        message: "KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).",
        years: [],
      },
      503,
    );
  }

  const years = await fetchFinancials(ticker);
  if (years === null) {
    return noStoreJson(
      {
        ok: false,
        message: "재무 정보를 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        years: [],
      },
      502,
    );
  }

  return NextResponse.json({ ok: true, message: "", years });
}
