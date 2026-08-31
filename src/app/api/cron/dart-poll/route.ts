import { NextResponse } from "next/server";
import { pollDartDisclosures } from "@/lib/dart-poll";

// ---------------------------------------------------------------------------
// GitHub Actions 스케줄 워크플로(.github/workflows/dart-poll.yml)가 호출하는
// 엔드포인트. Vercel Cron이 아니라 GitHub Actions를 쓴 이유: 이 프로젝트가
// Vercel Hobby 플랜이라 Vercel Cron은 하루 1회로 강제 제한돼서(Pro부터
// 자유로운 주기 가능) "장중 몇 분마다 확인"이 안 됨 — GitHub Actions
// 스케줄은 무료로 몇 분 단위 실행이 가능해서 이걸로 대체.
//
// CRON_SECRET으로 보호 — 아무나 이 URL을 호출해서 폴링을 강제로 돌리거나
// (DART 호출 한도 낭비), 푸시를 중복으로 쏘게 만들 수 없게.
// ---------------------------------------------------------------------------
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, message: "인증 실패" }, { status: 401 });
  }

  const result = await pollDartDisclosures();
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
