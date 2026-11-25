# 일출 · 일몰 시각

오늘(한국 시간) 우리나라 주요 지역의 **해 뜨는 시각**과 **해 지는 시각**을 보여 주는 웹페이지입니다.

🔗 **사이트:** https://week-12-amber.vercel.app

## 기능

- 지역 선택: 서울 · 강릉 · 속초 · 포항 · 울산 · 부산 · 제주 · 독도 · 여수 · 대전 (마지막으로 고른 지역 기억)
- 날짜는 한국 시간 기준 오늘로 자동 설정
- 해 뜨는 시각(`sunrise`)과 해 지는 시각(`sunset`)을 크게, 하늘이 밝아지는 시각(`civilm`)과 어두워지는 시각(`civile`)을 작게 표시
- 오류가 나면 한국어로 안내 (인증키 문제, 요청 한도 초과, 서버 연결 실패 등)

## 구조

```
Week_12/
├── index.html        # 화면 (HTML + CSS + JS)
├── api/sunrise.js    # Vercel 함수: API 호출 → XML 해석 → 필요한 값만 JSON으로 응답
├── vercel.json       # 함수 지역을 서울(icn1)로 설정
├── dev-server.js     # 내 컴퓨터 테스트용 작은 서버 (배포에는 포함되지 않음)
├── .vercelignore     # 배포에서 제외할 파일
└── .gitignore        # .env.local 등 비밀 파일 제외
```

```
브라우저 ──▶ /api/sunrise?location=서울&date=YYYYMMDD ──▶ 한국천문연구원 API
   ◀── { sunrise: "07:22", sunset: "17:16", ... } ◀── XML
```

- 인증키는 코드에 없고, 서버 함수가 환경 변수 `DATA_GO_KR_KEY`에서만 읽습니다. 브라우저에는 노출되지 않습니다.
- 같은 날짜·지역 요청은 **하루 동안 캐시**합니다 (Vercel CDN `s-maxage=86400` + 함수 메모리 캐시).

## 사용한 API

공공데이터포털 · 한국천문연구원 **출몰시각 정보** — `getAreaRiseSetInfo`

| 요청 값 | 설명 |
|---|---|
| `locdate` | 날짜 (예: `20261125`) |
| `location` | 지역 이름 (예: `서울`) |
| `serviceKey` | 공공데이터포털 인증키 |

## 내 컴퓨터에서 실행하기

1. [공공데이터포털](https://www.data.go.kr)에서 *한국천문연구원_출몰시각 정보* 활용 신청 후 인증키를 받습니다.
2. `Week_12` 폴더에 `.env.local` 파일을 만들고 키를 넣습니다. (Encoding·Decoding 키 둘 다 됩니다)
   ```
   DATA_GO_KR_KEY=여기에_인증키
   ```
3. [Node.js](https://nodejs.org)를 설치한 뒤 실행합니다.
   ```powershell
   node dev-server.js
   ```
4. 브라우저에서 http://localhost:3000 을 엽니다.

> `vercel dev`로도 실행할 수 있지만, Windows에서는 개발자 모드가 꺼져 있으면 심볼릭 링크 오류가 납니다. 그럴 땐 `dev-server.js`를 쓰세요.

## Vercel 배포

1. Vercel 프로젝트 **Settings → Environment Variables**에 `DATA_GO_KR_KEY`를 추가합니다.
2. 이 저장소가 Vercel과 연결되어 있어서 `main` 브랜치에 push하면 자동으로 다시 배포됩니다.
   (직접 배포: `vercel deploy --prod`)

> ⚠️ PowerShell에서 `키 | vercel env add ...`처럼 파이프로 키를 넣으면 끝에 보이지 않는 문자(`\r`)가 붙어 **"등록되지 않은 서비스키"** 오류가 날 수 있습니다. 대시보드에서 직접 입력하거나 `--value` 옵션을 쓰세요.

## 출처

자료: 한국천문연구원 · 공공데이터포털
