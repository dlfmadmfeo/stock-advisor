// ---------------------------------------------------------------------------
// 유니버스 배치 갱신 CLI (수동 실행: `pnpm refresh-universe`)
//
// 실제 로직은 src/lib/refresh-universe.ts에 있고, 앱 안의 "새로고침" 버튼
// (/api/universe/refresh)도 같은 함수를 씁니다. 이 스크립트는 tsx로 Next.js
// 밖에서 단독 실행되는 거라 .env.local을 직접 읽어 채워준 뒤 그 함수를
// 호출하기만 합니다.
// ---------------------------------------------------------------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

// tsx로 단독 실행하는 스크립트라 Next.js의 자동 .env.local 로딩을 못 받습니다.
// 새 패키지(dotenv) 추가 없이 간단히 직접 파싱해서 채워 넣어요.
function loadEnvLocal() {
  const envPath = path.resolve(scriptDir, "../.env.local");
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
// kis.ts/db.ts가 import 시점에 바로 process.env를 읽기 때문에, 정적 import보다
// 먼저 .env.local을 채워야 합니다. 그래서 refresh-universe 모듈을 동적 import로
// 지연 로딩합니다.
loadEnvLocal();

async function main() {
  const { refreshUniverse } = await import("../src/lib/refresh-universe");
  const { prisma } = await import("../src/lib/db");

  const result = await refreshUniverse();
  console.log(`\n${result.message}`);
  if (result.removed > 0) {
    console.log(`유니버스에서 빠진 ${result.removed}개 종목을 DB에서 정리했어요.`);
  }

  await prisma.$disconnect();
  if (!result.ok) process.exit(1);
}

main().catch(async (e) => {
  console.error("배치 실행 중 오류:", e);
  const { prisma } = await import("../src/lib/db");
  await prisma.$disconnect();
  process.exit(1);
});
