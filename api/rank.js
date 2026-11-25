// Vercel 서버리스 함수: /api/rank?date=20261125
// 그날 64개 지역의 일출·일몰 시각을 모두 돌려줍니다. (순위 계산은 화면에서)
// 150ms 간격으로 하나씩 부르고, 결과는 30일 동안 캐시합니다.
const { LOCATIONS, ApiError, todayKST, send, fetchDaySpaced, yearRange } = require('./_kasi');

const THIRTY_DAYS = 30 * 24 * 60 * 60; // 초
const rankCache = new Map(); // 'YYYYMMDD' → { body, expires }

module.exports = async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const date = url.searchParams.get('date') || todayKST();

  const { from, to } = yearRange();
  const y = Number(date.slice(0, 4));
  if (!/^\d{8}$/.test(date) || y < from || y > to) {
    return send(res, 400, { error: `조회할 수 있는 날짜는 ${from}년 1월 1일부터 ${to}년 12월 31일까지입니다.` });
  }

  const hit = rankCache.get(date);
  if (hit && hit.expires > Date.now()) return send(res, 200, hit.body, THIRTY_DAYS);

  const items = [];
  try {
    for (const location of LOCATIONS) {
      const d = await fetchDaySpaced(date, location, THIRTY_DAYS * 1000);
      items.push({ location, sunrise: d.sunrise, sunset: d.sunset });
    }
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: '서버에서 알 수 없는 오류가 발생했습니다.' });
  }

  const body = { date, items };
  rankCache.set(date, { body, expires: Date.now() + THIRTY_DAYS * 1000 });
  return send(res, 200, body, THIRTY_DAYS);
};
