// Vercel 서버리스 함수: /api/month?location=서울&ym=202611
// 한 달치 일출·일몰 시각을 하루씩 조회해 돌려줍니다.
// 공공데이터포털은 한꺼번에 많이 부르면 잠시 막기 때문에 150ms 간격으로 하나씩 부르고,
// 결과는 30일 동안 캐시합니다.
const { LOCATIONS, ApiError, todayKST, send, fetchDay } = require('./_kasi');

const GAP_MS = 150;
const THIRTY_DAYS = 30 * 24 * 60 * 60; // 초
const monthCache = new Map(); // 'YYYYMM|지역' → { body, expires }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 같은 인스턴스에서 여러 요청이 동시에 와도 API 호출이 150ms 간격을 지키도록 줄 세우기
let queue = Promise.resolve();
let lastCall = 0;
function throttled(fn) {
  const run = queue.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await fn();
    } finally {
      lastCall = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

// 하루치 조회. 연결 실패일 때만 1초 쉬고 한 번 더 시도 (인증키 오류 등은 바로 실패)
async function getDay(date, location) {
  try {
    return (await fetchDay(date, location, THIRTY_DAYS * 1000)).data;
  } catch (e) {
    const retryable = e instanceof ApiError && e.status === 502 && /연결하지 못했습니다/.test(e.message);
    if (!retryable) throw e;
    await sleep(1000);
    return (await fetchDay(date, location, THIRTY_DAYS * 1000)).data;
  }
}

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const location = url.searchParams.get('location') || '서울';
  const ym = url.searchParams.get('ym') || todayKST().slice(0, 6);

  if (!LOCATIONS.includes(location)) {
    return send(res, 400, { error: '지원하지 않는 지역입니다.' });
  }
  const thisYear = Number(todayKST().slice(0, 4));
  const y = Number(ym.slice(0, 4)), m = Number(ym.slice(4, 6));
  if (!/^\d{6}$/.test(ym) || m < 1 || m > 12 || y < thisYear || y > thisYear + 1) {
    return send(res, 400, { error: `조회할 수 있는 달은 ${thisYear}년 1월부터 ${thisYear + 1}년 12월까지입니다.` });
  }

  const cacheKey = `${ym}|${location}`;
  const hit = monthCache.get(cacheKey);
  if (hit && hit.expires > Date.now()) return send(res, 200, hit.body, THIRTY_DAYS);

  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const days = [];
  try {
    for (let d = 1; d <= lastDay; d++) {
      const date = `${ym}${String(d).padStart(2, '0')}`;
      const data = await throttled(() => getDay(date, location));
      days.push({ date, sunrise: data.sunrise, sunset: data.sunset, civilm: data.civilm, civile: data.civile });
    }
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: '서버에서 알 수 없는 오류가 발생했습니다.' });
  }

  const body = { location, ym, days };
  monthCache.set(cacheKey, { body, expires: Date.now() + THIRTY_DAYS * 1000 });
  return send(res, 200, body, THIRTY_DAYS);
};
