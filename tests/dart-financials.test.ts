import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildFinancialYears,
  extractRawYears,
  parseCorpCodeXml,
  type DartAccountRow,
} from "../src/lib/dart-financials";

const row = (
  sj_div: string,
  account_id: string,
  account_nm: string,
  cur: string,
  prev: string,
  prev2: string,
): DartAccountRow => ({
  sj_div,
  account_id,
  account_nm,
  thstrm_amount: cur,
  frmtrm_amount: prev,
  bfefrmtrm_amount: prev2,
});

// 원 단위. 2025/2024/2023 순서(당기/전기/전전기).
const manufacturer: DartAccountRow[] = [
  row("IS", "ifrs-full_Revenue", "매출액", "300000000000000", "250000000000000", "200000000000000"),
  row("IS", "dart_OperatingIncomeLoss", "영업이익", "60000000000000", "40000000000000", "20000000000000"),
  row("IS", "ifrs-full_ProfitLoss", "당기순이익", "45000000000000", "30000000000000", "15000000000000"),
  row("IS", "ifrs-full_ProfitLossAttributableToOwnersOfParent", "지배기업 소유주지분", "40000000000000", "28000000000000", "14000000000000"),
  row("IS", "ifrs-full_BasicEarningsLossPerShare", "기본주당이익", "6,000", "4000", "2000"),
  row("CIS", "ifrs-full_ProfitLoss", "당기순이익", "1", "1", "1"), // IS가 우선이라 무시돼야 함
  row("BS", "ifrs-full_Equity", "자본총계", "500000000000000", "450000000000000", "400000000000000"),
  row("BS", "ifrs-full_EquityAttributableToOwnersOfParent", "지배기업 소유주지분", "400000000000000", "380000000000000", "350000000000000"),
  row("BS", "ifrs-full_Liabilities", "부채총계", "250000000000000", "225000000000000", "200000000000000"),
];

test("parseCorpCodeXml: 상장사만 뽑고, 비상장사 코드가 다음 상장사와 엉키지 않는다", () => {
  const xml = `<result>
  <list><corp_code>00000001</corp_code><corp_name>비상장</corp_name><stock_code> </stock_code><modify_date>20200101</modify_date></list>
  <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code><modify_date>20200101</modify_date></list>
  <list><corp_code>00000002</corp_code><corp_name>또 비상장</corp_name><stock_code></stock_code><modify_date>20200101</modify_date></list>
  <list><corp_code>00164779</corp_code><corp_name>SK하이닉스</corp_name><stock_code>000660</stock_code><modify_date>20200101</modify_date></list>
</result>`;
  const map = parseCorpCodeXml(xml);
  assert.equal(map.size, 2);
  assert.equal(map.get("005930"), "00126380");
  assert.equal(map.get("000660"), "00164779");
  assert.equal(map.has("00000001"), false);
});

test("제조업: 억원 환산, 영업이익률, ROE, 부채비율, 전년 대비 증가율을 계산한다", () => {
  const years = buildFinancialYears(extractRawYears(manufacturer, 2025));
  assert.deepEqual(years.map((y) => y.year), ["202312", "202412", "202512"]); // 오래된 연도부터

  const y25 = years[2];
  assert.equal(y25.revenue, 3_000_000); // 300조원 = 3,000,000억
  assert.equal(y25.operatingProfit, 600_000);
  assert.equal(y25.netIncome, 450_000);
  assert.equal(y25.opMarginPct, 20);
  assert.equal(y25.roe, 10); // 지배주주 순이익 40조 / 지배주주 자본 400조
  assert.equal(y25.debtRatio, 50); // 부채 250조 / 자본총계 500조
  assert.equal(y25.eps, 6000); // 쉼표가 있어도 파싱
  assert.equal(y25.bps, null);
  assert.equal(y25.revenueGrowthPct, 20);
  assert.equal(y25.opGrowthPct, 50);
  assert.equal(y25.netIncomeGrowthPct, 50);

  // 가장 오래된 연도는 비교할 전년 데이터가 없으니 증가율은 null.
  assert.equal(years[0].revenueGrowthPct, null);
});

test("금융지주: 매출액·영업이익 계정이 없어도 순이익/ROE/부채비율은 채운다", () => {
  const bank: DartAccountRow[] = [
    row("CIS", "ifrs-full_ProfitLoss", "당기순이익", "5840715000000", "5028606000000", "4526334000000"),
    row("CIS", "ifrs-full_BasicEarningsLossPerShare", "기본주당이익", "15410", "12880", "11483"),
    row("BS", "ifrs-full_Equity", "자본총계", "60829989000000", "59815181000000", "58636190000000"),
    row("BS", "ifrs-full_Liabilities", "부채총계", "737093044000000", "698030351000000", "657089226000000"),
  ];
  const years = buildFinancialYears(extractRawYears(bank, 2025));
  const latest = years[years.length - 1];
  assert.equal(latest.revenue, null);
  assert.equal(latest.operatingProfit, null);
  assert.equal(latest.opMarginPct, null);
  assert.equal(latest.netIncome, 58_407); // 5.84조원 ≈ 58,407억
  assert.equal(latest.roe, 9.6); // 지배주주 항목이 없으면 순이익/자본총계로 계산
  assert.equal(latest.debtRatio, 1211.7);
  assert.equal(latest.netIncomeGrowthPct, 16.1); // (5.8407-5.0286)/5.0286 = 16.1497%
});

test("두 번 호출한 결과를 합치면 연속된 연도가 오름차순으로 나온다", () => {
  const older: DartAccountRow[] = [
    row("IS", "ifrs-full_Revenue", "매출액", "150000000000000", "120000000000000", "100000000000000"),
  ];
  const raw = extractRawYears(manufacturer, 2025); // 2023~2025
  for (const [y, r] of extractRawYears(older, 2022)) if (!raw.has(y)) raw.set(y, r); // 2020~2022
  const years = buildFinancialYears(raw);
  assert.deepEqual(
    years.map((y) => y.year),
    ["202012", "202112", "202212", "202312", "202412", "202512"],
  );
  // 2023의 증가율은 합쳐진 2022 데이터로 계산된다(매출만 있는 연도지만 비교는 가능).
  assert.equal(years[3].revenueGrowthPct, 33.3); // 200조 vs 150조
});

test("표시할 값이 하나도 없는 연도는 버린다", () => {
  const onlyEquity: DartAccountRow[] = [
    row("BS", "ifrs-full_Equity", "자본총계", "100", "100", "100"),
  ];
  assert.deepEqual(buildFinancialYears(extractRawYears(onlyEquity, 2025)), []);
});
