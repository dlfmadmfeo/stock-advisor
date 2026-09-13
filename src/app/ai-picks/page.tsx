import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { EmptyState } from "@/components/ui-primitives";
import { AiPicksContent } from "@/components/ai-picks-content";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AiPick } from "@/lib/ai-picks";

// 2026-09-13 세션: 하단 nav에 새로 생긴 "AI 추천" 탭. 아직은 관리자 계정
// (junhee92kr@naver.com, User.isAdmin) 한 명만 실제 기능을 쓸 수 있어요 —
// 탭 자체는 누구나 보이고 눌러서 들어올 수 있지만, 권한이 없으면 로그인
// 여부와 무관하게 "권한 없음" 안내만 보여주고 실제 콘텐츠는 렌더링하지
// 않습니다(리다이렉트 없이 이 화면 안에서 안내).
export default async function AiPicksPage() {
  const user = await getSessionUser();
  const hasAccess = user?.isAdmin ?? false;

  // 관리자일 때만 캐시된 마지막 결과(AiPickBatch, id=1 싱글턴)를 미리
  // 읽어와서 화면 진입과 동시에 보여줍니다 — "다시 생성하기"를 눌러야만
  // 실제 Claude 호출이 일어나요(ai-picks-content.tsx 참고).
  const batch = hasAccess ? await prisma.aiPickBatch.findUnique({ where: { id: 1 } }) : null;

  return (
    <AppShell>
      <BackTopBar title="AI 추천" />
      <section className="px-5 pb-8 pt-3 lg:max-w-[640px] lg:px-8">
        {hasAccess ? (
          <AiPicksContent
            initialGeneratedAt={batch?.generatedAt.toISOString() ?? null}
            initialPicks={(batch?.payload as AiPick[] | undefined) ?? null}
          />
        ) : (
          <EmptyState text="아직은 관리자만 사용할 수 있는 기능이에요." />
        )}
      </section>
    </AppShell>
  );
}
