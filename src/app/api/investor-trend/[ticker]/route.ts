import { NextResponse } from "next/server";
import { fetchInvestorTrend, kisConfigured } from "@/lib/kis";

const TICKER_RE = /^\d{6}$/;

// ---------------------------------------------------------------------------
// 종목별 외국인/기관/개인 순매수 추이(일별) 프록시. KIS 키는 서버 전용이라
// 클라이언트는 이 라우트를 거친다(/api/news, /api/quotes와 같은 방식).
//
// 사용법: GET /api/investor-trend/005930
//
//  - 데이터가 장 마감 후 갱신되고 종목당 KIS 호출이 최대 20번(약 8~9초)이라 5분 캐시를 둔다.
//  - 서버리스 기본 제한시간(10초)에 가까워 maxDuration을 늘려 둔다.
//  - 실패 응답은 non-2xx + Cache-Control: no-store로 보내, 일시적 오류가 5분간
//    캐시되지 않게 한다.
// ---------------------------------------------------------------------------
export const revalidate = 300;
export const maxDuration = 60;

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
      { ok: false, message: "종목코드는 숫자 6자리여야 해요 (예: 005930).", days: [] },
      400,
    );
  }

  if (!kisConfigured()) {
    return noStoreJson(
      {
        ok: false,
        message: "KIS_APP_KEY / KIS_APP_SECRET이 없어요 (.env.local 확인).",
        days: [],
      },
      503,
    );
  }

  const days = await fetchInvestorTrend(ticker);
  if (days === null) {
    return noStoreJson(
      {
        ok: false,
        message: "투자자매매동향을 불러오지 못했어요. 잠시 후 다시 시도해주세요.",
        days: [],
      },
      502,
    );
  }

  return NextResponse.json({ ok: true, message: "", days });
}
