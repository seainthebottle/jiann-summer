# PPakong Timer - Backend API Specification

본 문서는 'PPaking Timer' 서비스의 프론트엔드와 백엔드 간 통신 규격을 상세히 정리한 API 명세서입니다. 본 규격을 바탕으로 외부 애플리케이션(iOS, Android 등) 또는 외부 프로그램이 백엔드 서버와 오차 없이 온전히 연동될 수 있도록 설계되었습니다.

---

## 1. 전역 설정 및 통신 규칙

### 1.1 Base URL
- API 서버의 기본 경로: `http://<server-ip-or-domain>:<port>/api` 또는 리버스 프록시 하의 `https://<domain>/api`
  - *예시*: `https://seainthebottle.mooo.com/api`
  - *주의*: 중간에 `/summer` 경로가 포함되지 않아야 합니다. `/summer`는 프론트엔드 정적 파일 호스팅 경로(예: 웹브라우저 접속 주소)이며, API 프록시는 `/api` 경로로 바로 매핑되어 있습니다.
- 모든 API 요청 경로는 Base URL 하위에 위치합니다.

### 1.2 공통 HTTP 헤더
모든 요청(인증이 필요 없는 일부 Auth API 제외)은 아래 헤더를 전송해야 합니다.

```http
Content-Type: application/json
Authorization: Bearer <JWT_Token>
```

### 1.3 공통 에러 응답 형식
서버에서 오류가 발생한 경우(상태 코드 `4xx`, `5xx`), 일관된 구조의 JSON 응답을 반환합니다.

```json
{
  "error": "오류 내용 메시지"
}
```

### 1.4 날짜 및 시간 규격 (중요)
- 본 API 시스템은 모든 시간 데이터를 **ISO 8601 UTC** 포맷 (`YYYY-MM-DDTHH:mm:ss.sssZ`)으로 통일하여 통신합니다.
- 서버 측에서는 데이터베이스에 기록할 때 UTC 기준으로 처리하며, 클라이언트로 응답을 내보낼 때 역시 항상 UTC 기준의 문자열로 가공하여 반환합니다.
- 클라이언트는 통계 범위(`startDate`, `endDate`)를 지정할 때 **로컬 디바이스의 날짜 경계선(00:00:00.000 ~ 23:59:59.999)**을 구한 뒤 이를 **ISO 8601 UTC 형식으로 변환**하여 전송해야 합니다.

---

## 2. 인증 관련 API (Authentication)

### 2.1 회원가입 (Register)
새로운 사용자 계정을 생성합니다. 최초 등록되는 계정의 역할(`role`)은 기본적으로 `'user'`로 설정됩니다.

- **HTTP Method**: `POST`
- **Path**: `/auth/register`
- **인증 필요 여부**: 아님 (No Bearer Token)
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `username` | String | 필수 | 로그인에 사용할 사용자 아이디 |
  | `password` | String | 필수 | 로그인에 사용할 비밀번호 |

- **Response (201 Created)**:
  ```json
  {
    "message": "회원가입 성공"
  }
  ```
- **Error Response (400 Bad Request - 중복 가입)**:
  ```json
  {
    "error": "이미 존재하는 아이디입니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "서버 오류 발생"
  }
  ```

---

### 2.2 로그인 (Login)
계정 정보를 확인하고 API 호출에 사용할 인증용 토큰(JWT)과 사용자 세부 정보를 반환합니다.

- **HTTP Method**: `POST`
- **Path**: `/auth/login`
- **인증 필요 여부**: 아님 (No Bearer Token)
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `username` | String | 필수 | 사용자 아이디 |
  | `password` | String | 필수 | 사용자 비밀번호 |

