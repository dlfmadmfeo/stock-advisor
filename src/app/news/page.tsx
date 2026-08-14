import { Search } from "lucide-react";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { NewsContent } from "@/components/news-content";

// ---------------------------------------------------------------------------
// 서버 컴포넌트 분리 파일럿 (2026-08-14 세션). 이 파일은 "use client"가
// 없는 진짜 서버 컴포넌트입니다. AppShell(셸)과 BackTopBar(뒤로가기 버튼)만
// 클라이언트 조각(둘 다 mobile-screens.tsx, usePathname/useRouter 필요)이고,
// 화면의 실제 내용인 NewsContent는 서버에서 렌더링돼서 클라이언트 JS로
// 전혀 내려가지 않습니다.
//
// 상세 배경: src/components/news-content.tsx 상단 주석 참고.
// ---------------------------------------------------------------------------
export default function NewsPage() {
  return (
    <AppShell>
      <BackTopBar right={<Search />} rightHref="/search" title="시장 소식" />
      <NewsContent />
    </AppShell>
  );
}
