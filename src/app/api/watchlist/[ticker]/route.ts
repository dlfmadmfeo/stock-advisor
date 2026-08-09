import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:8081";

export async function DELETE(_req: Request, { params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;

  // 삭제는 실시간 서버가 꺼져있어도 항상 DB에서 지워지도록 함 (사용자가
  // 명시적으로 지워달라고 한 거니까, 실시간 해제 실패로 막을 이유가 없음).
  try {
    await fetch(`${REALTIME_SERVER_URL}/watchlist/${ticker}`, { method: "DELETE" });
  } catch {
    // 실시간 서버 연결 실패는 조용히 무시 — DB만 정상적으로 지움.
  }

  await prisma.watchlist.deleteMany({ where: { ticker } });

  return NextResponse.json({ ok: true });
}
