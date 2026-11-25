// 내 컴퓨터에서 테스트할 때만 쓰는 작은 서버입니다. (Vercel 배포에는 쓰이지 않음)
// 실행: node dev-server.js  →  http://localhost:3000
const http = require('http');
const fs = require('fs');
const path = require('path');

// .env.local 읽어서 환경 변수로 등록
const envFile = path.join(__dirname, '.env.local');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const sunrise = require('./api/sunrise.js');
const month = require('./api/month.js');
const rank = require('./api/rank.js');
const PORT = Number(process.env.PORT) || 3000;

http
  .createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    try {
      if (pathname === '/api/sunrise') return await sunrise(req, res);
      if (pathname === '/api/month') return await month(req, res);
      if (pathname === '/api/rank') return await rank(req, res);
      if (pathname === '/' || pathname === '/index.html') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(fs.readFileSync(path.join(__dirname, 'index.html')));
      }
      res.statusCode = 404;
      res.end('Not found');
    } catch (e) {
      console.error(e);
      res.statusCode = 500;
      res.end('Server error');
    }
  })
  .listen(PORT, () => console.log(`http://localhost:${PORT}`));
