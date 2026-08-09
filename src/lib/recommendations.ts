// ---------------------------------------------------------------------------
// 이 파일은 더 이상 사용되지 않습니다.
//
// 기존에는 종목별 "score"(점수)와 "allocationPercent"(배분 비율), "thesis"(투자
// 논거) 문구를 자신있게 계산해서 보여주는 방식이었는데, 이 값들은 실제 재무데이터나
// 백테스트가 아니라 하드코딩된 예시였습니다. 실제 투자 판단에 쓰기엔 오해의 소지가
// 있어서, 공개 지표(이동평균/거래량/52주 고저/RSI)를 그대로 노출하는 투명한 규칙
// 기반 스크리너로 교체했습니다.
//
// 새 로직은 다음을 참고하세요.
//   - 종목 데이터: src/lib/stocks.ts
//   - 스크리너 규칙: src/lib/screener.ts
//   - 실시간 시세 병합: src/lib/live-stock.ts
// ---------------------------------------------------------------------------

export { STOCKS as ideas, SECTORS as sectors, getStock, formatKRW } from "./stocks";
export { screenerChecks, screenerScore, passesScreener } from "./screener";
