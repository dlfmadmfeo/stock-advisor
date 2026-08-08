import { NextResponse } from "next/server";
import { getUniverse } from "@/lib/universe";

// 배치 스크립트(pnpm refresh-universe)가 채운 DB 유니버스를 그대로 내려줍니다.
// DB가 비어있으면 stocks.ts 샘플로 자동 대체됩니다 (getUniverse 참고).
export const revalidate = 60;

export async function GET() {
  const { stocks, status, updatedAt } = await getUniverse();
  return NextResponse.json({ stocks, status, updatedAt });
}
