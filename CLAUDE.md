# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# 서버 디렉토리에서 실행
cd server && npm install

# 개발 모드 (nodemon 자동 재시작)
npm run dev

# 프로덕션 모드
npm start
```

앱은 `http://localhost:3020`에서 실행됩니다. 서버가 정적 파일도 서빙하므로 별도 프론트엔드 서버 불필요.

DB 초기화: `mysql -u root -p < database/schema.sql`

최초 실행 시 admin 계정이 없으면 터미널에서 초기 관리자 계정 생성 프롬프트가 표시됩니다.

## 아키텍처

### 전체 흐름
- **프론트엔드**: 바닐라 JS SPA (`index.html` + `js/` + `css/`) — 라우팅 없이 `<section id="X-page">` 요소의 `hidden` 클래스 토글로 페이지 전환
- **백엔드**: Express (`server/`) + MariaDB. `server/server.js`가 정적 파일과 API를 모두 서빙

### 프론트엔드 JS 로드 순서 (`js/`)
1. `api.js` — 전역 `api` 객체. JWT를 localStorage에 저장, 모든 API 호출 담당
2. `timer.js` — 전역 `window.timer`. `start()`/`stop()` 시 고양이 애니메이션(`catManager`)도 토글
3. `chart.js` — 전역 `window.charts`, Chart.js 래퍼
4. `app.js` — 전역 `window.appState`. 메인 앱 상태, 페이지 전환, 세션 복구(`checkActiveSession`)

### 백엔드 구조 (`server/`)
```
routes/      → auth, study, admin
controllers/ → 비즈니스 로직 (studyController의 getStats가 가장 복잡)
middleware/  → authMiddleware(JWT), adminMiddleware
config/db.js → MariaDB 커넥션 풀
```

### 통계 쿼리 복잡도
`getStats`는 세션이 날짜 경계를 걸치는 경우도 `GREATEST`/`LEAST`로 정확히 잘라서 계산합니다. SQL 결과가 0이고 JS 계산이 양수이면 JS 값을 fallback으로 사용합니다.

---

# 개발 원칙 (Development Principles)

이 문서는 이 프로젝트(`jiann-summer`)의 일관된 개발을 위한 규칙과 가이드를 담고 있습니다.

## 1. 시간 처리 원칙 (Time Handling)

서버와 클라이언트 간의 시간 불일치 문제를 방지하기 위해 다음 원칙을 반드시 준수합니다.

### A. 서버 및 데이터베이스 (Server & Database)
- **표준 시간 사용**: 모든 시간 데이터는 **ISO 8601 (UTC)** 형식을 기준으로 기록하고 전송합니다.
- **데이터베이스 기록**: MySQL/MariaDB에 시간을 기록할 때는 `UTC_TIMESTAMP()`를 사용하거나, Node.js에서 `new Date().toISOString()`을 생성하여 전달합니다.
- **API 응답**: 클라이언트에 응답을 보낼 때 날짜 필드는 항상 `toISOString()`이 적용된 문자열이어야 합니다 (예: `2026-05-06T10:22:44.000Z`).
- **통계 쿼리**: 서버는 클라이언트로부터 **UTC 기준의 시작 및 종료 시간(`startDate`, `endDate`)**을 전달받아 해당 범위의 데이터를 쿼리합니다. 서버 자체적으로 타임존 오프셋을 계산하지 않습니다.


### B. 클라이언트 (Client)
- **로컬 표시**: 서버에서 받은 ISO 문자열은 `new Date(isoString)`을 통해 파싱하여 사용합니다. 브라우저는 이를 자동으로 사용자의 현재 타임존(Local Time)으로 변환합니다.
- **날짜 경계 정의**: "오늘" 또는 "특정 날짜"에 대한 통계를 요청할 때, **클라이언트의 로컬 시간 기준**으로 해당 날짜의 시작(`00:00:00`)과 끝(`23:59:59`)을 구한 뒤, 이를 **ISO(UTC) 문자열로 변환하여 서버에 요청**합니다.


---

## 2. 데이터베이스 설계 (Database Design)

- **외래 키 금지**: 데이터베이스 구성 시 `FOREIGN KEY`를 사용하지 않습니다. 데이터 무결성은 애플리케이션 로직에서 관리합니다.

---

## 3. 코드 작성 규칙 (Coding Conventions)

- **주석**: 코드에는 한국어로 된 자세한 주석을 작성하여 가독성을 높입니다.
- **입출력**: 프로그램의 인터페이스 및 사용자에게 보여지는 입출력 문구는 영어를 기본으로 합니다. (필요에 따라 한국어 병기 가능)
- **이모티콘**: 문서 및 코드 내 이모티콘 사용은 최소화합니다.

---

## 4. 디자인 및 UI (Aesthetics)

- **Rich Aesthetics**: 현대적이고 프리미엄한 느낌의 디자인을 지향합니다.
- **Dynamic Design**: 호버 효과, 마이크로 애니메이션 등을 활용하여 생동감 있는 인터페이스를 구축합니다.
- **Typography**: 브라우저 기본 폰트 대신 Google Fonts(Inter, Roboto 등)를 활용합니다.

---

## 5. 프로젝트 구조 (Project Structure)

이 프로젝트는 다음과 같은 폴더 및 파일 구조로 구성되어 있습니다.

### A. 클라이언트 (Frontend)
- `index.html`: 메인 사용자 인터페이스
- `css/`: 스타일시트 (`style.css`)
- `js/`: 프론트엔드 로직
    - `app.js`: 메인 애플리케이션 로직 및 UI 제어
    - `api.js`: 백엔드 API와의 통신 담당
    - `chart.js`: 통계 및 차트 렌더링
    - `timer.js`: 공부 시간 측정을 위한 타이머 로직
    - `sw.js`: PWA(Progressive Web App)를 위한 서비스 워커
- `assets/`: 이미지 및 정적 자산

### B. 서버 (Backend)
- `server/server.js`: 서버 진입점 (Express 설정 및 서버 실행)
- `server/routes/`: API 엔드포인트 정의 (auth, study, admin)
- `server/controllers/`: 각 경로에 대한 비즈니스 로직 처리
- `server/middleware/`: 인증(`auth`) 및 관리자(`admin`) 권한 검사 미들웨어
- `server/config/`: 데이터베이스 연결 설정 (`db.js`)
- `server/.env`: 환경 변수 설정 (포트, DB 정보 등)

### C. 데이터베이스 및 기타
- `database/schema.sql`: 데이터베이스 테이블 설계 스크립트
- `README.md`: 프로젝트 개요 및 설치 가이드
- `GEMINI.md`: 개발 원칙 및 프로젝트 구조 가이드 (본 문서)
