// ---------------------------------------------------------------------------
// DART 공시 폴링 → 관심종목 보유 유저에게 푸시 발송 (서버 전용).
// GitHub Actions 스케줄이 /api/cron/dart-poll을 호출하면 이 함수가 실제
// 일을 합니다. refreshUniverse()와 같은 구조(락 획득 → 본작업 → 항상 락
// 해제)를 따릅니다 — src/lib/refresh-universe.ts 참고.
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { dartConfigured, fetchTodayDisclosures, type DartFiling } from "./dart";
import { fcmConfigured, sendPush } from "./fcm";

const STALE_LOCK_MS = 10 * 60 * 1000; // RefreshLock과 동일 기준

async function acquireDartPollLock(): Promise<boolean> {
  await prisma.dartPollLock.upsert({
    where: { id: 1 },
    create: { id: 1, isRunning: false },
    update: {},
  });

  const staleThreshold = new Date(Date.now() - STALE_LOCK_MS);
  const result = await prisma.dartPollLock.updateMany({
    where: {
      id: 1,
      OR: [{ isRunning: false }, { updatedAt: { lt: staleThreshold } }],
    },
    data: { isRunning: true },
  });
  return result.count === 1;
}

async function releaseDartPollLock(): Promise<void> {
  await prisma.dartPollLock.update({
    where: { id: 1 },
    data: { isRunning: false },
  });
}

export type DartPollResult = {
  ok: boolean;
  message: string;
  checked: number; // 오늘 전체 공시 건수
  matched: number; // 그중 관심종목과 매칭된 건수
  notified: number; // 그중 실제로 처음 알림을 보낸 건수(중복 제외)
  pushesSent: number; // 발송된 푸시 메시지 개수(유저 수 기준)
};

export async function pollDartDisclosures(): Promise<DartPollResult> {
  if (!dartConfigured()) {
    return { ok: false, message: "DART_API_KEY가 없어요.", checked: 0, matched: 0, notified: 0, pushesSent: 0 };
  }

  if (!(await acquireDartPollLock())) {
    return { ok: false, message: "이미 폴링이 진행 중이에요.", checked: 0, matched: 0, notified: 0, pushesSent: 0 };
  }

  try {
    const filings = await fetchTodayDisclosures();
    if (filings === null) {
      return { ok: false, message: "DART 조회에 실패했어요.", checked: 0, matched: 0, notified: 0, pushesSent: 0 };
    }

    // 관심종목으로 한 번이라도 담긴 티커만 추려서, 그 티커를 담은 유저
    // 목록까지 한 번에 가져옵니다 — 공시 건수만큼 DB를 왕복하지 않게.
    const watchedTickers = new Set(
      (await prisma.watchlist.findMany({ select: { ticker: true }, distinct: ["ticker"] })).map(
        (w) => w.ticker,
      ),
    );
    const matchedFilings = filings.filter((f) => watchedTickers.has(f.stock_code));

    if (matchedFilings.length === 0) {
      return {
        ok: true,
        message: "관심종목 공시 없음",
        checked: filings.length,
        matched: 0,
        notified: 0,
        pushesSent: 0,
      };
    }

    const rceptNos = matchedFilings.map((f) => f.rcept_no);
    const already = new Set(
      (
        await prisma.notifiedDisclosure.findMany({
          where: { rcept_no: { in: rceptNos } },
          select: { rcept_no: true },
        })
      ).map((r) => r.rcept_no),
    );
    const newFilings = matchedFilings.filter((f) => !already.has(f.rcept_no));

    let pushesSent = 0;
    if (newFilings.length > 0 && fcmConfigured()) {
      pushesSent = await notifyNewFilings(newFilings);
    }

    if (newFilings.length > 0) {
      await prisma.notifiedDisclosure.createMany({
        data: newFilings.map((f) => ({ rcept_no: f.rcept_no })),
        skipDuplicates: true,
      });
    }

    return {
      ok: true,
      message: "완료",
      checked: filings.length,
      matched: matchedFilings.length,
      notified: newFilings.length,
      pushesSent,
    };
  } finally {
    await releaseDartPollLock();
  }
}

// 신규 공시별로 그 종목을 관심종목에 담은 유저들의 푸시 토큰을 모아 발송.
// 종목 하나에 유저 여러 명이 겹칠 수 있어서 종목 단위로 묶어 처리합니다.
async function notifyNewFilings(filings: DartFiling[]): Promise<number> {
  let sent = 0;
  const invalidTokensAll = new Set<string>();

  for (const filing of filings) {
    const watchers = await prisma.watchlist.findMany({
      where: { ticker: filing.stock_code },
      select: { userId: true },
    });
    if (watchers.length === 0) continue;

    const tokens = (
      await prisma.pushToken.findMany({
        where: { userId: { in: watchers.map((w) => w.userId) } },
        select: { token: true },
      })
    ).map((t) => t.token);
    if (tokens.length === 0) continue;

    const result = await sendPush(
      tokens,
      `${filing.corp_name} 공시 등록`,
      filing.report_nm,
      { ticker: filing.stock_code, rcept_no: filing.rcept_no },
    );
    sent += result.successCount;
    result.invalidTokens.forEach((t) => invalidTokensAll.add(t));
  }

  if (invalidTokensAll.size > 0) {
    await prisma.pushToken.deleteMany({ where: { token: { in: [...invalidTokensAll] } } });
  }

  return sent;
}
