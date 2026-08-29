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
//
// ⚠️ 종목 하나당 KIS를 최대 20번 순차 호출해야 해서(kis.ts 페이지네이션
// 주석 참고) 실측 8~9초 정도 걸려요 — Vercel 서버리스 함수 기본 제한시간
// (Hobby 기준 10초)에 거의 걸쳐있어서, 살짝만 느려져도 타임아웃으로
// 실패했어요(2026-08-24 세션, 프로덕션에서 "불러오지 못했다"는 제보로
// 발견). refresh-universe route처럼 maxDuration을 명시해서 여유를 둡니다.
//
// ⚠️ 실패 응답에 상태 코드(200 기본값)를 안 주면, 위 revalidate=300 때문에
// Next.js가 "정상 응답"으로 착각하고 그 실패 자체를 5분간 캐시해버려요 —
// 그러면 KIS 쪽 일시적인 네트워크 문제 한 번이 5분짜리 장애로 늘어나요
// (2026-08-24 세션, "자꾸 뜬다"는 제보로 발견). 그래서 실패 응답엔 전부
// non-2xx 상태 코드 + Cache-Control: no-store를 명시적으로 줘서 절대 캐시
// 안 되게 막습니다 — 다음 요청은 무조건 새로 시도하게.
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
