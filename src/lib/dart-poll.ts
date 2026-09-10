// ---------------------------------------------------------------------------
// 2026-09-10 세션: "관심종목에 담은 것만" 알림이 오던 걸 "관심종목 여부와
// 무관하게 전체 종목 대상, 대신 중요한 유형만"으로 바꿨습니다. 필터링
// 기준은 dart.ts의 isImportantDisclosure(report_nm 키워드 매칭) — 실적/
// 자본변동/자사주/배당/M&A/리스크 계열만 걸러서 노이즈를 줄입니다.
// 수신 대상도 "그 종목을 담은 유저"가 아니라 "알림을 켜둔 전체 유저"로
// 바뀌었습니다(enqueueDisclosures/processDisclosureQueue 참고).
// ---------------------------------------------------------------------------

import { prisma } from "./db";
import { dartConfigured, fetchTodayDisclosures, isImportantDisclosure, type DartFiling } from "./dart";
import { fcmConfigured, sendPush } from "./fcm";

const STALE_LOCK_MS = 10 * 60 * 1000;

async function acquireDartPollLock(): Promise<Date | null> {
  await prisma.dartPollLock.upsert({
    where: { id: 1 }, create: { id: 1, isRunning: false }, update: {},
  });
  const lease = new Date();
  const result = await prisma.dartPollLock.updateMany({
    where: {
      id: 1,
      OR: [{ isRunning: false }, { updatedAt: { lt: new Date(lease.getTime() - STALE_LOCK_MS) } }],
    },
    data: { isRunning: true, updatedAt: lease },
  });
  return result.count === 1 ? lease : null;
}

export type DartPollResult = {
  ok: boolean;
  message: string;
  checked: number;
  matched: number;
  notified: number;
  pushesSent: number;
};

export async function enqueueDisclosures(filings: DartFiling[]): Promise<number> {
  const matched = filings.filter((f) => isImportantDisclosure(f.report_nm));
  const already = new Set((await prisma.notifiedDisclosure.findMany({
    where: { rcept_no: { in: matched.map((f) => f.rcept_no) } },
    select: { rcept_no: true },
  })).map((r) => r.rcept_no));

  // 관심종목 여부와 무관하게 전체 종목 대상이라, 종목마다 다시 조회하지
  // 않고 알림을 켜둔 전체 유저의 토큰을 한 번만 조회해서 재사용합니다.
  const recipients = await prisma.pushToken.findMany({
    where: { user: { notificationsEnabled: true } },
    select: { id: true, userId: true },
  });

  for (const filing of matched) {
    if (already.has(filing.rcept_no)) continue;
    // 최초 수집 시 대상을 고정합니다. 재조회로 성공한 기기의 전송을 만들지 않습니다.
    await prisma.disclosureNotification.upsert({
      where: { rceptNo: filing.rcept_no },
      update: {},
      create: {
        rceptNo: filing.rcept_no, ticker: filing.stock_code,
        corpName: filing.corp_name, reportName: filing.report_nm,
        deliveries: { create: recipients.map((r) => ({ pushTokenId: r.id, userId: r.userId })) },
      },
    });
  }
  return matched.length;
}

