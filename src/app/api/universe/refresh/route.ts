import { NextResponse } from "next/server";
import { refreshUniverse, isRefreshRunning } from "@/lib/refresh-universe";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
// 200종목 x KIS 호출 3건 = 최대 600건, rate limiter(초당 6건) 감안하면
// 몇 분 걸릴 수 있어요. 로컬 `next dev`에선 실제로 타임아웃이 걸리진 않지만
// (Vercel 같은 서버리스 배포 기준으로) 넉넉히 잡아둡니다.
export const maxDuration = 300;

// 홈 화면 "유니버스 새로고침" 버튼이 호출하는 라우트. 200종목 × KIS 3건이라
// rate limiter(초당 6건) 때문에 보통 2~4분 걸린다.
//
// 동시 실행 방지 락은 refreshUniverse() 안에서 DB row로 관리한다
// (서버리스 인스턴스 간 메모리 미공유, refresh-universe.ts 참고).
// GET은 버튼이 마운트될 때 서버에서 갱신 중인지 확인하는 용도라 부수효과가 없다.
export async function GET() {
  const running = await isRefreshRunning();
  return NextResponse.json({ isRunning: running });
}

export async function POST() {
  // KIS 배치를 실행하는 요청이라 관리자만 허용한다(API 호출 한도 남용 방지).
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json(
      { ok: false, message: "관리자만 유니버스를 새로고침할 수 있어요." },
      { status: 403 },
    );
  }

  try {
    const result = await refreshUniverse();
    const alreadyRunning = !result.ok && result.message.includes("이미 갱신이 진행 중");
    return NextResponse.json(result, {
      status: result.ok ? 200 : alreadyRunning ? 429 : 502,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
