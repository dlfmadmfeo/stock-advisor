import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StockDetailScreen } from "@/components/mobile-screens";
import { getSessionUser } from "@/lib/auth";
import { RETURNING_USER_COOKIE } from "@/lib/returning-user-mark";

// 2026-10-17 세션: 공시 푸시 알림을 눌러서 들어온 경우(Flutter 앱이 주소에
// ?from=push를 붙여줌, main.dart의 _openStockFromNotification) 로그아웃
// 상태면 종목 화면 대신 로그인 화면으로 보냅니다. 이 앱은 원래 손님도 종목
// 화면을 구경할 수 있어서(로그인 필요한 건 하트/관심종목뿐) 일반 접근은 그대로
// 두고, "알림을 눌렀는데 로그아웃돼 있다"는 상황에서만 안내가 필요해요 —
// 알림은 로그인했던 계정에 묶여서 오는 거라 로그인 상태가 전제거든요.
//
// 안내 문구는 두 갈래: 재방문 마커가 남아있으면 세션이 저절로 만료된 것이라
// 기존 "세션이 만료돼서 로그아웃됐어요"(?expired=1)를 그대로 쓰고, 마커가
// 없으면(직접 로그아웃함) 만료가 아니니 "로그아웃된 상태예요"(?loggedout=1).
export default async function StockPage({
  params,
  searchParams,
}: {
  params: Promise<{ ticker: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const [{ ticker }, { from }] = await Promise.all([params, searchParams]);

  if (from === "push") {
    const user = await getSessionUser();
    if (!user) {
      const cookieStore = await cookies();
      const wasLoggedIn = cookieStore.get(RETURNING_USER_COOKIE)?.value === "1";
      redirect(wasLoggedIn ? "/login?expired=1" : "/login?loggedout=1");
    }
  }

  return <StockDetailScreen ticker={ticker} />;
}