// 날짜가 바뀌거나 DART 조회가 실패해도 저장된 미발송 건은 처리합니다.
export async function processDisclosureQueue(push: typeof sendPush = sendPush) {
  let pushesSent = 0;
  let notified = 0;
  const notifications = await prisma.disclosureNotification.findMany({
    where: { completedAt: null },
    orderBy: [{ lastAttemptAt: "asc" }, { createdAt: "asc" }],
    take: 100,
    include: {
      deliveries: {
        where: { status: "pending" },
        include: { pushToken: { include: { user: { select: { notificationsEnabled: true } } } } },
      },
    },
  });

  for (const notification of notifications) {
    // 반복 실패한 오래된 공시가 뒤에 대기 중인 공시를 계속 막지 않게 순환합니다.
    await prisma.disclosureNotification.update({
      where: { rceptNo: notification.rceptNo }, data: { lastAttemptAt: new Date() },
    });
    const eligible = notification.deliveries.filter((d) =>
      d.userId === d.pushToken.userId && d.pushToken.user.notificationsEnabled);
    const skippedIds = notification.deliveries.filter((d) => !eligible.includes(d)).map((d) => d.pushTokenId);
    if (skippedIds.length) {
      await prisma.disclosureDelivery.updateMany({
        where: { rceptNo: notification.rceptNo, pushTokenId: { in: skippedIds }, status: "pending" },
        data: { status: "skipped" },
      });
    }

    for (let i = 0; i < eligible.length; i += 500) {
      const batch = eligible.slice(i, i + 500);
      let result;
      try {
        result = await push(batch.map((d) => d.pushToken.token),
          `${notification.corpName} 공시 등록`, notification.reportName,
          { ticker: notification.ticker, rcept_no: notification.rceptNo });
      } catch {
        console.error(`[DART] 공시 ${notification.rceptNo} 발송 실패`);
        continue;
      }
      pushesSent += result.successCount;
      const successful = new Set(result.successfulTokens);
      const invalid = new Set(result.invalidTokens);
      for (const [status, tokens] of [["sent", successful], ["skipped", invalid]] as const) {
        const ids = batch.filter((d) => tokens.has(d.pushToken.token)).map((d) => d.pushTokenId);
        if (ids.length) {
          await prisma.disclosureDelivery.updateMany({
            where: { rceptNo: notification.rceptNo, pushTokenId: { in: ids }, status: "pending" },
            data: { status },
          });
        }
      }
      if (invalid.size) {
        await prisma.pushToken.deleteMany({ where: { token: { in: [...invalid] } } });
      }
    }

    const pending = await prisma.disclosureDelivery.count({
      where: { rceptNo: notification.rceptNo, status: "pending" },
    });
    if (pending === 0) {
      const sent = await prisma.disclosureDelivery.count({
        where: { rceptNo: notification.rceptNo, status: "sent" },
      });
      await prisma.$transaction([
        prisma.disclosureNotification.update({
          where: { rceptNo: notification.rceptNo }, data: { completedAt: new Date() },
        }),
        prisma.notifiedDisclosure.upsert({
          where: { rcept_no: notification.rceptNo },
          create: { rcept_no: notification.rceptNo }, update: {},
        }),
      ]);
      if (sent > 0) notified++;
    }
  }
  const pending = await prisma.disclosureNotification.count({ where: { completedAt: null } });
  return { pushesSent, notified, pending };
}

export async function pollDartDisclosures(): Promise<DartPollResult> {
  const empty = { checked: 0, matched: 0, notified: 0, pushesSent: 0 };
  const lease = await acquireDartPollLock();
  if (!lease) return { ...empty, ok: false, message: "이미 폴링이 진행 중이에요." };
  try {
    const filings = dartConfigured() ? await fetchTodayDisclosures() : null;
    const matched = filings ? await enqueueDisclosures(filings) : 0;
    if (!fcmConfigured()) {
      return { ...empty, checked: filings?.length ?? 0, matched, ok: false,
        message: "FCM 설정이 없어 알림 발송을 보류했어요." };
    }
    const result = await processDisclosureQueue();
    return {
      ok: filings !== null && result.pending === 0,
      checked: filings?.length ?? 0, matched,
      notified: result.notified, pushesSent: result.pushesSent,
      message: filings === null ? "DART 조회 실패. 저장된 알림은 재시도했어요."
        : result.pending > 0 ? `미완료 공시 ${result.pending}건은 다음 실행에서 재시도합니다.` : "완료",
    };
  } finally {
    // 이전 실행이 만료 후 새 실행의 락을 해제하지 않도록 확인합니다.
    await prisma.dartPollLock.updateMany({
      where: { id: 1, updatedAt: lease }, data: { isRunning: false },
    });
  }
}
