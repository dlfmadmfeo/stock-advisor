import { NextResponse } from "next/server";
import { dartFinancialsConfigured, fetchFinancials } from "@/lib/dart-financials";

const TICKER_RE = /^\d{6}$/;

// ---------------------------------------------------------------------------
// 종목별 연도별 재무 정보(매출·영업이익·순이익·ROE·부채비율 등) 프록시. 출처는 DART
// (dart-financials.ts). investor-trend 라우트와 같이 TICKER_RE 검증, 설정 키 확인,
// 실패 시 non-2xx + no-store(실패 응답이 캐시되지 않도록)를 적용한다.
//
// 재무제표는 연 1회 갱신되므로 revalidate를 6시간으로 길게 둔다.
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

  if (!dartFinancialsConfigured()) {
    return noStoreJson(
      {
        ok: false,
        message: "DART_API_KEY가 없어요 (.env.local 확인).",
        years: [],
      },
      503,
    );
  }

  // 빈 배열은 오류가 아니에요 — ETF처럼 공시된 재무제표가 없는 종목이라 화면에서
  // "데이터가 없어요"로 보여줍니다. 실제 실패일 때만 null이 와서 502로 응답해요.
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
