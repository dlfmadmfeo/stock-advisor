import { NextResponse } from "next/server";
import { refreshUniverse } from "@/lib/refresh-universe";

export const dynamic = "force-dynamic";
// 200종목 x KIS 호출 3건 = 최대 600건, rate limiter(초당 6건) 감안하면
// 몇 분 걸릴 수 있어요. 로컬 `next dev`에선 실제로 타임아웃이 걸리진 않지만
// (Vercel 같은 서버리스 배포 기준으로) 넉넉히 잡아둡니다.
export const maxDuration = 300;

// 홈 화면의 "유니버스 새로고침" 버튼이 호출하는 라우트입니다. 종목 30개 x
// KIS 호출 3건이라 kis.ts의 rate limiter(초당 6건) 때문에 완료까지 대략
// 15~30초 걸려요 — 버튼 쪽에서 로딩 상태를 보여줍니다.
//
// 같은 서버 프로세스 안에서 동시에 두 번 실행되지 않도록 아주 단순한
// in-memory 락만 둡니다 (여러 인스턴스로 스케일하면 이 정도로는 부족하지만,
// 지금은 로컬 1인 사용 앱이라 충분해요).
let isRunning = false;

export async function POST() {
  if (isRunning) {
    return NextResponse.json(
      { ok: false, message: "이미 갱신이 진행 중이에요. 잠시 후 다시 시도해주세요." },
      { status: 429 },
    );
  }

  isRunning = true;
  try {
    const result = await refreshUniverse();
    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  } finally {
    isRunning = false;
  }
}
