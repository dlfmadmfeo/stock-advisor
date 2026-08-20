import { Filter } from "lucide-react";
import { AppShell, BackTopBar } from "@/components/mobile-screens";
import { HistoryContent } from "@/components/history-content";

// 서버 컴포넌트 분리 확장 (2026-08-14 세션). 뒤로가기 버튼(useRouter 필요)만
// BackTopBar(클라이언트 조각)이고, 나머지는 서버에서 렌더링됩니다.
export default function HistoryPage() {
  return (
    <AppShell>
      <BackTopBar right={<Filter />} title="스크리너 이력" />
      <HistoryContent />
    </AppShell>
  );
}
