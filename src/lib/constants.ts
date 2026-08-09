// 프로젝트 전반에서 여러 파일이 같이 참조하는 공통 상수 모음입니다. 숫자 하나
// 바꾸면 관련된 API/훅/화면 문구가 전부 같이 바뀌도록, 매직 넘버를 여기저기
// 흩어놓지 않고 한 곳에 모아둡니다.

// 종목 목록 페이지네이션에서 "한 번에 몇 개씩" 가져올지 (react-query
// useInfiniteQuery + /api/universe/paged 양쪽이 이 값을 같이 씀).
export const UNIVERSE_PAGE_SIZE = 50;

// 정렬 기준 필드. 별도로 아무것도 선택 안 하면(= null) "기본 순서"(capEok
// 내림차순, 배치가 원래 채워넣는 순서)를 씁니다.
export type SortField = "screener" | "name" | "price" | "chg";
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
];

// 관심종목에 담을 수 있는 최대 개수. stock-advisor-server(Spring)의
// KisWebSocketClient.MAX_SUBSCRIPTIONS(KIS 웹소켓 세션당 구독 한도)와 같은
// 값이어야 의미가 있는데, 두 프로젝트가 언어가 달라서(TS/Java) 파일까지
// 공유하진 못하고 값만 맞춰뒀어요. 바꿀 땐 두 군데 다 같이 바꿔야 합니다.
export const WATCHLIST_LIMIT = 40;
