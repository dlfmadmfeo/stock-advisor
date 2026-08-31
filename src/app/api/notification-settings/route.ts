import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// "알림" 탭의 공시 알림 온/오프 설정 (2026-08-31 세션). User.notificationsEnabled
// 하나뿐이라 GET/PATCH 둘 다 이 라우트 하나로 처리합니다. dart-poll.ts가
// 발송 대상을 고를 때 이 값을 직접 조회해서 걸러요(push-token.ts 참고).
// ---------------------------------------------------------------------------
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.id },
    select: { notificationsEnabled: true },
  });
  return NextResponse.json({ ok: true, enabled: row?.notificationsEnabled ?? true });
}

export async function PATCH(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (typeof body?.enabled !== "boolean") {
    return NextResponse.json(
      { ok: false, message: "enabled(boolean)가 필요해요." },
      { status: 400 },
    );
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { notificationsEnabled: body.enabled },
  });

  return NextResponse.json({ ok: true, enabled: body.enabled });
}
