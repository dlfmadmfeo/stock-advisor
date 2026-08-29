import { NextResponse } from "next/server";
import { refreshUniverse, isRefreshRunning } from "@/lib/refresh-universe";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";
// 200종목 x KIS 호출 3건 = 최대 600건, rate limiter(초당 6건) 감안하면
// 몇 분 걸릴 수 있어요. 로컬 `next dev`에선 실제로 타임아웃이 걸리진 않지만
// (Vercel 같은 서버리스 배포 기준으로) 넉넉히 잡아둡니다.
export const maxDuration = 300;

// 홈 화면의 "유니버스 새로고침" 버튼이 호출하는 라우트입니다. 종목 200개 x
// KIS 호출 3건이라 kis.ts의 rate limiter(초당 6건) 때문에 완료까지 보통
// 2~4분 걸려요 — 버튼 쪽에서 로딩 상태를 보여줍니다.
//
// 동시 실행 방지 락은 여기(라우트의 메모리 변수)가 아니라 refreshUniverse()
// 안에서 DB row로 관리합니다(refresh-universe.ts 참고). 예전엔 여기 메모리
// 변수(let isRunning)로 막았는데, Vercel은 요청마다 다른 서버리스 인스턴스로
// 갈 수 있어서 인스턴스마다 메모리가 따로 놀아 실제 동시 실행을 못 막았고,
// 그 결과 두 실행이 진짜 동시에 같은 테이블에 upsert하다가 MySQL "Lock wait
// timeout" 에러로 실패했었어요(2026-08-24 세션, 프로덕션 제보로 발견).
// RefreshUniverseButton이 마운트될 때(홈 화면 진입/앱 재시작 등) 호출해서
// "지금 진짜로 서버에서 갱신 중인지" 물어보는 용도. 사이드이펙트 없는
// 조회라 관리자 체크는 안 둠(관리자만 보이는 버튼에서만 어차피 호출됨).
export async function GET() {
  const running = await isRefreshRunning();
  return NextResponse.json({ isRunning: running });
}

export async function POST() {
  // 2026-08-23 세션: 로그인 체크가 아예 없었어서, 로그인 안 한 아무나 이
  // URL에 POST만 쏘면 KIS API로 200종목 배치 조회가 실행됐음(앱을 배포한
  // 뒤로는 진짜 위험 — API 호출 한도 낭비/악의적 반복 호출 가능). 관리자만
  // 누를 수 있게 막음.
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
