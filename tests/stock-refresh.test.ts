import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Exercise the production module with isolated I/O and hook dependencies.
function loadModule(file: string, imports: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const source = readFileSync(path.resolve(file), "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  });
  const exports: Record<string, (...args: unknown[]) => unknown> = {};
  runInNewContext(compiled.outputText, {
    exports, console, URLSearchParams,
    setTimeout: (callback: () => void) => callback(),
    ...globals,
    require: (id: string) => {
      if (!(id in imports)) throw new Error(`Unexpected dependency: ${id}`);
      return imports[id];
    },
  });
  return exports;
}

test("paged query fetches without a delay and forwards cancellation", async () => {
  const controller = new AbortController();
  const response = { stocks: [], hasMore: false };
  let requested = false;
  const mod = loadModule("src/lib/use-paged-stocks.ts", {
    "@tanstack/react-query": { useInfiniteQuery: (options: unknown) => options },
    "@/lib/constants": { UNIVERSE_PAGE_SIZE: 20 },
  }, {
    setTimeout: () => { throw new Error("Artificial delay used"); },
    fetch: async (url: string, options: { signal: AbortSignal }) => {
      requested = true;
      assert.ok(url.includes("page=0"));
      assert.equal(options.signal, controller.signal);
      return { ok: true, json: async () => response };
    },
  });
  const options = mod.usePagedStocks({}) as { queryFn: (context: unknown) => Promise<unknown> };
  const result = await options.queryFn({ pageParam: 0, signal: controller.signal });
  assert.equal(requested, true);
  assert.equal(result, response);
});

test("merged stocks update when the DB snapshot changes without a new live quote", () => {
  const live = { price: 120, chg: 1 };
  const quotes = { A: live };
  const mod = loadModule("src/lib/live-stock.ts", {
    react: { useMemo: (fn: () => unknown) => fn() },
    "@/stores/use-advisor-store": { useAdvisorStore: (fn: (s: unknown) => unknown) => fn({ liveQuotes: quotes }) },
    "@/lib/stocks": {}, "@/lib/screener": {},
  });
  const original = { ticker: "A", price: 100, macdRebound: false, sector: "old" };
  const render = (stocks: unknown[]) => mod.useMergedStocksWithLive(stocks) as typeof original[];
  const first = render([original]);
  assert.equal(render([original])[0].price, first[0].price);
  const second = render([{ ...original, sector: "new", macdRebound: true }]);
  assert.equal(second[0].sector, "new");
  assert.equal(second[0].macdRebound, true);
  assert.equal(second[0].price, 120);
  assert.notEqual(second[0], first[0]);
  const third = render([]);
  assert.equal(third.length, 0);
});

for (const allFailed of [false, true]) {
  test(allFailed ? "complete refresh failure preserves all rows" : "partial refresh preserves failed targets and removes only departures", async () => {
    const oldTime = new Date("2026-09-01T00:00:00Z");
    const rows = new Map(["A", "B", "OUT"].map((ticker) => [ticker, {
      ticker, name: ticker, sector: "test", price: 100, chg: 0, cap: "1", per: 1,
      pbr: 1, hi: 120, lo: 80, ma5over20: true, volRatio: 1, rsi: 50,
      macdRebound: false, updatedAt: oldTime,
    }]));
    let deleted = 0;
    const mod = loadModule("src/lib/refresh-universe.ts", {
      "./db": { prisma: {
        refreshLock: { upsert: async () => ({}), updateMany: async () => ({ count: 1 }), update: async () => ({}) },
        stock: {
          upsert: async () => ({}),
          findMany: async () => [...rows.values()],
          update: async ({ where, data }: { where: { ticker: string }; data: object }) => Object.assign(rows.get(where.ticker)!, data),
          deleteMany: async ({ where }: { where: { ticker: { notIn: string[] } } }) => {
            for (const key of rows.keys()) if (!where.ticker.notIn.includes(key)) { rows.delete(key); deleted++; }
            return { count: deleted };
          },
        },
      } },
      "./kis": {
        kisConfigured: () => true,
        fetchDailyBars: async (ticker: string) => allFailed || ticker === "B" ? null : [],
        fetchWeeklyBars: async () => [], fetchQuoteDetail: async () => null,
      },
      "./kospi-master": { fetchKospiMaster: async () => [
        { ticker: "A", name: "A", capEok: 2 }, { ticker: "B", name: "B", capEok: 1 },
      ] },
      "./indicators": {
        computeScreenerInputs: () => ({ price: 100, chg: 0, hi: 120, lo: 80, ma5over20: true, volRatio: 1, rsi: 50 }),
        computeMacdSeries: () => [], isMacdReboundSignal: () => false,
      },
      "./stocks": { formatMarketCapEok: () => "1" },
      "./screener": {
        passesScreener: () => true, screenerScore: () => 4,
        getRecommendation: () => ({ label: "보류" }), sectorAveragePer: () => ({}), sectorAveragePbr: () => ({}),
      },
    });
    const result = await mod.refreshUniverse() as { ok: boolean; succeeded: number };
    assert.equal(result.ok, !allFailed);
    assert.equal(result.succeeded, allFailed ? 0 : 1);
    assert.ok(rows.has("B"));
    assert.equal(rows.get("B")!.updatedAt, oldTime);
    assert.equal(deleted, allFailed ? 0 : 1);
  });
}
