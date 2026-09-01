import type { Metadata } from "next";

// Google Play Console 공개 테스트 등록에 필요한 개인정보처리방침 페이지.
// 로그인 여부와 무관하게 누구나 봐야 하므로 AppShell(하단 네비게이션 등)
// 없이 독립된 정적 페이지로 둡니다.
export const metadata: Metadata = {
  title: "개인정보처리방침 | 주식 어드바이저",
};

const CONTACT_EMAIL = "dlfmadmfeo@gmail.com";
const LAST_UPDATED = "2026-09-01";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-12 text-[#191f28] lg:px-8">
      <h1 className="text-2xl font-extrabold tracking-tight">
        개인정보처리방침
      </h1>
      <p className="mt-2 text-sm font-medium text-[#8b95a1]">
        시행일: {LAST_UPDATED}
      </p>

      <p className="mt-6 text-sm leading-6 text-[#4e5968]">
        주식 어드바이저(이하 &quot;서비스&quot;)는 이용자의 개인정보를
        소중히 다루며, 아래와 같이 수집·이용·보관합니다. 이 서비스는 개인이
        운영하는 프로젝트로, 별도의 유사투자자문업 등록 없이 공개된 시장
        지표를 기계적으로 계산·표시하는 용도로만 쓰입니다.
      </p>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#4e5968]">
          <li>이메일 주소, 비밀번호(암호화되어 저장되며 서비스 운영자도 원문을 볼 수 없어요)</li>
          <li>관심종목으로 등록한 종목 코드</li>
          <li>공시 알림을 받기 위한 기기 푸시 토큰(FCM 토큰) 및 알림 수신 여부 설정</li>
        </ul>
        <p className="text-sm leading-6 text-[#4e5968]">
          이름, 전화번호, 실제 증권 계좌 정보는 수집하지 않아요. 화면에
          보이는 종목·시세·재무 데이터는 한국투자증권 Open API·전자공시시스템(DART) 등
          공개된 자료를 그대로 계산해서 보여주는 것으로, 이용자 개인정보가
          아니에요.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">2. 수집 목적</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-6 text-[#4e5968]">
          <li>회원 식별 및 로그인 유지</li>
          <li>관심종목 목록 저장 및 화면에 표시</li>
          <li>관심종목에 새 공시가 등록되었을 때 휴대폰 푸시 알림 발송</li>
        </ul>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">3. 제3자 제공 및 처리 위탁</h2>
        <p className="text-sm leading-6 text-[#4e5968]">
          수집한 개인정보를 광고·마케팅 목적으로 제3자에게 판매하거나
          제공하지 않아요. 다만 알림 발송을 위해 Google Firebase Cloud
          Messaging(FCM)에 푸시 토큰을 전달하며, 이는 알림 인프라로만
          쓰입니다. 서비스는 별도의 광고 SDK나 이용자 행동을 추적하는
          분석 도구를 사용하지 않아요.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">4. 보관 기간 및 삭제</h2>
        <p className="text-sm leading-6 text-[#4e5968]">
          회원 탈퇴 기능은 아직 앱 내에 별도로 제공되지 않아요. 계정 및
          연관 데이터(관심종목, 푸시 토큰 등)의 삭제를 원하시면 아래
          이메일로 요청해주시면 확인 후 지체 없이 삭제해드려요.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">5. 이용자 권리</h2>
        <p className="text-sm leading-6 text-[#4e5968]">
          이용자는 언제든 알림 화면에서 공시 알림 수신 여부를 직접 켜고 끌 수
          있고, 아래 연락처로 본인 정보의 열람·정정·삭제를 요청할 수 있어요.
        </p>
      </section>

      <section className="mt-8 space-y-2">
        <h2 className="text-base font-bold">6. 문의처</h2>
        <p className="text-sm leading-6 text-[#4e5968]">
          개인정보 관련 문의: {" "}
          <a
            className="font-semibold text-[#3182f6] underline"
            href={`mailto:${CONTACT_EMAIL}`}
          >
            {CONTACT_EMAIL}
          </a>
        </p>
      </section>

      <p className="mt-10 border-t border-[#e5e8eb] pt-4 text-xs leading-5 text-[#8b95a1]">
        이 방침은 서비스 변경에 따라 업데이트될 수 있으며, 변경 시 이 페이지에
        시행일을 갱신해 공지해요.
      </p>
    </main>
  );
}
