import { APIError } from "better-auth/api";
import { prisma } from "@/lib/db";
import { DEMO_EMAIL } from "@/lib/demo-account";

// ---------------------------------------------------------------------------
// 회원 탈퇴(2026-09-25 세션) 보조 로직 — auth.ts의 user.deleteUser 훅이 씁니다.
// Google Play는 계정 생성이 가능한 앱에 앱 안의 삭제 경로를 요구해서 추가.
//
// DB 쪽 삭제 자체는 Prisma 스키마의 onDelete: Cascade가 처리해요(Session,
// Account, Watchlist, PushToken 및 그에 딸린 DisclosureDelivery). 여기서
// 따로 챙기는 건 두 가지:
//  1) 지우면 안 되는 계정 막기 (데모, 관리자)
//  2) 이 유저가 담아뒀던 종목 중 다른 아무도 안 담고 있는 종목의 실시간
//     구독 해제 — 구독은 전체 유저가 공유하는 자원이라(api/watchlist/[ticker]
//     DELETE 참고) 유저 row가 통째로 지워져도 같은 정리가 필요해요.
// ---------------------------------------------------------------------------

const REALTIME_SERVER_URL = process.env.REALTIME_SERVER_URL ?? "http://localhost:8081";

// beforeDelete에서 계산한 "정리 대상 종목"을 같은 요청 안의 afterDelete로
// 넘기는 용도(둘 다 한 요청 안에서 순서대로 실행됨).
const orphanedTickersByUser = new Map<string, string[]>();

// 탈퇴가 막힌 계정이면 사유 문구를, 아니면 null. 서버 검증(beforeAccountDelete)과
// 화면(마이페이지 링크 숨김, 탈퇴 페이지 안내)이 같은 기준·같은 문구를 쓰게 한곳에
// 둡니다 — 화면은 폼을 다 채우게 한 뒤에야 거부하지 않도록 미리 막아요.
//  - 데모: 비밀번호가 화면 코드에 그대로 있어서 누구나 로그인할 수 있어요. 방문자
//    한 명이 지워버리면 데모 버튼이 영영 망가짐.
//  - 관리자: 실수로 지우면 관리 화면 접근이 사라져서 앱에서는 막고, 필요하면 DB에서
//    직접 처리합니다.
export function accountDeletionBlockReason(user: { email: string; isAdmin?: boolean }): string | null {
  if (user.email === DEMO_EMAIL) return "데모 계정은 탈퇴할 수 없어요.";
  if (user.isAdmin) return "관리자 계정은 앱에서 탈퇴할 수 없어요.";
  return null;
}

export async function beforeAccountDelete(user: { id: string; email: string; isAdmin?: boolean }) {
  const blockReason = accountDeletionBlockReason(user);
  if (blockReason) {
    throw new APIError("FORBIDDEN", { message: blockReason });
  }

  const mine = await prisma.watchlist.findMany({ where: { userId: user.id }, select: { ticker: true } });
  const orphaned: string[] = [];
  for (const { ticker } of mine) {
    const heldByOthers = await prisma.watchlist.findFirst({
      where: { ticker, userId: { not: user.id } },
      select: { id: true },
    });
    if (!heldByOthers) orphaned.push(ticker);
  }
  orphanedTickersByUser.set(user.id, orphaned);
}

export async function afterAccountDelete(user: { id: string }) {
  const tickers = orphanedTickersByUser.get(user.id) ?? [];
  orphanedTickersByUser.delete(user.id);
  for (const ticker of tickers) {
    try {
      await fetch(`${REALTIME_SERVER_URL}/watchlist/${ticker}`, { method: "DELETE" });
    } catch {
      // 실시간 서버 연결 실패는 조용히 무시 — 계정 삭제 자체는 이미 끝났고,
      // 서버가 재시작되면 DB에서 distinct ticker를 다시 읽어서 정리됩니다.
    }
  }
}
