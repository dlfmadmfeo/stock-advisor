import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { generateAiPicks, AI_PICK_MODEL_LABEL } from "@/lib/ai-picks";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
// 종목 8개 x (재무 1회 + 뉴스 1회) + Claude 호출 1회. investor-trend처럼 느린
// 호출은 없지만(ai-picks.ts 상단 주석 참고) 넉넉히 잡아둡니다.
export const maxDuration = 60;

// AI 추천 화면의 "다시 생성하기" 버튼이 호출하는 라우트. 관리자만 허용 —
// universe/refresh route.ts와 같은 이유(외부 API 호출 비용, 악의적 반복 호출
// 방지)로 서버에서 다시 한번 막습니다(화면에서 버튼 자체를 숨기는 것과
// 별개로, 진짜 방어선은 여기).
export async function POST() {
  const user = await getSessionUser();
  if (!user?.isAdmin) {
    return NextResponse.json(
      { ok: false, message: "관리자만 사용할 수 있어요." },
      { status: 403 },
    );
  }

  const result = await generateAiPicks();
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }

  const batch = await prisma.aiPickBatch.upsert({
    where: { id: 1 },
    create: { id: 1, model: AI_PICK_MODEL_LABEL, payload: result.picks },
    update: { model: AI_PICK_MODEL_LABEL, payload: result.picks, generatedAt: new Date() },
  });

  return NextResponse.json({ ok: true, generatedAt: batch.generatedAt, picks: result.picks });
}
