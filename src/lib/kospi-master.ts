import AdmZip from "adm-zip";
import iconv from "iconv-lite";

// ---------------------------------------------------------------------------
// KIS 종목마스터 파일(kospi_code.mst) 다운로드 + 파싱.
//
// 순위분석 API(FHPST01740000)는 실측 결과 상위 30건까지만 줘서(kis.ts의
// fetchMarketCapRanking 참고), 진짜 200종목을 채우려면 이 방법이 필요합니다.
// KIS가 매일 갱신해서 배포하는 코스피 전종목 마스터 파일에는 종목코드/한글명뿐
// 아니라 시가총액까지 통째로 들어있어서, 이걸 받아서 시가총액 내림차순으로
// 정렬하면 별도 순위 API 없이 상위 N개를 뽑을 수 있습니다.
//
// 파싱 로직은 KIS 공식 예제(open-trading-api/stocks_info/kis_kospi_code_mst.py)
// 의 필드 폭 정의를 그대로 TypeScript로 옮긴 겁니다. 이 세션에서는 네트워크가
// 막혀 있어서 실제로 다운로드/파싱을 검증하지 못했어요 — 특히 시가총액 필드의
// 단위(억원으로 가정)와 인코딩(cp949로 가정)은 로컬에서 실행해보고 값이
// 이상하면 알려주세요.
// ---------------------------------------------------------------------------

const MASTER_URL = "https://new.real.download.dws.co.kr/common/master/kospi_code.mst.zip";

export type MasterRow = {
  ticker: string; // 단축코드 (6자리)
  name: string; // 한글명
  isKospi: boolean; // "KOSPI" 플래그
  kospi200Sector: string; // "KOSPI200섹터업종" 코드 (미편입은 보통 "0")
  capEok: number; // 시가총액 (억원 단위로 추정)
};

// part2(줄 끝 228자, 고정폭) 컬럼 폭/이름 정의. KIS 공식 예제의 field_specs /
// part2_columns를 그대로 옮겼습니다 — 순서가 곧 컬럼 의미라 손대면 안 됩니다.
const FIELD_WIDTHS = [
  2, 1, 4, 4, 4,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 1, 1, 1, 1,
  1, 9, 5, 5, 1,
  1, 1, 2, 1, 1,
  1, 2, 2, 2, 3,
  1, 3, 12, 12, 8,
  15, 21, 2, 7, 1,
  1, 1, 1, 1, 9,
  9, 9, 5, 9, 8,
  9, 3, 1, 1, 1,
];

const FIELD_NAMES = [
  "그룹코드", "시가총액규모", "지수업종대분류", "지수업종중분류", "지수업종소분류",
  "제조업", "저유동성", "지배구조지수종목", "KOSPI200섹터업종", "KOSPI100",
  "KOSPI50", "KRX", "ETP", "ELW발행", "KRX100",
  "KRX자동차", "KRX반도체", "KRX바이오", "KRX은행", "SPAC",
  "KRX에너지화학", "KRX철강", "단기과열", "KRX미디어통신", "KRX건설",
  "Non1", "KRX증권", "KRX선박", "KRX섹터_보험", "KRX섹터_운송",
  "SRI", "기준가", "매매수량단위", "시간외수량단위", "거래정지",
  "정리매매", "관리종목", "시장경고", "경고예고", "불성실공시",
  "우회상장", "락구분", "액면변경", "증자구분", "증거금비율",
  "신용가능", "신용기간", "전일거래량", "액면가", "상장일자",
  "상장주수", "자본금", "결산월", "공모가", "우선주",
  "공매도과열", "이상급등", "KRX300", "KOSPI", "매출액",
  "영업이익", "경상이익", "당기순이익", "ROE", "기준년월",
  "시가총액", "그룹사코드", "회사신용한도초과", "담보대출가능", "대주가능",
];

function parseFixedWidth(chunk: string): Record<string, string> {
  const result: Record<string, string> = {};
  let pos = 0;
  for (let i = 0; i < FIELD_WIDTHS.length; i++) {
    const width = FIELD_WIDTHS[i];
    result[FIELD_NAMES[i]] = chunk.slice(pos, pos + width).trim();
    pos += width;
  }
  return result;
}

export async function fetchKospiMaster(): Promise<MasterRow[]> {
  const res = await fetch(MASTER_URL, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`종목마스터 파일 다운로드 실패 (${res.status})`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  const zip = new AdmZip(buf);
  const entries = zip.getEntries();
  const mstEntry = entries.find((e) => e.entryName.toLowerCase().endsWith(".mst"));
  if (!mstEntry) {
    throw new Error("zip 안에서 .mst 파일을 찾지 못했어요 (압축 파일 구조가 바뀌었을 수 있어요).");
  }

  const raw = mstEntry.getData(); // cp949(EUC-KR 확장) 인코딩 원문
  const text = iconv.decode(raw, "cp949");
  const lines = text.split(/\r?\n/).filter((l) => l.length > 200);

  const rows: MasterRow[] = [];
  for (const line of lines) {
    if (line.length < 228) continue;
    const part2 = line.slice(-228);
    const part1 = line.slice(0, line.length - 228);
    const ticker = part1.slice(0, 9).trim();
    const name = part1.slice(21).trim();
    if (!ticker || !name) continue;

    const fields = parseFixedWidth(part2);
    const capRaw = Number(fields["시가총액"]);

    rows.push({
      ticker,
      name,
      isKospi: fields["KOSPI"] === "1" || fields["KOSPI"].toUpperCase() === "Y",
      kospi200Sector: fields["KOSPI200섹터업종"],
      capEok: Number.isFinite(capRaw) ? capRaw : 0,
    });
  }

  return rows;
}
