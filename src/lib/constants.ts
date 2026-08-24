// 프로젝트 전반에서 여러 파일이 같이 참조하는 공통 상수 모음입니다. 숫자 하나
// 바꾸면 관련된 API/훅/화면 문구가 전부 같이 바뀌도록, 매직 넘버를 여기저기
// 흩어놓지 않고 한 곳에 모아둡니다.

// 종목 목록 페이지네이션에서 "한 번에 몇 개씩" 가져올지 (react-query
// useInfiniteQuery + /api/universe/paged 양쪽이 이 값을 같이 씀).
export const UNIVERSE_PAGE_SIZE = 50;

// 정렬 기준 필드. 별도로 아무것도 선택 안 하면(= null) "기본 순서"(capEok
// 내림차순, 배치가 원래 채워넣는 순서)를 씁니다.
export type SortField = "screener" | "name" | "price" | "chg" | "cap" | "recommendation";
export type SortDirection = "asc" | "desc";

// 필드를 처음 선택했을 때(=1번 클릭) 적용되는 "자연스러운" 방향. 이름은
// 가나다 오름차순이 자연스럽고, 나머지(스크리너/주가/상승률)는 "많은/높은
// 순"인 내림차순이 자연스러워서 이렇게 정함. 버튼을 클릭할 때마다
// 없음 → 자연방향 → 반대방향 → 없음, 이렇게 3단 토글로 순환합니다.
export const UNIVERSE_SORT_FIELDS: {
  value: SortField;
  label: string;
  naturalDirection: SortDirection;
}[] = [
  { value: "screener", label: "스크리너", naturalDirection: "desc" },
  { value: "name", label: "이름", naturalDirection: "asc" },
  { value: "price", label: "주가", naturalDirection: "desc" },
  { value: "chg", label: "상승률", naturalDirection: "desc" },
  { value: "cap", label: "시가총액", naturalDirection: "desc" },
  { value: "recommendation", label: "등급", naturalDirection: "desc" },
];

// 화면 너비대별 폰트 크기 "토큰". Tailwind 브레이크포인트 클래스 문자열을
// 화면마다 따로 적어두면 나중에 값 하나 바꿀 때 여러 파일을 뒤져야 해서,
// 용도별로 이름 붙여 여기 모아둡니다(2026-08-23 세션, 자산 화면 큰 금액
// 숫자가 좁은 화면에서 줄바꿈되던 피드백에서 시작). "기종별"이라고 부르긴
// 하지만 실제로는 기기 모델이 아니라 CSS 너비(sm=640px 이상/미만)로
// 나뉩니다 — 웹에서 "이 기기가 갤럭시 S26인지"를 직접 알아낼 방법은 없고,
// 화면 너비가 사실상 그 역할을 대신합니다.
export const RESPONSIVE_TEXT = {
  // 자산 화면의 총 평가액/손익처럼 자릿수 많은 금액. 좁은 화면(기본,
  // <640px)에선 한 단계 작게, sm 이상 넓은 화면에선 원래 크기(text-xl)로.
  metricValue: "text-base sm:text-lg lg:text-xl",
} as const;

// 관심종목에 담을 수 있는 최대 개수. stock-advisor-server(Spring)의
// KisWebSocketClient.MAX_SUBSCRIPTIONS(KIS 웹소켓 세션당 구독 한도)와 같은
// 값이어야 의미가 있는데, 두 프로젝트가 언어가 달라서(TS/Java) 파일까지
// 공유하진 못하고 값만 맞춰뒀어요. 바꿀 땐 두 군데 다 같이 바꿔야 합니다.
export const WATCHLIST_LIMIT = 40;
