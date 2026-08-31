import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Flutter 앱이 FCM 토큰을 발급받으면 이 라우트로 등록합니다(로그인 직후,
// 앱이 웹뷰 안에서 JS로 fetch — DART 공시 → 관심종목 보유 유저 푸시 알림
// 기능, 2026-08-31 세션). token 자체가 @unique라서, 같은 기기가 앱을
// 재설치하거나 다른 계정으로 로그인해도 upsert가 자연스럽게 소유자를
// 옮겨줍니다(예전 계정에 남은 죽은 row가 안 쌓임).
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
