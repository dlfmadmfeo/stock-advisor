// 2026-09-23 세션: 서버 컴포넌트에서 Date.getFullYear()/getHours() 등을
// 직접 쓰면 이 코드가 돌아가는 서버의 로컬 타임존을 따라가요 — 로컬
// 개발 PC는 마침 한국 시간이라 안 드러났는데, Vercel 서버리스 함수는
// 기본이 UTC라 배포본에서는 실제보다 9시간 느리게(날짜는 최대 하루
// 어긋나게) 표시되고 있었어요(관리자 화면 "마지막 로그인" 시각이 어긋나
// 보인다는 제보로 발견). 서버가 어느 타임존에서 돌든 항상 한국 시간으로
// 보이게, Date 그대로 쓰는 대신 이 함수들을 씁니다.
const KST_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function getParts(d: Date) {
  const parts = KST_DATETIME_FORMATTER.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

export function formatKstDate(d: Date): string {
  const { year, month, day } = getParts(d);
  return `${year}.${month}.${day}`;
}

export function formatKstDateTime(d: Date): string {
  const { year, month, day, hour, minute } = getParts(d);
  return `${year}.${month}.${day} ${hour}:${minute}`;
}
