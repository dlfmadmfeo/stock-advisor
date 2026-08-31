import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/auth";
import { fcmConfigured, sendPush } from "@/lib/fcm";

// ---------------------------------------------------------------------------
// "알림" 탭의 "테스트 알림 보내기" 버튼용 (2026-08-31 세션). DART 공시를
// 기다리지 않고, 지금 로그인한 유저 본인의 PushToken으로 바로 푸시를
// 하나 쏴봅니다 — 발송 로직 자체는 dart-poll.ts의 notifyNewFilings가
// 쓰는 sendPush()를 그대로 재사용.
// ---------------------------------------------------------------------------
export async function POST() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ ok: false, message: "로그인이 필요해요." }, { status: 401 });
  }

  if (!fcmConfigured()) {
    return NextResponse.json(
      { ok: false, message: "서버에 FIREBASE_SERVICE_ACCOUNT가 설정 안 됐어요." },
      { status: 503 },
    );
  }

  const tokens = (
    await prisma.pushToken.findMany({
      where: { userId: user.id },
      select: { token: true },
    })
  ).map((t) => t.token);

  if (tokens.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        message: "등록된 알림 토큰이 없어요. 앱에서 알림 권한을 허용했는지 확인해주세요.",
      },
      { status: 400 },
    );
  }

  const result = await sendPush(
    tokens,
    "테스트 알림",
    "이 알림이 보이면 공시 알림이 정상적으로 올 거예요.",
    { type: "test" },
  );

  if (result.invalidTokens.length > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: result.invalidTokens } } });
  }

  if (result.successCount === 0) {
    return NextResponse.json(
      { ok: false, message: "발송에 실패했어요. 앱을 다시 열어서 로그인해주세요(토큰이 오래됐을 수 있어요)." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, message: `${result.successCount}건 발송했어요.` });
}
