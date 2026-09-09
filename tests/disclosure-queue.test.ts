/* eslint-disable @typescript-eslint/no-explicit-any */
import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import type { PrismaClient } from "@prisma/client";

const unexpected = async () => { throw new Error("Unmocked database operation"); };
const delegate = () => Object.fromEntries(
  ["findMany", "count", "update", "upsert", "updateMany", "deleteMany"].map((name) => [name, unexpected]),
);
const prisma = {
  disclosureNotification: delegate(), disclosureDelivery: delegate(),
  notifiedDisclosure: delegate(), pushToken: delegate(), watchlist: delegate(),
  dartPollLock: delegate(), $transaction: unexpected,
} as unknown as PrismaClient;
(globalThis as unknown as { prisma: PrismaClient }).prisma = prisma;
// Install the in-memory DB before loading modules; no live DB can be reached.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { enqueueDisclosures, pollDartDisclosures, processDisclosureQueue } = require("../src/lib/dart-poll") as typeof import("../src/lib/dart-poll");

afterEach(() => mock.restoreAll());

function fixture(size = 2) {
  let completed = false;
  let recorded = false;
  const deliveries = Array.from({ length: size }, (_, i) => ({
    rceptNo: "filing", pushTokenId: `device-${i}`, userId: `user-${i}`, status: "pending",
    pushToken: { id: `device-${i}`, token: `token-${i}`, userId: `user-${i}`,
      user: { notificationsEnabled: true } },
  }));
  const notification = { rceptNo: "filing", ticker: "005930", corpName: "Example", reportName: "Report" };
  mock.method(prisma.disclosureNotification, "findMany", async () => completed ? [] : [{
    ...notification, deliveries: deliveries.filter((d) => d.status === "pending"),
  }]);
  mock.method(prisma.disclosureNotification, "count", async () => completed ? 0 : 1);
  mock.method(prisma.disclosureNotification, "update", async ({ data }: any) => {
    if (data.completedAt) completed = true;
    return notification;
  });
  mock.method(prisma.notifiedDisclosure, "upsert", async () => { recorded = true; return {}; });
  mock.method(prisma.watchlist, "findMany", async () => deliveries.map((d) => ({ userId: d.userId })));
  mock.method(prisma.disclosureDelivery, "updateMany", async ({ where, data }: any) => {
    for (const d of deliveries) if (where.pushTokenId.in.includes(d.pushTokenId)) d.status = data.status;
    return { count: where.pushTokenId.in.length };
  });
  mock.method(prisma.disclosureDelivery, "count", async ({ where }: any) => deliveries.filter((d) => d.status === where.status).length);
  const deleted = mock.method(prisma.pushToken, "deleteMany", async () => ({ count: 1 }));
  mock.method(prisma, "$transaction", async (ops: any) => Promise.all(ops));
  return { deliveries, deleted, isRecorded: () => recorded };
}

test("partial failure retries only the failed device on a later run", async () => {
  const f = fixture();
  const first = await processDisclosureQueue(async () => ({
    successCount: 1, successfulTokens: ["token-0"], invalidTokens: [],
  }));
  assert.equal(first.pending, 1);
  assert.equal(f.isRecorded(), false);
  const second = await processDisclosureQueue(async (tokens) => {
    assert.deepEqual(tokens, ["token-1"]);
    return { successCount: 1, successfulTokens: tokens, invalidTokens: [] };
  });
  assert.equal(second.pending, 0);
  assert.equal(f.isRecorded(), true);
  let resent = false;
  await processDisclosureQueue(async () => {
    resent = true;
    return { successCount: 0, successfulTokens: [], invalidTokens: [] };
  });
  assert.equal(resent, false);
});

test("transport failure remains pending", async () => {
  const f = fixture();
  mock.method(console, "error", () => {});
  const result = await processDisclosureQueue(async () => { throw new Error("offline"); });
  assert.equal(result.pending, 1);
  assert.ok(f.deliveries.every((d) => d.status === "pending"));
  assert.equal(f.isRecorded(), false);
});

test("opt-out and device ownership change suppress queued pushes", async () => {
  const f = fixture();
  f.deliveries[0].pushToken.user.notificationsEnabled = false;
  f.deliveries[1].pushToken.userId = "another-user";
  let calls = 0;
  const result = await processDisclosureQueue(async () => {
    calls++;
    return { successCount: 0, successfulTokens: [], invalidTokens: [] };
  });
  assert.equal(calls, 0);
  assert.equal(result.notified, 0);
  assert.ok(f.deliveries.every((d) => d.status === "skipped"));
});

test("invalid tokens are cleaned up without retry", async () => {
  const f = fixture(1);
  const result = await processDisclosureQueue(async () => ({
    successCount: 0, successfulTokens: [], invalidTokens: ["token-0"],
  }));
  assert.equal(result.pending, 0);
  assert.equal(result.notified, 0);
  assert.equal(f.deleted.mock.callCount(), 1);
});

test("multicast is split into batches of at most 500 devices", async () => {
  fixture(501);
  const sizes: number[] = [];
  const result = await processDisclosureQueue(async (tokens) => {
    sizes.push(tokens.length);
    return { successCount: tokens.length, successfulTokens: tokens, invalidTokens: [] };
  });
  assert.deepEqual(sizes, [500, 1]);
  assert.equal(result.pushesSent, 501);
});

test("collection preserves deliveries and skips legacy completed filings", async () => {
  mock.method(prisma.watchlist, "findMany", async () => [{ ticker: "005930", userId: "u" }]);
  mock.method(prisma.notifiedDisclosure, "findMany", async () => [{ rcept_no: "old" }]);
  mock.method(prisma.pushToken, "findMany", async () => [{ id: "p", userId: "u" }]);
  const upsert = mock.method(prisma.disclosureNotification, "upsert", async () => ({}));
  await enqueueDisclosures(["old", "new"].map((id) => ({
    rcept_no: id, stock_code: "005930", corp_name: "Example", report_nm: "Report", flr_nm: "", rcept_dt: "20260909",
  })));
  assert.equal(upsert.mock.callCount(), 1);
  const args = upsert.mock.calls[0].arguments[0] as any;
  assert.deepEqual(args.update, {});
  assert.deepEqual(args.create.deliveries.create, [{ pushTokenId: "p", userId: "u" }]);
});

test("missing FCM config does not process the queue", async () => {
  const previous = process.env.FIREBASE_SERVICE_ACCOUNT;
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  mock.method(prisma.dartPollLock, "upsert", async () => ({}));
  mock.method(prisma.dartPollLock, "updateMany", async () => ({ count: 1 }));
  const drain = mock.method(prisma.disclosureNotification, "findMany", async () => []);
  try {
    const result = await pollDartDisclosures();
    assert.equal(result.ok, false);
    assert.equal(drain.mock.callCount(), 0);
  } finally {
    if (previous === undefined) delete process.env.FIREBASE_SERVICE_ACCOUNT;
    else process.env.FIREBASE_SERVICE_ACCOUNT = previous;
  }
});