- **Response (200 OK)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MiwidXNlcm5hbWUiOiJ0ZXN0dXNlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzE5NzE1MjAwLCJleHAiOjE3MjAzMjAwMDB9.signature...",
    "user": {
      "id": 2,
      "username": "testuser",
      "role": "user"
    }
  }
  ```
- **Error Response (401 Unauthorized - 아이디 불일치)**:
  ```json
  {
    "error": "존재하지 않는 아이디입니다."
  }
  ```
- **Error Response (401 Unauthorized - 비밀번호 불일치)**:
  ```json
  {
    "error": "비밀번호가 일치하지 않습니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "서버 오류 발생"
  }
  ```

---

### 2.3 토큰 유효성 검증 (Verify)
저장되어 있는 인증 토큰이 현재도 유효한지 검증하고 사용자 세션을 복구합니다.

- **HTTP Method**: `GET`
- **Path**: `/auth/verify`
- **인증 필요 여부**: 필수 (Bearer Token 포함)
- **Response (200 OK)**:
  ```json
  {
    "user": {
      "id": 2,
      "username": "testuser",
      "role": "user"
    }
  }
  ```
- **Error Response (401 Unauthorized - 토큰 누락)**:
  ```json
  {
    "error": "인증 토큰이 필요합니다."
  }
  ```
- **Error Response (403 Forbidden - 토큰 만료 및 위조)**:
  ```json
  {
    "error": "유효하지 않은 토큰입니다."
  }
  ```

---

## 3. 공부 관리 API (Study Control)

모든 공부 관련 API는 **인증 헤더가 필수**로 포함되어야 합니다.

### 3.1 전체 과목 리스트 조회 (Get Subjects)
공부 등록 시 선택할 수 있는 과목의 전체 목록을 가나다순(이름 오름차순)으로 조회합니다.

- **HTTP Method**: `GET`
- **Path**: `/study/subjects`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "name": "과학",
      "color": "#e03131",
      "created_at": "2026-06-29T15:00:00.000Z"
    },
    {
      "id": 2,
      "name": "수학",
      "color": "#339af0",
      "created_at": "2026-06-29T15:00:00.000Z"
    }
  ]
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "과목 조회 중 오류 발생"
  }
  ```

---

### 3.2 공부 세션 시작 (Start Session)
지정한 과목에 대해 공부 타이머 측정을 개시합니다. 선택적으로 계획 ID(`plan_id`)를 함께 연동할 수 있습니다.

- **HTTP Method**: `POST`
- **Path**: `/study/start`
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `subject_id` | Integer | 필수 | 공부를 시작할 과목의 식별자 ID |
  | `plan_id` | Integer | 선택 | 공부를 시작할 계획의 식별자 ID (계획 공부 연동 시) |

- **Response (200 OK)**:
  ```json
  {
    "message": "공부 시작!"
  }
  ```
- **Error Response (400 Bad Request - 이미 구동 중)**:
  ```json
  {
    "error": "이미 진행 중인 공부 세션이 있습니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "서버 오류 발생"
  }
  ```

---

### 3.3 공부 세션 종료 (Stop Session)
진행 중인 공부 세션을 중단하고 누적 공부 시간을 환산하여 기록에 보존합니다.
*보안 상 정책*: 시작한 시점부터 종료 시점까지의 간격이 **1분(60초) 이하**인 경우에는 비정상/무의미한 기록으로 간주하여 세션 데이터를 저장하지 않고 폐기합니다.

- **HTTP Method**: `POST`
- **Path**: `/study/stop`
- **Response (200 OK - 정상 기록 완료)**:
  ```json
  {
    "message": "공부 종료!"
  }
  ```
- **Response (200 OK - 1분 미만으로 기록 폐기)**:
  ```json
  {
    "message": "공부 시간이 1분 이하여서 기록되지 않았습니다."
  }
  ```
- **Error Response (400 Bad Request - 구동 중인 세션 없음)**:
  ```json
  {
    "error": "진행 중인 공부 세션이 없습니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "서버 오류 발생"
  }
  ```

---

### 3.4 현재 공부 상태 조회 (Get Status)
로그인한 사용자에게 현재 측정 중인(종료되지 않은) 세션이 존재하는지 확인합니다.

- **HTTP Method**: `GET`
- **Path**: `/study/status`
- **Response (200 OK - 공부 중인 상태)**:
  ```json
  {
    "active": {
      "id": 45,
      "user_id": 2,
      "subject_id": 2,
      "plan_id": 12,
      "start_time": "2026-06-30T01:10:00.000Z",
      "end_time": null,
      "duration_seconds": null,
      "subject_name": "수학"
    }
  }
  ```
- **Response (200 OK - 공부 중이 아닌 상태)**:
  ```json
  {
    "active": null
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "서버 오류 발생"
  }
  ```


---

### 3.5 공부 통계 조회 (Get Stats)
특정 기간 범위의 세션 목록과 일간, 주간, 월간, 전개 누적 통계 시간을 초 단위로 합산하여 조회합니다.

