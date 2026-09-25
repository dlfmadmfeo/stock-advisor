import type { Metadata } from "next";
import Link from "next/link";

// 계정/데이터 삭제 안내 — Google Play 데이터 보안 양식에 넣는 공개 웹 링크
// (2026-09-25 세션). 앱을 이미 지웠거나 로그인할 수 없는 사람도 볼 수 있어야
// 해서 로그인 여부와 무관한 독립 정적 페이지로 둡니다(privacy 페이지와 동일).
export const metadata: Metadata = {
  title: "계정 및 데이터 삭제 안내 | 주식 어드바이저",
};

const CONTACT_EMAIL = "dlfmadmfeo@gmail.com";

export default function AccountDeletionPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[#191f28] lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight">계정 및 데이터 삭제 안내</h1>
      <p className="mt-2 text-sm font-medium text-[#8b95a1]">주식 어드바이저 (개발자: 개인)</p>

      <p className="mt-6 text-sm leading-6 text-[#4e5968]">
        주식 어드바이저 계정과 계정에 연결된 데이터를 언제든 삭제할 수 있어요. 아래 두 가지
        방법 중 편한 쪽을 쓰시면 돼요.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">방법 1. 앱 또는 웹에서 직접 탈퇴</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-[#4e5968]">
          <li>주식 어드바이저 앱(또는 웹사이트)에 로그인해요.</li>
          <li>
            하단 &quot;홈&quot; 화면 우측 상단의 프로필 아이콘 → <b>마이페이지</b>로 들어가요.
          </li>
          <li>
            화면 맨 아래 <b>회원 탈퇴</b>를 누르고, 비밀번호를 입력한 뒤 탈퇴해요.
          </li>
        </ol>
        <p className="text-sm leading-6 text-[#4e5968]">
          탈퇴하면 바로 삭제돼요. 비밀번호를 잊었다면{" "}
          <Link className="font-semibold text-[#3182f6] underline" href="/forgot-password">
            비밀번호 찾기
          </Link>
          로 재설정한 뒤 탈퇴할 수 있어요.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">방법 2. 이메일로 삭제 요청</h2>
        <p className="text-sm leading-6 text-[#4e5968]">
          앱을 이미 지웠거나 로그인할 수 없다면, 가입할 때 쓴 이메일 주소에서 아래 주소로
          &quot;계정 삭제 요청&quot;이라고 보내주세요. 본인 확인 후 지체 없이 삭제해드려요.
        </p>
        <p className="text-sm leading-6 text-[#4e5968]">
          <a className="font-semibold text-[#3182f6] underline" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">삭제되는 데이터</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#4e5968]">
          <li>계정 정보(이메일 주소, 암호화된 비밀번호)</li>
          <li>관심종목 목록</li>
          <li>공시 알림 수신 설정 및 알림용 기기 등록 정보(푸시 토큰)</li>
          <li>로그인 기록(활성 기기 목록)</li>
        </ul>
        <p className="text-sm leading-6 text-[#4e5968]">
          위 정보는 서비스 데이터베이스에서 삭제되며, 삭제 후에는 복구할 수 없어요. 이 서비스는
          그 밖에 보관하는 개인정보가 없어요. 자세한 내용은{" "}
          <Link className="font-semibold text-[#3182f6] underline" href="/privacy">
            개인정보처리방침
          </Link>
          을 확인해주세요.
        </p>
      </section>
    </main>
  );
}
