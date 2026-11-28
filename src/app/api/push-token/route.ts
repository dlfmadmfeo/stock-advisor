import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Flutter 앱이 발급받은 FCM 토큰을 등록한다(로그인 후 WebView 안에서 JS로 호출).
// token이 @unique라 재설치하거나 다른 계정으로 로그인해도 upsert로 소유자가 옮겨진다.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  if (!token) {
    return NextResponse.json(
      { ok: false, message: "token이 필요해요." },
      { status: 400 },
    );
  }

  await prisma.pushToken.upsert({
    where: { token },
    create: { token, userId: user.id },
    update: { userId: user.id },
  });

  return NextResponse.json({ ok: true });
}