- **HTTP Method**: `GET`
- **Path**: `/study/stats`
- **Query Parameters**:
  | 파라미터명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `startDate` | String | 필수 | 조회할 범위의 시작 시점 (ISO 8601 UTC 규격) |
  | `endDate` | String | 필수 | 조회할 범위의 종료 시점 (ISO 8601 UTC 규격) |
  | `targetUserId` | Integer | 선택 | 다른 사용자의 통계를 열람할 때의 사용자 ID (관리자 전용) |
  | `subjectId` | Integer | 선택 | 특정 과목만 필터링하여 보고자 할 때의 과목 ID |

- **Response (200 OK)**:
  ```json
  {
    "dailyTotal": 5400,
    "weeklyTotal": 37800,
    "monthlyTotal": 162000,
    "weeklyAvg": 5400,
    "monthlyAvg": 5400,
    "cumulativeTotal": 248000,
    "sessions": [
      {
        "subject_name": "과학",
        "color": "#e03131",
        "start": "2026-06-30T00:10:00.000Z",
        "end": "2026-06-30T01:30:00.000Z",
        "is_active": false
      },
      {
        "subject_name": "수학",
        "color": "#339af0",
        "start": "2026-06-30T03:00:00.000Z",
        "end": "2026-06-30T03:40:00.000Z",
        "is_active": true
      }
    ]
  }
  ```
- **Error Response (400 Bad Request - 날짜 범위 미지정)**:
  ```json
  {
    "error": "startDate와 endDate가 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "통계 조회 중 오류 발생"
  }
  ```

---

### 3.6 계획 리스트 조회 (Get Plans)
현재 로그인한 사용자의 오늘의 계획 목록을 과목 정보와 함께 조회합니다.

