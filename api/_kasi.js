// 한국천문연구원 출몰시각 API 공통 코드 (api/sunrise.js, api/month.js 에서 사용)
// '_'로 시작하는 파일은 Vercel이 함수로 만들지 않습니다.
// 인증키는 환경 변수 DATA_GO_KR_KEY 에서만 읽습니다. (코드·브라우저에 노출되지 않음)

const ENDPOINT =
  'https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo';

// 천문연구원 API가 지원하는 64개 지역 (권역 구분은 화면에서 처리)
const LOCATIONS = (
  '서울 인천 수원 평택 ' +
  '강릉 속초 동해 대관령 태백 춘천 원주 영월 ' +
  '대전 세종 천안 청주 청주공항 충주 제천 보령 서산 추풍령 ' +
  '광주 전주 군산 정읍 부안 남원 임실 장수 목포 무안 여수 여수공항 순천 승주 고흥 장흥 완도 해남 흑산도 ' +
  '부산 대구 울산 포항 경주 영덕 울진 독도 안동 영주 춘양 상주 김천 의성 영천 밀양 진주 통영 거제 남해 거창 ' +
  '제주 서귀포'
).split(' ');

const DAY_MS = 24 * 60 * 60 * 1000;
const dayCache = new Map(); // 'YYYYMMDD|지역' → { data, expires } (같은 인스턴스 안에서만 유지)

class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// 한국 시간(KST) 기준 오늘 날짜 → 'YYYYMMDD'
function todayKST() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
}

// <tag>값</tag> 하나 꺼내기 (응답 XML이 단순해서 정규식으로 충분)
function pick(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1].trim() : '';
}

// '0722' → '07:22'
function toTime(raw) {
  const digits = (raw || '').replace(/\D/g, '');
  if (digits.length < 4) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2, 4)}`;
}

function send(res, status, body, cacheSeconds) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cacheSeconds
      ? `public, max-age=0, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`
      : 'no-store'
  );
  res.end(JSON.stringify(body));
}

function getKey() {
  const key = process.env.DATA_GO_KR_KEY;
  if (!key) throw new ApiError(500, '서버에 인증키(DATA_GO_KR_KEY)가 설정되어 있지 않습니다.');
  // 포털에서 받은 '인코딩' 키(%가 들어 있음)는 그대로, '디코딩' 키는 인코딩해서 사용
  return key.includes('%') ? key : encodeURIComponent(key);
}

// 하루치 조회. 실패하면 ApiError를 던집니다.
async function fetchDay(date, location, cacheMs = DAY_MS) {
  const cacheKey = `${date}|${location}`;
  const hit = dayCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return { data: hit.data, cached: true };

  const apiUrl =
    `${ENDPOINT}?serviceKey=${getKey()}` +
    `&locdate=${date}&location=${encodeURIComponent(location)}`;

  let xml;
  try {
    const r = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    xml = await r.text();
    // 인증키 오류는 403 + XML(<returnAuthMsg>)로 오므로 아래에서 따로 안내
    if (!r.ok && !xml.includes('returnAuthMsg')) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error('upstream fetch failed:', e && (e.cause || e.message || e));
    throw new ApiError(502, '천문연구원 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  }

  const authMsg = (pick(xml, 'errMsg') + ' ' + pick(xml, 'returnAuthMsg')).trim();
  if (authMsg) {
    console.error('data.go.kr auth error:', authMsg);
    const msg = /SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은/.test(authMsg)
      ? '인증키가 등록되지 않았거나 아직 활성화되지 않았습니다. (발급 직후라면 1~2시간 뒤 다시 시도해 주세요.)'
      : /LIMITED_NUMBER_OF_SERVICE_REQUESTS|EXCEEDS/.test(authMsg)
      ? '오늘 사용할 수 있는 요청 횟수를 모두 썼습니다.'
      : `공공데이터포털 오류: ${authMsg}`;
    throw new ApiError(502, msg);
  }

  const resultCode = pick(xml, 'resultCode');
  if (resultCode && resultCode !== '00') {
    throw new ApiError(502, `API 오류: ${pick(xml, 'resultMsg') || resultCode}`);
  }

  const item = pick(xml, 'item');
  if (!item) throw new ApiError(404, '해당 날짜·지역의 자료가 없습니다.');

  const data = {
    location: pick(item, 'location') || location,
    date: pick(item, 'locdate') || date,
    sunrise: toTime(pick(item, 'sunrise')),
    sunset: toTime(pick(item, 'sunset')),
    civilm: toTime(pick(item, 'civilm')),
    civile: toTime(pick(item, 'civile')),
  };
  if (!data.sunrise || !data.sunset) {
    throw new ApiError(502, '응답에서 일출·일몰 시각을 읽지 못했습니다.');
  }

  dayCache.set(cacheKey, { data, expires: Date.now() + cacheMs });
  return { data, cached: false };
}

module.exports = { LOCATIONS, ApiError, todayKST, send, fetchDay, DAY_MS };
