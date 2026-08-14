// ---------------------------------------------------------------------------
// "스크리너 이력" 화면의 정적 콘텐츠 (2026-08-14 세션, 서버 컴포넌트 분리
// 확장). news-content.tsx와 같은 이유로 "use client"가 없습니다 — 상세 배경은
// news-content.tsx 상단 주석 참고.
//
// history는 아직 실제 이력 데이터 연동 전 목업입니다 (화면 안내 문구에도
// "예시 데이터"라고 명시돼 있음).
// ---------------------------------------------------------------------------

import { HistoryMetric } from "@/components/ui-primitives";

const history = [
  [
    "삼성전자",
    "전기전자",
    "2024.05.23",
    "42,000원",
    "48,600원",
    "+15.71%",
    "진행중",
  ],
  [
    "나나다",
    "내수 소비재",
    "2024.05.20",
    "28,500원",
    "31,200원",
    "+9.47%",
    "진행중",
  ],
  [
    "그린에너지",
    "친환경 에너지",
    "2024.05.15",
    "19,800원",
    "17,600원",
    "-11.11%",
    "완료",
  ],
  [
    "바이오인사이트",
    "바이오/헬스케어",
    "2024.05.10",
    "33,000원",
    "29,700원",
    "-10.00%",
    "완료",
  ],
];

// 탭 버튼("전체"/"진행중"/"완료")은 원래도 onClick이 없는 정적 표시용이라
// 서버 컴포넌트로 옮겨도 동작 차이가 없어요. 나중에 실제 탭 필터링을
// 붙이려면 그 부분만 작은 클라이언트 컴포넌트로 분리하면 됩니다.
export function HistoryContent() {
  return (
    <section className="px-5 pb-8 pt-3 lg:max-w-[960px] lg:px-8">
      <p className="mb-3 rounded-lg bg-[#fff4e8] px-3 py-2 text-[11px] font-semibold leading-5 text-[#9a5b00]">
        예시 데이터예요. 실제 스크리너 통과/이탈 이력이 쌓이기 전까지 화면
        구성 참고용으로만 봐주세요.
      </p>
      <div className="grid grid-cols-3 rounded-lg bg-[#e5e8eb] p-1 text-sm font-bold">
        {["전체", "진행중", "완료"].map((item, index) => (
          <button
            className={`h-10 rounded-md ${index === 0 ? "bg-white text-[#191f28] shadow-sm" : "text-[#6b7684]"}`}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        {history.map(([name, sector, date, start, now, rate, status]) => (
          <article
            className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]"
            key={name}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-base font-bold text-[#191f28]">{name}</h3>
                <p className="mt-1 text-sm font-medium text-[#8b95a1]">
                  {sector} · {date}
                </p>
              </div>
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-bold ${status === "진행중" ? "bg-[#f2f7ff] text-[#3182f6]" : "bg-[#f2f4f6] text-[#6b7684]"}`}
              >
                {status}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <HistoryMetric label="추천가" value={start} />
              <HistoryMetric label="현재가" value={now} />
              <HistoryMetric
                label="수익률"
                positive={rate.startsWith("+")}
                value={rate}
              />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
