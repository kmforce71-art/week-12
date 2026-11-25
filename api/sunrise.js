// Vercel 서버리스 함수: /api/sunrise?location=서울&date=20261125
// 인증키는 환경 변수 DATA_GO_KR_KEY 에서만 읽습니다. (코드·브라우저에 노출되지 않음)

const ENDPOINT =
  'https://apis.data.go.kr/B090041/openapi/service/RiseSetInfoService/getAreaRiseSetInfo';

const LOCATIONS = ['서울', '강릉', '속초', '포항', '울산', '부산', '제주', '독도', '여수', '대전'];

const ONE_DAY = 24 * 60 * 60; // 초
const memoryCache = new Map(); // 같은 인스턴스 안에서의 하루 캐시

// 한국 시간(KST) 기준 오늘 날짜 → 'YYYYMMDD'
function todayKST() {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10).replace(/-/g, '');
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

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const location = url.searchParams.get('location') || '서울';
  const date = url.searchParams.get('date') || todayKST();

  if (!LOCATIONS.includes(location)) {
    return send(res, 400, { error: '지원하지 않는 지역입니다.' });
  }
  if (!/^\d{8}$/.test(date)) {
    return send(res, 400, { error: '날짜 형식이 올바르지 않습니다. (예: 20261125)' });
  }

  const key = process.env.DATA_GO_KR_KEY;
  if (!key) {
    return send(res, 500, {
      error: '서버에 인증키(DATA_GO_KR_KEY)가 설정되어 있지 않습니다.',
    });
  }

  const cacheKey = `${date}|${location}`;
  const hit = memoryCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) {
    return send(res, 200, hit.data, ONE_DAY);
  }

  // 포털에서 받은 '인코딩' 키(%가 들어 있음)는 그대로, '디코딩' 키는 인코딩해서 사용
  const serviceKey = key.includes('%') ? key : encodeURIComponent(key);
  const apiUrl =
    `${ENDPOINT}?serviceKey=${serviceKey}` +
    `&locdate=${date}&location=${encodeURIComponent(location)}`;

  let xml;
  try {
    const r = await fetch(apiUrl, { signal: AbortSignal.timeout(8000) });
    xml = await r.text();
    // 인증키 오류는 403 + XML(<returnAuthMsg>)로 오므로 아래에서 따로 안내
    if (!r.ok && !xml.includes('returnAuthMsg')) throw new Error(`HTTP ${r.status}`);
  } catch (e) {
    console.error('upstream fetch failed:', e && (e.cause || e.message || e));
    return send(res, 502, { error: '천문연구원 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }

  // 인증키 오류 등은 <returnAuthMsg> 로 옵니다
  const authMsg = pick(xml, 'errMsg') + ' ' + pick(xml, 'returnAuthMsg');
  if (authMsg.trim()) {
    console.error('data.go.kr auth error:', authMsg.trim());
    const msg = /SERVICE_KEY_IS_NOT_REGISTERED|등록되지 않은/.test(authMsg)
      ? '인증키가 등록되지 않았거나 아직 활성화되지 않았습니다. (발급 직후라면 1~2시간 뒤 다시 시도해 주세요.)'
      : /LIMITED_NUMBER_OF_SERVICE_REQUESTS|EXCEEDS/.test(authMsg)
      ? '오늘 사용할 수 있는 요청 횟수를 모두 썼습니다.'
      : `공공데이터포털 오류: ${authMsg.trim()}`;
    return send(res, 502, { error: msg });
  }

  const resultCode = pick(xml, 'resultCode');
  if (resultCode && resultCode !== '00') {
    return send(res, 502, { error: `API 오류: ${pick(xml, 'resultMsg') || resultCode}` });
  }

  const item = pick(xml, 'item');
  if (!item) {
    return send(res, 404, { error: '해당 날짜·지역의 자료가 없습니다.' });
  }

  const data = {
    location: pick(item, 'location') || location,
    date: pick(item, 'locdate') || date,
    sunrise: toTime(pick(item, 'sunrise')),
    sunset: toTime(pick(item, 'sunset')),
    civilm: toTime(pick(item, 'civilm')),
    civile: toTime(pick(item, 'civile')),
  };

  if (!data.sunrise || !data.sunset) {
    return send(res, 502, { error: '응답에서 일출·일몰 시각을 읽지 못했습니다.' });
  }

  memoryCache.set(cacheKey, { data, expires: Date.now() + ONE_DAY * 1000 });
  return send(res, 200, data, ONE_DAY);
};
