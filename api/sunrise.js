// Vercel 서버리스 함수: /api/sunrise?location=서울&date=20261125
// 하루치 일출·일몰 시각을 JSON으로 돌려줍니다. 같은 요청은 하루 동안 캐시합니다.
const { LOCATIONS, ApiError, todayKST, send, fetchDay } = require('./_kasi');

const ONE_DAY = 24 * 60 * 60; // 초

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

  try {
    const { data } = await fetchDay(date, location);
    return send(res, 200, data, ONE_DAY);
  } catch (e) {
    if (e instanceof ApiError) return send(res, e.status, { error: e.message });
    console.error(e);
    return send(res, 500, { error: '서버에서 알 수 없는 오류가 발생했습니다.' });
  }
};
