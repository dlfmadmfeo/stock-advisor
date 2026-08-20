import { NextResponse } from "next/server";

// 2026-08-20 세션: better-auth 도입으로 폐기. 로그아웃은 이제
// /api/auth/[...all]/route.ts가 처리하는 /api/auth/sign-out으로 갑니다
// (클라이언트에서는 authClient.signOut() 호출하면 자동으로 그 경로로 감 —
// src/components/logout-button.tsx 참고). 이 파일은 지우고 싶은데 device
// 브리지로는 파일 삭제가 안 돼서 안내용 스텁만 남겨둠.
export async function POST() {
  return NextResponse.json(
    { ok: false, message: "이 엔드포인트는 폐기됐어요. authClient.signOut을 쓰세요." },
    { status: 410 },
  );
}
