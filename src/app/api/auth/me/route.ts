import { NextResponse } from "next/server";

// 2026-08-20 세션: better-auth 도입으로 폐기. 세션 조회는 이제
// /api/auth/[...all]/route.ts가 처리하는 /api/auth/get-session으로 갑니다
// (클라이언트에서는 authClient.getSession() / authClient.useSession()을
// 쓰면 자동으로 그 경로로 감 — src/lib/use-session.ts 참고). 이 파일은
// 지우고 싶은데 device 브리지로는 파일 삭제가 안 돼서 안내용 스텁만 남겨둠.
export async function GET() {
  return NextResponse.json({ user: null }, { status: 410 });
}
