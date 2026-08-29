// ---------------------------------------------------------------------------
// 종목 상세 화면의 "투자자 매매동향"(외국인/기관/개인 순매수 추이) 관련
// 순수 타입/집계 함수. API 응답(일별)을 받아서 화면에서 고른 기간
// (일/주/달/연) 단위로 합산하는 역할만 합니다 — fetch 자체는
// use-investor-trend.ts, 실제 KIS 호출은 서버 전용 kis.ts가 담당.
// ---------------------------------------------------------------------------

export type InvestorTrendDay = {
  date: string; // yyyymmdd
  close: number;
  frgnNetAmount: number;
  orgnNetAmount: number;
  prsnNetAmount: number;
  frgnNetQty: number;
  orgnNetQty: number;
  prsnNetQty: number;
};

export type InvestorTrendPeriod = "day" | "week" | "month" | "year";

export const INVESTOR_TREND_PERIODS: { value: InvestorTrendPeriod; label: string }[] = [
  { value: "day", label: "일별" },
  { value: "week", label: "주별" },
  { value: "month", label: "월별" },
  { value: "year", label: "연별" },
];

export type InvestorTrendPoint = {
  key: string; // 정렬/구분용 (yyyymmdd | 그 주 월요일 yyyymmdd | yyyymm | yyyy)
  label: string; // 화면 표시용
  close: number; // 그 구간의 마지막 거래일 종가
  frgnNetAmount: number;
  orgnNetAmount: number;
  prsnNetAmount: number;
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// 그 날짜가 속한 주의 월요일(yyyymmdd)을 구함 — ISO 8601 주차 번호 대신
// "월요일 날짜"를 그룹 키로 쓰는 단순한 방식(주차 계산보다 이해하기 쉬움).
function mondayOf(dateStr: string): string {
  const y = Number(dateStr.slice(0, 4));
  const m = Number(dateStr.slice(4, 6)) - 1;
  const d = Number(dateStr.slice(6, 8));
  const date = new Date(Date.UTC(y, m, d));
  const day = date.getUTCDay(); // 0=일 ~ 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}`;
}

function keyOf(dateStr: string, period: InvestorTrendPeriod): string {
  switch (period) {
    case "day":
      return dateStr;
    case "week":
      return mondayOf(dateStr);
    case "month":
      return dateStr.slice(0, 6);
    case "year":
      return dateStr.slice(0, 4);
  }
}

function labelOf(key: string, period: InvestorTrendPeriod): string {
  switch (period) {
    case "day":
      return `${key.slice(4, 6)}/${key.slice(6, 8)}`;
    case "week":
      return `${key.slice(4, 6)}/${key.slice(6, 8)}주`;
    case "month":
      return `${key.slice(0, 4)}.${key.slice(4, 6)}`;
    case "year":
      return `${key}년`;
  }
}

// 일별 원본 데이터를 고른 기간 단위로 합산합니다. 순매수 금액/수량은
// 기간 안의 값을 전부 더하고(그 기간 순매수 총합), 종가는 마지막 거래일
// 값을 그대로 씁니다(합산하면 의미 없는 값이라).
export function aggregateInvestorTrend(
  days: InvestorTrendDay[],
  period: InvestorTrendPeriod,
): InvestorTrendPoint[] {
  if (period === "day") {
    return days.map((d) => ({
      key: d.date,
      label: labelOf(d.date, "day"),
      close: d.close,
      frgnNetAmount: d.frgnNetAmount,
      orgnNetAmount: d.orgnNetAmount,
      prsnNetAmount: d.prsnNetAmount,
    }));
  }

  const map = new Map<string, InvestorTrendPoint>();
  for (const d of days) {
    const key = keyOf(d.date, period);
    const existing = map.get(key);
    if (existing) {
      existing.close = d.close; // days는 날짜 오름차순으로 온다고 가정 — 마지막 값이 그 구간 최신 종가
      existing.frgnNetAmount += d.frgnNetAmount;
      existing.orgnNetAmount += d.orgnNetAmount;
      existing.prsnNetAmount += d.prsnNetAmount;
    } else {
      map.set(key, {
        key,
        label: labelOf(key, period),
        close: d.close,
        frgnNetAmount: d.frgnNetAmount,
        orgnNetAmount: d.orgnNetAmount,
        prsnNetAmount: d.prsnNetAmount,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

// ⚠️ KIS 응답의 순매수 거래대금(frgn_ntby_tr_pbmn 등) 단위를 문서로 확인 못
// 했어요 — 실측 값(예: 삼성전자 하루 순매수 -1,801,118)을 "억원" 단위로
// 해석하면 하루 순매수가 -180만억원(=1경8천조)이 되어 말이 안 되고, "천원"
// 단위로 보면 -18억원 정도가 나와서 훨씬 그럴듯해요. 그래서 천원 단위로
// 가정하고 억원으로 변환합니다 — 실제 화면에서 다른 사이트(네이버 증권 등)
// 수치랑 비교해서 확인해보고 다르면 이 divisor만 고치면 됩니다.
const RAW_UNIT_TO_EOK = 100_000; // 천원 -> 억원 (1억원 = 100,000천원)

export function formatNetAmountEok(rawThousandWon: number): string {
  const eok = rawThousandWon / RAW_UNIT_TO_EOK;
  const sign = eok > 0 ? "+" : "";
  if (Math.abs(eok) >= 10000) {
    return `${sign}${(eok / 10000).toFixed(1)}조원`;
  }
  return `${sign}${eok.toFixed(1)}억원`;
}
