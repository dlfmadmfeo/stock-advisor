// ---------------------------------------------------------------------------
// 스크리너 규칙의 임계값을 전부 여기 모아둡니다. screener.ts가 실제 판정
// 로직에서 이 값들을 씁니다 — 나중에 기준을 바꾸거나 규칙을 추가/삭제할 때
// 여기만 고치면 됩니다 (screener.ts, refresh-universe.ts, /api/universe/paged,
// 화면의 "N/4 통과" 문구까지 전부 이 파일의 값을 따라갑니다).
//
// ⚠️ stock-advisor-server(Spring)의 Screener.java는 언어가 달라서 이 파일을
// 직접 공유하진 못합니다. 여기 값을 바꾸면 Screener.java의 같은 상수도 반드시
// 같이 바꿔야 프론트(배치)와 백엔드(실시간)가 같은 기준으로 스크리너를
// 계산합니다. (이 프로젝트 초기에 두 값이 이미 한 번 어긋난 적이 있었어요.)
// ---------------------------------------------------------------------------

export const SCREENER_THRESHOLDS = {
  // 거래량이 최근 20일 평균 대비 몇 배 이상이어야 통과인지
  volumeRatioMin: 1.0,
  // 52주 저점 대비 이 비율 이상 반등했으면 통과 (예: 1.1 = 저점 대비 +10%)
  reboundFromLowRatio: 1.1,
  // 52주 고점 대비 이 비율 이내면 통과 (예: 0.9 = 고점 대비 -10% 이내)
  reboundFromHighRatio: 0.9,
  rsiMin: 30,
  rsiMax: 70,
  // PER이 같은 업종 평균 대비 이 비율을 넘으면 "고평가", 이 비율 아래면
  // "저평가"로 취급 (예: 1.2 = 업종 평균보다 20% 이상 비쌈, 0.8 = 20% 이상 쌈).
  // 업종 평균은 지금 로드된 유니버스(최대 상위 200종목) 안에서 같은 업종
  // 종목들의 PER을 평균낸 값이라, 유니버스가 작을수록(예시 10종목) 평균이
  // 튈 수 있어요 — 참고용 상대 비교로만 쓰세요.
  perOvervaluedRatio: 1.2,
  perUndervaluedRatio: 0.8,
  // PBR도 같은 방식(업종 평균 대비 비율)으로 비교합니다.
  pbrOvervaluedRatio: 1.2,
  pbrUndervaluedRatio: 0.8,
} as const;

// 전체 규칙 개수 (화면의 "N/4 통과" 표시에 쓰임 — 규칙을 추가/삭제하면 이 값도
// 같이 바뀌어야 함. screenerChecks()가 실제로 반환하는 규칙 배열의 길이와
// 항상 일치해야 합니다.)
export const SCREENER_TOTAL_RULES = 4;

// 몇 개 이상 통과해야 "스크리너 통과"로 칠지
export const SCREENER_PASS_THRESHOLD = 3;
