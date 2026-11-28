// ---------------------------------------------------------------------------
// 화면 공용 UI 조각. 훅·상태 없이 props만 받는 표시용 컴포넌트라 "use client" 없이
// 둔다. 서버 컴포넌트 page.tsx(예: src/app/mypage, src/app/devices)가 클라이언트 JS
// 없이 직접 렌더링할 수 있고, useRouter가 필요한 경우는 mobile-screens.tsx의
// BackTopBar가 TopBar를 감싸서 쓴다.
// ---------------------------------------------------------------------------

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export type IconComponent = React.ComponentType<{ className?: string }>;

export function TopBar({
  title,
  left,
  right,
  onLeftClick,
  onRightClick,
  rightHref,
}: {
  title: string;
  left?: React.ReactNode;
  right?: React.ReactNode;
  onLeftClick?: () => void;
  // 우측 클릭 아이콘(예: 관심종목 하트)용. rightHref와 달리 페이지 이동 없이 동작만 실행한다.
  onRightClick?: () => void;
  rightHref?: string;
}) {
  const buttonClass =
    "grid h-11 w-11 place-items-center rounded-md text-[#333d4b] active:bg-[#f2f4f6] [&_svg]:h-5 [&_svg]:w-5";
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-[#eef0f2] bg-white px-3 lg:px-8">
      <div className="flex w-11 items-center justify-start">
        {left ? (
          onLeftClick ? (
            <button className={buttonClass} onClick={onLeftClick} type="button">
              {left}
            </button>
          ) : (
            <IconButton>{left}</IconButton>
          )
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>
      <h1 className="text-[17px] font-bold tracking-[-0.01em] text-[#191f28]">
        {title}
      </h1>
      <div className="flex w-11 items-center justify-end">
        {right ? (
          onRightClick ? (
            <button className={buttonClass} onClick={onRightClick} type="button">
              {right}
            </button>
          ) : rightHref ? (
            <Link className={buttonClass} href={rightHref}>
              {right}
            </Link>
          ) : (
            <IconButton>{right}</IconButton>
          )
        ) : (
          <div className="h-11 w-11" />
        )}
      </div>
    </header>
  );
}

export function IconButton({ children }: { children: React.ReactNode }) {
  return (
    <button className="grid h-11 w-11 place-items-center rounded-md text-[#333d4b] active:bg-[#f2f4f6] [&_svg]:h-5 [&_svg]:w-5">
      {children}
    </button>
  );
}

export function MetricCard({
  label,
  value,
  positive,
  valueClassName,
  compact,
}: {
  label: string;
  value: string;
  positive?: boolean;
  // 기본은 text-xl. 좁은 2컬럼 카드에서 큰 금액이 줄바꿈되는 곳에서만 작은 크기를 넘긴다.
  valueClassName?: string;
  // 카드가 한 줄에 3~5개 들어가는 곳(종목 상세)에서 패딩을 한 단계 줄인다.
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-lg bg-white ring-1 ring-[#e5e8eb] ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-xs font-bold text-[#6b7684]">{label}</p>
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
      <h2 className="text-lg font-bold tracking-[-0.02em] text-[#191f28]">
        {title}
      </h2>
      {action && href ? (
        <Link className="text-sm font-bold text-[var(--brand)]" href={href}>
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
      <h2 className="text-lg font-bold tracking-[-0.02em] text-[#191f28]">
        {title}
      </h2>
      {action ? (
        <button className="text-sm font-bold text-[var(--brand)]">{action}</button>
      ) : null}
    </div>
  );
}

// 세로 목록형 메뉴(아이콘 + 라벨 + 화살표). 라벨 길이나 항목 수와 관계없이
// 한 줄씩 안정적으로 배치된다.
export function MenuList({ items }: { items: Array<[IconComponent, string, string]> }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white ring-1 ring-[#e5e8eb]">
      {items.map(([Icon, label, href], i) => (
        <Link
          className={`flex items-center gap-3 px-4 py-3.5 transition active:bg-[#f7f8fa] ${
            i > 0 ? "border-t border-[#f2f4f6]" : ""
          }`}
          href={href}
          key={href}
        >
          <Icon className="h-5 w-5 shrink-0 text-[var(--brand)]" />
          <span className="flex-1 text-[15px] font-medium text-[#191f28]">
            {label}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[#c3c9d1]" />
        </Link>
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <p className="rounded-lg bg-white px-4 py-14 text-center text-sm text-[#6b7684]">
      {text}
    </p>
  );
}
