// ---------------------------------------------------------------------------
// "시장 소식" 화면의 정적 콘텐츠 (2026-08-14 세션, 서버 컴포넌트 분리 파일럿).
//
// ⚠️ 이 파일엔 "use client"가 없습니다 — 일부러입니다. mobile-screens.tsx는
// 파일 전체가 "use client"라서, 그 안에 있던 이 컴포넌트들은 실제로 훅이나
// 상태를 안 쓰는데도 무조건 클라이언트 번들에 포함되고 있었어요. Next.js의
// "use client"는 파일(모듈) 단위로 적용되지, 개별 컴포넌트 단위가 아니거든요.
//
// 이 파일을 분리해서 /news/page.tsx(서버 컴포넌트)가 직접 렌더링하게 하면,
// 이 화면의 실제 콘텐츠(뉴스 카드 목록)는 서버에서 HTML로 미리 만들어지고
// 클라이언트 JS로는 전혀 안 내려가요. 유일하게 남는 클라이언트 조각은
// 뒤로가기 버튼(useRouter 필요) 하나뿐이라, mobile-screens.tsx에 작은
// `BackTopBar`로 분리해뒀습니다.
//
// newsItems는 아직 실제 API 연동 전 목업 데이터입니다(추후 뉴스 API로 교체
// 가능 — 종목 상세의 관련 뉴스 카드처럼).
// ---------------------------------------------------------------------------

import Link from "next/link";
import { Bookmark, ChevronRight } from "lucide-react";

export const newsItems = [
  {
    tag: "시장",
    title: "코스피, 외국인 매수세 유입에 2,650선 돌파",
    meta: "연합뉴스 | 10분 전",
    image: "chart",
  },
  {
    tag: "업종",
    title: "반도체 업종 강세 지속, 관련주 상승 흐름 뚜렷",
    meta: "한국경제 | 35분 전",
    image: "chip",
  },
  {
    tag: "기업",
    title: "나나다, 2분기 실적 시장 예상치 상회",
    meta: "뉴스1 | 1시간 전",
    image: "building",
  },
  {
    tag: "경제",
    title: "소비자물가 상승률 둔화, 금리 동결 가능성 확대",
    meta: "매일경제 | 2시간 전",
    image: "macro",
  },
];

const newsCategories = ["전체", "시장", "업종", "기업", "경제"];

export function thumbnailStyle(type: string): React.CSSProperties {
  const positions: Record<string, string> = {
    chart: "0% 0%",
    chip: "100% 0%",
    building: "0% 100%",
    macro: "100% 100%",
  };
  return {
    backgroundImage: "url('/news-thumbnails.webp')",
    backgroundPosition: positions[type],
    backgroundSize: "205% 205%",
  };
}

export function NewsRow({ item }: { item: (typeof newsItems)[number] }) {
  return (
    <article className="grid grid-cols-[92px_1fr_22px] gap-3 rounded-2xl bg-white p-3 ring-1 ring-[#e5e8eb]">
      <div
        aria-hidden="true"
        className="h-[78px] rounded-xl bg-cover"
        style={thumbnailStyle(item.image)}
      />
      <div className="min-w-0">
        <span className="rounded-md bg-[#f2f7ff] px-2 py-1 text-xs font-bold text-[#3182f6]">
          {item.tag}
        </span>
        <h3 className="mt-2 line-clamp-2 text-[15px] font-bold leading-5 text-[#191f28]">
          {item.title}
        </h3>
        <p className="mt-1 text-xs font-bold text-[#8b95a1]">{item.meta}</p>
      </div>
      <Bookmark className="mt-2 h-5 w-5 text-[#8b95a1]" />
    </article>
  );
}

// 홈 화면(NotificationsScreen, 클라이언트 컴포넌트)에서도 씁니다 — client
// 파일이 이 서버-세이프 모듈을 import하는 건 문제없어요, 다만 그 경우엔
// 이 컴포넌트가 호출되는 지점(홈 화면 자체가 클라이언트)이라 그 화면
// 안에서는 여전히 클라이언트 번들에 포함됩니다.
export function CompactNewsRow({ item }: { item: (typeof newsItems)[number] }) {
  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e5e8eb]"
      href="/news"
    >
      <div className="min-w-0">
        <p className="text-xs font-bold text-[#3182f6]">{item.tag}</p>
        <p className="mt-1 truncate text-sm font-semibold text-[#191f28]">
          {item.title}
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-[#8b95a1]" />
    </Link>
  );
}

// "시장 소식" 화면의 본문 전체(카테고리 필터 + 뉴스 목록). 지금은 필터 버튼이
// 실제로 필터링을 하진 않는 정적 표시용이라(원래도 onClick이 없었음) 서버
// 컴포넌트로 그대로 옮겨도 동작 차이가 없어요. 나중에 실제 필터링 기능을
// 붙이려면 그 버튼 부분만 작은 클라이언트 컴포넌트로 다시 분리하면 됩니다.
export function NewsContent() {
  return (
    <section className="px-5 pb-8 pt-3 lg:px-8">
      <div className="flex gap-2 overflow-x-auto pb-3">
        {newsCategories.map((item, index) => (
          <button
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
              index === 0
                ? "bg-[#191f28] text-white"
                : "bg-white text-[#6b7684] ring-1 ring-[#e5e8eb]"
            }`}
            key={item}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {newsItems.map((item) => (
          <NewsRow item={item} key={item.title} />
        ))}
      </div>
    </section>
  );
}
