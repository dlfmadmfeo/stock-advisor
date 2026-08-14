// ---------------------------------------------------------------------------
// 종목 데이터: 가격/지표는 조회 시점 기준 참고용 스냅샷입니다 (실시간 아님).
// 실시간 값은 /api/quotes 서버 라우트가 성공하면 덮어씁니다 (src/lib/live-stock.ts 참고).
// ma5over20 / volRatio / rsi 는 screener.ts의 4개 공개 규칙 계산에 쓰이는 예시 지표입니다.
// ---------------------------------------------------------------------------

export type Stock = {
  ticker: string;
  name: string;
  sector: string;
  price: number;
  chg: number;
  cap: string;
  per: number;
  pbr?: number | null;
  hi: number;
  lo: number;
  ma5over20: boolean;
  volRatio: number;
  rsi: number;
};

export const SECTORS = [
  "전체",
  "반도체",
  "플랫폼",
  "2차전지",
  "자동차",
  "바이오",
  "금융",
  "방산",
] as const;

export const STOCKS: Stock[] = [
  { ticker: "005930", name: "삼성전자", sector: "반도체", price: 207000, chg: 1.8, cap: "2,069조원", per: 24.8, pbr: 2.1, hi: 234000, lo: 128000, ma5over20: true, volRatio: 1.6, rsi: 58 },
  { ticker: "000660", name: "SK하이닉스", sector: "반도체", price: 1322000, chg: 0.9, cap: "962조원", per: 28.4, pbr: 3.4, hi: 1344000, lo: 931000, ma5over20: true, volRatio: 1.4, rsi: 55 },
  { ticker: "035420", name: "NAVER", sector: "플랫폼", price: 198500, chg: -0.6, cap: "32조원", per: 19.6, pbr: 1.5, hi: 241000, lo: 176500, ma5over20: false, volRatio: 0.8, rsi: 47 },
  { ticker: "035720", name: "카카오", sector: "플랫폼", price: 43500, chg: 0.4, cap: "19조원", per: 32.1, pbr: 1.1, hi: 58000, lo: 34200, ma5over20: false, volRatio: 1.1, rsi: 44 },
  { ticker: "373220", name: "LG에너지솔루션", sector: "2차전지", price: 318500, chg: -1.2, cap: "74조원", per: 41.2, pbr: 3.8, hi: 339000, lo: 294600, ma5over20: false, volRatio: 0.9, rsi: 39 },
  { ticker: "005380", name: "현대차", sector: "자동차", price: 235000, chg: 0.7, cap: "50조원", per: 6.8, pbr: 0.9, hi: 268000, lo: 198000, ma5over20: true, volRatio: 1.5, rsi: 61 },
  { ticker: "000270", name: "기아", sector: "자동차", price: 98500, chg: 1.1, cap: "39조원", per: 5.9, pbr: 1.1, hi: 112000, lo: 84300, ma5over20: true, volRatio: 1.7, rsi: 63 },
  { ticker: "207940", name: "삼성바이오로직스", sector: "바이오", price: 1082000, chg: 0.6, cap: "77조원", per: 62.3, pbr: 5.2, hi: 1167000, lo: 912000, ma5over20: true, volRatio: 1.3, rsi: 55 },
  { ticker: "055550", name: "신한지주", sector: "금융", price: 68500, chg: -0.4, cap: "28조원", per: 6.1, pbr: 0.5, hi: 78200, lo: 52100, ma5over20: false, volRatio: 1.0, rsi: 46 },
  { ticker: "012450", name: "한화에어로스페이스", sector: "방산", price: 812000, chg: 1.4, cap: "39조원", per: 33.5, pbr: 6.7, hi: 861000, lo: 312000, ma5over20: true, volRatio: 1.9, rsi: 66 },
];

export function getStock(ticker: string): Stock | undefined {
  return STOCKS.find((s) => s.ticker === ticker);
}

// 예시 보유 종목 (포트폴리오 화면용). 실제 계좌 연동 전 참고용 데이터입니다.
export const HOLDINGS: { ticker: string; qty: number; avgBuy: number }[] = [
  { ticker: "005930", qty: 40, avgBuy: 184000 },
  { ticker: "000660", qty: 3, avgBuy: 1190000 },
  { ticker: "035420", qty: 15, avgBuy: 204000 },
  { ticker: "373220", qty: 2, avgBuy: 300000 },
];

export function formatKRW(value: number) {
  return new Intl.NumberFormat("ko-KR").format(Math.round(value));
}

// KIS hts_avls는 억원 단위로 옵니다. 1조 = 10,000억.
export function formatMarketCapEok(eok: number): string {
  if (eok >= 10000) {
    const jo = eok / 10000;
    return `${jo % 1 === 0 ? jo.toFixed(0) : jo.toFixed(1)}조원`;
  }
  return `${formatKRW(eok)}억원`;
}
