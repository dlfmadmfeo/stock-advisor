import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { EmptyState } from "@/components/ui-primitives";
import { getSessionUser } from "@/lib/auth";

// 2026-09-13 세션: 하단 nav에 새로 생긴 "AI 추천" 탭. 아직은 관리자 계정
// (junhee92kr@naver.com, User.isAdmin) 한 명만 실제 기능을 쓸 수 있어요 —
// 탭 자체는 누구나 보이고 눌러서 들어올 수 있지만, 권한이 없으면 로그인
// 여부와 무관하게 "권한 없음" 안내만 보여주고 실제 콘텐츠는 렌더링하지
// 않습니다(리다이렉트 없이 이 화면 안에서 안내).
export default async function AiPicksPage() {
  const user = await getSessionUser();
  const hasAccess = user?.isAdmin ?? false;

  return (
    <AppShell>
      <BackTopBar title="AI 추천" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        {hasAccess ? (
          <EmptyState text="AI 추천 기능을 준비 중이에요. 곧 만나보실 수 있어요." />
        ) : (
          <EmptyState text="아직은 관리자만 사용할 수 있는 기능이에요." />
        )}
      </section>
    </AppShell>
  );
}