- **HTTP Method**: `GET`
- **Path**: `/study/plans`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "user_id": 2,
      "subject_id": 2,
      "title": "Solve 10 Math Problems",
      "estimated_minutes": 40,
      "completed_seconds": 1800,
      "status": "todo",
      "created_at": "2026-07-08T12:00:00.000Z",
      "subject_name": "수학",
      "subject_color": "#339af0"
    }
  ]
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "계획 조회 중 오류 발생"
  }
  ```

---

### 3.7 계획 생성 (Create Plan)
새로운 오늘의 계획을 현재 활성화된 특정 과목에 종속하여 생성합니다.

- **HTTP Method**: `POST`
- **Path**: `/study/plans`
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `subject_id` | Integer | 필수 | 계획을 연동할 과목의 식별자 ID |
  | `title` | String | 필수 | 계획의 구체적인 텍스트 내용 |
  | `estimated_minutes` | Integer | 필수 | 예상 소요 시간 (분 단위, 10~60 범위) |

- **Response (200 OK)**:
  ```json
  {
    "message": "계획이 생성되었습니다."
  }
  ```
- **Error Response (400 Bad Request - 필수 필드 누락)**:
  ```json
  {
    "error": "과목, 계획 내용, 목표 시간은 필수입니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "계획 생성 중 오류 발생"
  }
  ```

---

### 3.8 계획 완료 처리 (Done Plan)
지정한 계획을 강제로 '완료(done)' 상태로 변경합니다.

- **HTTP Method**: `POST`
- **Path**: `/study/plans/:id/done`
- **Path Parameters**:
  - `id`: 완료 처리할 계획의 식별자 ID (Integer)
- **Response (200 OK)**:
  ```json
  {
    "message": "계획이 완료 처리되었습니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "계획 완료 처리 중 오류 발생"
  }
  ```

---

### 3.9 계획 삭제 (Delete Plan)
지정한 계획을 영구 삭제합니다.

- **HTTP Method**: `DELETE`
- **Path**: `/study/plans/:id`
- **Path Parameters**:
  - `id`: 삭제할 계획의 식별자 ID (Integer)
- **Response (200 OK)**:
  ```json
  {
    "message": "계획이 삭제되었습니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "계획 삭제 중 오류 발생"
  }
  ```

---

## 4. 관리자 API (Admin Control)

모든 관리자 API는 **인증 헤더가 필수**이며, 로그인한 계정의 `role` 속성이 `'admin'`이어야 접근 가능합니다. 일반 사용자가 접근할 시 `403 Forbidden` 에러를 반환합니다.

### 4.1 전체 사용자 목록 조회 (Get Users)
시스템에 등록된 전체 사용자들의 계정 정보를 가입일 최신순으로 정렬하여 조회합니다.

- **HTTP Method**: `GET`
- **Path**: `/admin/users`
- **Response (200 OK)**:
  ```json
  [
    {
      "id": 1,
      "username": "admin",
      "role": "admin",
      "created_at": "2026-06-29T15:00:00.000Z"
    },
    {
      "id": 2,
      "username": "testuser",
      "role": "user",
      "created_at": "2026-06-30T01:00:00.000Z"
    }
  ]
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "사용자 조회 중 오류 발생"
  }
  ```

---

### 4.2 사용자 계정 추가 (Add User)
시스템에 신규 사용자를 직접 생성하여 등록합니다.

- **HTTP Method**: `POST`
- **Path**: `/admin/users`
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `username` | String | 필수 | 생성할 사용자 ID |
  | `password` | String | 필수 | 생성할 사용자 비밀번호 |
  | `role` | String | 선택 | 역할 (`'user'` 또는 `'admin'`. 기본값 `'user'`) |

- **Response (201 Created)**:
  ```json
  {
    "message": "사용자 추가 성공"
  }
  ```
- **Error Response (400 Bad Request - ID 중복)**:
  ```json
  {
    "error": "이미 존재하는 아이디입니다."
  }
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "사용자 추가 중 오류 발생"
  }
  ```

---

### 4.3 사용자 계정 삭제 (Delete User)
등록된 사용자 계정을 시스템에서 즉시 영구 삭제합니다.
*자가 삭제 보호*: 현재 API 요청을 보낸 본인 계정 ID와 삭제 대상 ID가 일치할 경우 차단합니다.

- **HTTP Method**: `DELETE`
- **Path**: `/admin/users/:id`
- **Path Parameters**:
  - `id`: 삭제할 사용자의 식별자 ID (Integer)
- **Response (200 OK)**:
  ```json
  {
    "message": "사용자 삭제 성공"
  }
  ```
- **Error Response (400 Bad Request - 자기 계정 삭제 시도)**:
  ```json
  {
    "error": "본인 계정은 삭제할 수 없습니다."
  }
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "사용자 삭제 중 오류 발생"
  }
  ```

---

### 4.4 신규 과목 추가 (Add Subject)
대시보드와 통계에서 선택할 수 있는 새로운 공부 과목군을 등록합니다.

- **HTTP Method**: `POST`
- **Path**: `/admin/subjects`
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `name` | String | 필수 | 생성할 과목 이름 (과목명 중복 불가) |
  | `color` | String | 선택 | 과목 구분에 쓰일 CSS/Hex 색상코드 (기본값 `"#339af0"`) |

- **Response (201 Created)**:
  ```json
  {
    "message": "과목 추가 성공"
  }
  ```
- **Error Response (400 Bad Request - 과목명 중복)**:
  ```json
  {
    "error": "이미 존재하는 과목입니다."
  }
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "과목 추가 중 오류 발생"
  }
  ```

---

### 4.5 기존 과목 수정 (Update Subject)
등록된 공부 과목의 이름 또는 고유 색상을 변경합니다.

- **HTTP Method**: `PUT`
- **Path**: `/admin/subjects/:id`
- **Path Parameters**:
  - `id`: 수정할 과목의 식별자 ID (Integer)
- **Request Body (JSON)**:
  | 필드명 | 타입 | 필수 여부 | 설명 |
  | :--- | :--- | :--- | :--- |
  | `name` | String | 필수 | 수정할 새로운 과목 이름 |
  | `color` | String | 필수 | 수정할 새로운 Hex 색상코드 |

- **Response (200 OK)**:
  ```json
  {
    "message": "과목 수정 성공"
  }
  ```
- **Error Response (400 Bad Request - 다른 과목과 이름 중복)**:
  ```json
  {
    "error": "이미 존재하는 과목 이름입니다."
  }
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "과목 수정 중 오류 발생"
  }
  ```

---

### 4.6 과목 삭제 (Delete Subject)
공부 과목을 시스템에서 삭제합니다.

- **HTTP Method**: `DELETE`
- **Path**: `/admin/subjects/:id`
- **Path Parameters**:
  - `id`: 삭제할 과목의 식별자 ID (Integer)
- **Response (200 OK)**:
  ```json
  {
    "message": "과목 삭제 성공"
  }
  ```
- **Error Response (403 Forbidden - 권한 없음)**:
  ```json
  {
    "error": "관리자 권한이 필요합니다."
  }
  ```
- **Error Response (500 Internal Server Error)**:
  ```json
  {
    "error": "과목 삭제 중 오류 발생"
  }
  ```
