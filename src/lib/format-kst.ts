// 서버 타임존과 관계없이 한국 시간으로 표시하기 위한 함수들. 서버리스 함수는 기본이
// UTC라 Date 메서드를 그대로 쓰면 9시간 어긋난다.
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
