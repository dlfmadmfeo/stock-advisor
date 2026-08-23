// ---------------------------------------------------------------------------
// 화면 공용 UI 조각 (2026-08-14 세션, 서버 컴포넌트 분리 확장).
//
// ⚠️ "use client" 없음 — 의도적입니다. 원래 mobile-screens.tsx 안에 있던
// 컴포넌트들인데, 전부 훅/상태 없이 props만 받는 순수 표시용이라 여기로
// 옮겼습니다. mobile-screens.tsx는 파일 전체가 "use client"라서, 여기 있는
// 것들이 그 안에 남아있으면 실제로는 정적인데도 무조건 클라이언트 번들에
// 포함됐어요.
//
// 이 파일을 분리해두면, 서버 컴포넌트인 page.tsx가 TopBar 같은 걸 직접
// import해서 클라이언트 JS 없이 렌더링할 수 있습니다 (예: src/app/mypage,
// src/app/history). 뒤로가기 버튼처럼 useRouter가 필요한 경우엔
// mobile-screens.tsx의 BackTopBar(클라이언트)가 이 TopBar를 감싸서 씁니다.
//
// 반대로 CategoryScreen처럼 여전히 클라이언트인 화면들도 이 파일에서
// import해서 그대로 씁니다 — 정의 위치만 옮긴 거라 기존 화면 동작은
// 전혀 안 바뀌어요.
// ---------------------------------------------------------------------------

import Link from "next/link";

export type IconComponent = React.ComponentType<{ className?: string }>;

export function TopBar({
  title,
  left,
  right,
  onLeftClick,
  rightHref,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onLeftClick?: () => void;
  rightHref?: string;
}) {
  const buttonClass =
    "grid h-10 w-10 place-items-center rounded-full bg-white text-[#333d4b] ring-1 ring-[#e5e8eb] active:scale-[0.98] [&_svg]:h-5 [&_svg]:w-5";
  return (
    <header className="sticky top-0 z-20 flex h-[60px] shrink-0 items-center justify-between bg-[#f7f8fa]/95 px-4 backdrop-blur lg:px-8">
      <div className="flex w-10 items-center justify-start">
        {left ? (
          onLeftClick ? (
            <button className={buttonClass} onClick={onLeftClick} type="button">
              {left}
            </button>
          ) : (
            <IconButton>{left}</IconButton>
          )
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>
      <h1 className="text-xl font-extrabold tracking-[-0.02em] text-[#191f28]">
        {title}
      </h1>
      <div className="flex w-10 items-center justify-end">
        {right ? (
          rightHref ? (
            <Link className={buttonClass} href={rightHref}>
              {right}
            </Link>
          ) : (
            <IconButton>{right}</IconButton>
          )
        ) : (
          <div className="h-10 w-10" />
        )}
      </div>
    </header>
  );
}

export function IconButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="grid h-10 w-10 place-items-center rounded-full bg-white text-[#333d4b] ring-1 ring-[#e5e8eb] active:scale-[0.98] [&_svg]:h-5 [&_svg]:w-5">
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  positive,
  valueClassName,
}: {
  label: string;
  value: string;
  positive?: boolean;
  // 기본은 text-xl. 금액이 커서(예: "20,467,000원") 좁은 2컬럼 카드에서
  // "원"이 다음 줄로 밀려나던 화면(자산 화면 피드백, 2026-08-23 세션)처럼
  // 더 작은 크기가 필요한 곳에서만 넘겨서 씀 — 다른 MetricCard(종목 상세의
  // PER/PBR 등, 값이 짧음)는 기존 크기 그대로 유지.
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl bg-white p-4 ring-1 ring-[#e5e8eb]">
      <p className="text-xs font-bold text-[#8b95a1]">{label}</p>
      <p
        className={`mt-2 font-bold tracking-[-0.02em] ${valueClassName ?? "text-xl"} ${positive ? "text-[#f04452]" : "text-[#191f28]"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function Allocation({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: color }}
        />
        <span className="text-sm font-bold text-[#4e5968]">{label}</span>
      </div>
      <span className="text-sm font-semibold text-[#191f28]">{value}</span>
    </div>
  );
}

export function SectionHeader({
  title,
  action,
  href,
}: {
  title: string;
  action?: string;
  href?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-lg font-extrabold tracking-[-0.02em] text-[#191f28]">
        {title}
      </h2>
      {action && href ? (
        <Link className="text-sm font-bold text-[#3182f6]" href={href}>
          {action}
        </Link>
      ) : null}
    </div>
  );
}

export function SectionTitle({
  title,
  action,
}: {
  title: string;
  action?: string;
}) {
  return (
    <div className="mb-3 mt-7 flex items-center justify-between">
      <h2 className="text-lg font-extrabold tracking-[-0.02em] text-[#191f28]">
        {title}
      </h2>
      {action ? (
        <button className="text-sm font-bold text-[#3182f6]">{action}</button>
      ) : null}
    </div>
  );
}

export function MenuGrid({ items }: { items: Array<[IconComponent, string]> }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {items.map(([Icon, label]) => (
        <button
          className="rounded-2xl bg-white px-2 py-4 text-center ring-1 ring-[#e5e8eb]"
          key={label}
        >
          <Icon className="mx-auto h-6 w-6 text-[#3182f6]" />
          <p className="mt-2 text-xs font-semibold text-[#333d4b]">{label}</p>
        </button>
      ))}
    </div>
  );
}

export function HistoryMetric({
  label,
  value,
  positive,
}: {
  label: string;
  value: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-lg bg-[#f7f8fa] px-3 py-2">
      <p className="text-xs font-bold text-[#8b95a1]">{label}</p>
      <p
        className={`mt-1 text-sm font-semibold ${positive ? "text-[#f04452]" : "text-[#191f28]"}`}
      >
        {value}
      </p>
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-2xl bg-white px-4 py-10 text-center text-sm font-semibold text-[#8b95a1] ring-1 ring-[#e5e8eb]">
      {text}
    </p>
  );
}
