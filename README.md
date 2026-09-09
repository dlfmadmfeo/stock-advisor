# 주식 어드바이저

국내 주식의 시세와 재무 정보, 기술적 지표를 조회하는 웹 애플리케이션입니다.
조건별 종목 검색과 관심종목 관리, DART 공시 푸시 알림을 지원합니다.

- **웹**: [서비스 바로가기](https://stock-advisor2.vercel.app)
- **Android**: [APK 다운로드](https://github.com/dlfmadmfeo/stock-advisor/releases/tag/app-v1.0.0) (Flutter WebView 앱)

> 이 프로젝트는 투자 자문업으로 등록된 서비스가 아니며, 매수·매도를
> 추천하지 않습니다. 공개된 지표를 기계적으로 계산해서 보여줄 뿐이고,
> 최종 투자 판단은 전적으로 이용자 본인의 몫입니다.

## 주요 기능

### 스크리너

5일 이동평균이 20일 이동평균보다 높은지, 거래량과 52주 고저가, RSI가
설정된 조건을 충족하는지 확인합니다. 조건 충족 수와 업종 평균 대비
PER·PBR을 바탕으로 완전충족/조건충족/보류/주의 등급을 표시합니다.

### 종목 상세

- 재무 정보 요약 (매출·영업이익·순이익 추이)
- 주가 라인차트, 거래량 차트, MACD 지표
- MACD 히스토그램이 음수(하락 모멘텀)지만 최근 며칠 연속 0에 가까워지는
  "반등 조짐" 종목 감지
- 업종 내 비교, 투자자별(외국인/기관/개인) 순매수 동향
- 관심종목 등록/해제

### 공시 알림

관심종목에 전자공시(DART)가 새로 등록되면 휴대폰 푸시 알림으로 알려줍니다.
GitHub Actions에 평일 09:00~15:50(KST), 10분 간격으로 조회하도록
설정했습니다. 실제 실행 시각은 스케줄러 상황에 따라 지연될 수 있습니다.
알림 탭에서 수신 여부를 변경하거나 테스트 알림을 보낼 수 있습니다.

### 인증

이메일과 비밀번호로 가입하고 로그인합니다. 미리 등록된 데모 계정으로
로그인해 서비스를 둘러볼 수도 있습니다. 유니버스 새로고침은 관리자만
실행할 수 있습니다.

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 프레임워크 | Next.js 16 (App Router), React 19, TypeScript |
| 스타일 | Tailwind CSS v4 |
| 데이터 | Prisma + MySQL |
| 인증 | better-auth |
| 상태/데이터 페칭 | TanStack Query, Zustand |
| 외부 API | 한국투자증권(KIS) Open API, 전자공시시스템(DART) Open API |
| 푸시 알림 | Firebase Cloud Messaging (firebase-admin) |
| 배포 | Vercel, GitHub Actions(공시 폴링 스케줄러) |

## 구현 내용

- 종목 유니버스(시가총액 상위 200종목)와 스크리너 지표는 배치 작업이
  KIS API를 호출해 계산한 뒤 MySQL에 저장하고, 화면은 이 스냅샷을 페이지
  단위로 조회합니다.
- 관심종목 실시간 시세는 별도의 Spring 백엔드(`stock-advisor-server`)가
  KIS 웹소켓을 구독해서 처리하고, 이 저장소는 그 결과를 병합해서
  보여주는 구조입니다.
- Android 앱은 별도 Flutter 프로젝트에서 관리합니다. 웹 화면을 WebView로
  표시하고, FCM과 로컬 알림으로 포그라운드/백그라운드 알림을 처리합니다.
- 관심종목 변경은 TanStack Query 캐시에 먼저 반영하고, 요청이 실패하면
  해당 종목의 상태를 되돌립니다. 여러 종목을 변경할 때 서로의 결과를
  덮어쓰지 않도록 종목별로 캐시를 갱신합니다.
- 공시 조회는 GitHub Actions가 서버 API를 호출하는 방식입니다.
  공시 내용과 기기별 발송 상태를 DB에 저장합니다. 일시적인 발송 실패는
  다음 실행에서 재시도하며, FCM 접수에 성공한 기기는 재시도 대상에서 제외합니다.

## 개발 시작하기

MySQL 데이터베이스를 준비하고 아래 환경 변수를 설정한 뒤 실행합니다.
Next.js는 `.env.local`을 사용하고, Prisma CLI를 위해 `.env`에도 동일한
`DATABASE_URL`을 설정해야 합니다.

```bash
npm install
npx prisma generate
```

새 개발용 DB에 테이블을 생성합니다.

```bash
npm run db:push
```

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인할 수 있습니다.
데모 로그인은 해당 계정이 DB에 등록되어 있어야 동작합니다.

### 테스트

`npm test`로 종목 갱신, 화면 데이터 병합, 공시 알림 재시도 테스트를 실행합니다.
DB와 외부 API는 테스트 대역을 사용합니다.

### 기존 DB에 알림 재시도 적용

이번 변경은 `DisclosureNotification`, `DisclosureDelivery` 테이블을 추가합니다.
기존 DB에는 아래 SQL을 한 번 적용한 뒤 새 코드를 배포합니다.
신규 DB를 `npm run db:push`로 생성했다면 별도로 실행하지 않습니다.

```bash
npx prisma db execute --schema prisma/schema.prisma --file prisma/add-disclosure-delivery.sql
npx prisma generate
```

기존 완료 기록은 유지합니다. 이전 코드에서 완료로 기록한 실패 건은 자동 복원하지
않습니다. FCM 접수 직후 DB 기록 전에 프로세스가 종료되면 재시도 시 중복 알림이
발생할 수 있습니다. FCM 접수 성공은 기기의 실제 수신을 보장하지 않습니다.

## 환경 변수

`.env.local`에 아래 변수들을 설정합니다. 종목 목록은 DB가 비어 있거나
조회에 실패하면 샘플 데이터를 표시합니다. 재무 정보와 차트, 뉴스, 공시
알림은 각각의 외부 API 설정이 필요하며, 샘플로 대체되지 않습니다.

### 필수

| 변수 | 용도 |
| --- | --- |
| `DATABASE_URL` | Prisma가 접속할 MySQL 연결 문자열 |
| `BETTER_AUTH_SECRET` | better-auth 세션/쿠키 암호화 키 |
| `BETTER_AUTH_URL` | 인증에 사용할 서비스 주소. 로컬은 `http://localhost:3000`, 배포 시 실제 서비스 도메인 |

### 한국투자증권(KIS) 연동

| 변수 | 용도 |
| --- | --- |
| `KIS_APP_KEY` / `KIS_APP_SECRET` | KIS Open API 앱 키/시크릿 |
| `KIS_ENV` | `real`(실전) 또는 `virtual`(모의투자) |

### DART 공시 알림

| 변수 | 용도 |
| --- | --- |
| `DART_API_KEY` | 전자공시시스템(DART) Open API 키 |
| `CRON_SECRET` | `/api/cron/dart-poll` 인증 토큰. 배포 환경과 GitHub Actions Secrets에 같은 값으로 등록 |
| `FIREBASE_SERVICE_ACCOUNT` | FCM 푸시 발송용 Firebase 서비스 계정 JSON을 한 줄 문자열로 |

### 뉴스 카드 (네이버 클라우드 플랫폼)

| 변수 | 용도 |
| --- | --- |
| `NCP_APIGW_API_KEY_ID` / `NCP_APIGW_API_KEY` | NCP API Gateway 뉴스 검색 API 키 (console.ncloud.com → API Gateway → API HUB → "검색-뉴스") |

### 실시간 시세 백엔드 연동

| 변수 | 용도 |
| --- | --- |
| `REALTIME_SERVER_URL` | 서버가 관심종목 구독/해제를 요청할 Spring 백엔드 주소 (기본값 `http://localhost:8081`) |
| `NEXT_PUBLIC_REALTIME_WS_URL` | 브라우저에서 연결할 시세 웹소켓 주소. 미설정 시 `ws://현재호스트:8081/ws/prices` 사용. HTTPS 배포에서는 접근 가능한 `wss://` 주소 지정 |
