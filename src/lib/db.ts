import { PrismaClient } from "@prisma/client";

// Next.js dev 모드에서 파일 저장할 때마다 모듈이 다시 로드되면서 PrismaClient가
// 계속 새로 생성되는 걸 막기 위한 표준 싱글턴 패턴입니다.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
