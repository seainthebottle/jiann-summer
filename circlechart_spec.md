# PPakong Timer - 24-Hour Circular Chart Specification

본 문서는 'PPakong Timer' 서비스의 대표 시각화 요소인 **24시간 원형 시계 차트 (24-Hour Circular Clock Chart)**의 세부 수학적 스펙, 세션 분할 알고리즘 및 모바일 환경(iOS 네이티브) 구현 가이드라인을 상세히 정리한 문서입니다.

---

## 1. 차트 기본 정의 및 물리 좌표계 사양

차트는 24시간 전체를 360도 원그래프에 일대일 매핑하여, 사용자의 하루 중 공부한 시간대와 비어 있는 시간대를 한눈에 보여주는 시계형 인터페이스입니다.

```
                  [12시 방향: 0A (오전 0시)]
                             -90도
                             
           11P    12A    1A
        10P                 2A
      9P                       3A
     8P                         4A
    7P                           5A
   [9시] 6P       (중심점)       6A [3시]
   180도                         0도
    5P                           7A
     4P                         8A
      3P                       9A
        2P                 10A
           1P     MD     11A
                  [6시 방향: MD (정오 12시)]
                             90도
```

### 1.1 각도 환산 기준
- **하루 전체 시간**: 24시간 = 1,440분 = 86,400초 = 360도
- **단위 환산율**:
  - 1시간 = `15도 (15°)` = `pi / 6` 라디안 (Radian)
  - 1분 = `0.25도 (0.25°)` = `pi / 720` 라디안
  - 1초 = `0.004167도 (0.004167°)` = `pi / 43200` 라디안

### 1.2 회전 방향 및 기준각 (삼각함수 매핑)
- **방향성**: 시계 방향 (Clockwise)
- **기준원점 (00:00)**: 시계의 12시 정각 방향
- **각도 오프셋**: 
  - 표준 수학적 좌표계(오른쪽 3시 방향이 0도) 기준으로 12시 방향은 `-90도` 또는 `270도` (라디안 기준 `-pi/2` 또는 `1.5 * pi`)에 해당합니다.
  - 따라서 시간 `T`(오전 0시 기준의 경과 초)에 따른 시작 각도 및 종료 각도를 구할 때, 기준각 `-90도`에서 계산된 각도를 **더하는** 방식으로 산출합니다.
  - *수식*: `각도(Degree) = (경과초 / 86400) * 360 - 90`

---

## 2. 세션 분할 및 매핑 알고리즘 (Time-Slicing Algorithm)

서버에서 응답받은 특정 일자의 공부 세션 배열(`sessions`)을 가지고 24시간 원을 틈새 없이 메우는 조각(Slice) 목록을 동적으로 구성하는 핵심 로직입니다.

### 2.1 사전 데이터 준비
1. 기준일의 로컬 시작 시각(`DayStart`)과 종료 시각(`DayEnd`)을 타임스탬프로 정의합니다.
   - `DayStart`: 기준일의 00:00:00.000 (Local Time)
   - `DayEnd`: 기준일의 23:59:59.999 (Local Time)
2. 서버에서 수신한 `sessions` 데이터를 `start` 타임스탬프 기준 오름차순(시간 순)으로 정렬합니다.

### 2.2 순회 루프 동작 정의
시간 추적 포인터 `currentTime` 변수를 생성하고 `DayStart` 시각으로 초기화합니다.

정렬된 `sessions` 목록의 각 요소 `session`에 대해 다음을 반복 실행합니다:

1. **빈 시간(Empty Gap) 체크 및 생성**:
   - 만약 `session.start > currentTime` 이면:
     - `currentTime`부터 `session.start`까지의 구간을 **'빈 시간' 조각**으로 생성합니다.
     - **색상 지정**: `rgba(233, 236, 239, 0.2)` (Hex `#E9ECEF`에 투명도 20%)
     - **라벨 지정**: 빈 문자열 또는 "빈 시간"
     - `currentTime`을 `session.start`로 이동시킵니다.
2. **공부 세션 조각 생성**:
   - `session.start`부터 `session.end`까지의 구간을 **'공부 세션' 조각**으로 생성합니다.
   - **색상 지정**: `session.color` (서버에서 지정한 과목 고유 색상 Hex 값)
   - **라벨 지정**: `session.subject_name`
   - **활성화 여부**: 만약 `session.is_active`가 참(True)이면 이 조각은 **진행 중(Active)** 상태로 라벨링합니다.
   - `currentTime`을 `session.end`로 이동시킵니다.

### 2.3 잔여 시간 처리
모든 세션 순회가 완료된 후:
- 만약 `currentTime < DayEnd` 이면:
  - `currentTime`부터 `DayEnd`까지의 남은 구간을 마지막 **'빈 시간' 조각**으로 생성하여 채웁니다.
  - **색상 지정**: `rgba(233, 236, 239, 0.2)`

---

## 3. 시계 문자판 눈금 (Clock Labels) 드로잉 사양

원형 차트의 가독성을 높이기 위해 차트 외곽 영역에 24시간을 가리키는 문자 텍스트 레이블을 배치해야 합니다.

### 3.1 문자 눈금 좌표 산출식
차트 중심 좌표를 `(centerX, centerY)`, 차트 원의 물리 반지름을 `R`, 차트 테두리와 텍스트 간 마진을 `D`라 정의합니다.
텍스트가 위치할 배치 반경 `r = R + D` (권장 마진 `D = 15pt` 내외)

0시부터 23시까지 총 24개의 눈금 레이블 위치 계산 수식:
```
i = 0, 1, 2, ..., 23 (각 시간 단위)
angle_degrees = (i * 15) - 90
angle_radians = angle_degrees * (pi / 180)

x = centerX + r * cos(angle_radians)
y = centerY + r * sin(angle_radians)
```

### 3.2 시간대별 텍스트 매핑 규칙
각 인덱스 `i`에 매핑되는 레이블 문자열은 다음과 같습니다.
- `i == 0` : `"0A"` (오전 0시)
- `1 <= i <= 11` : `"{i}A"` (오전 1시 ~ 오전 11시)
- `i == 12` : `"MD"` (Mid-day, 정오 12시)
- `13 <= i <= 23` : `"{i - 12}P"` (오후 1시 ~ 오후 11시)

---

## 4. 진행 중인 세션(Active Session) 광선 애니메이션 사양

현재 실시간으로 공부가 지속되고 있는 조각(`is_active == true`)은 정적인 고정 컬러 대신, 콘익 그라데이션(Conic/Angular Gradient)을 활용하여 시계 방향으로 광선이 흐르는 듯한 회전 효과를 부여합니다.

### 4.1 그라데이션 중단점 (Color Stops)
조각을 칠할 콘익 그라데이션의 각도 범위 내의 가상의 비율 `[0.0 ~ 1.0]` 공간에서 다음과 같이 중단점을 매핑합니다.
- `0.0`: 과목 고유 기본 색상 (`baseColor`)
- `0.45`: 과목 고유 기본 색상 (`baseColor`)
- `0.5`: 하이라이트 백색광 (`rgba(255, 255, 255, 0.5)`)
- `0.55`: 과목 고유 기본 색상 (`baseColor`)
- `1.0`: 과목 고유 기본 색상 (`baseColor`)

### 4.2 회전 애니메이션 제어
- 그라데이션의 회전 오프셋 각도 `gradientOffset` 변수를 정의합니다.
- 프레임 렌더링마다 `gradientOffset` 값에 일정량(예: 프레임당 `+0.05` 라디안)을 누적시킵니다.
- 그라데이션을 그릴 때 중심 각도를 `gradientOffset` 만큼 회전하여 그립니다.
- 시스템 전력 효율을 위해, **진행 중인 세션이 존재하지 않을 때(Active 세션이 없는 일자를 조회 중일 때)**는 이 애니메이션 프레임 루프를 정지하여 CPU/GPU 낭비를 방지하도록 설계해야 합니다.

---

## 5. iOS 네이티브 개발을 위한 플랫폼별 구현 가이드

### 5.1 SwiftUI 환경 구현 방법

SwiftUI의 `Canvas` 또는 `Path` 기능을 결합하여 완성할 수 있습니다.

#### 조각 그리기 (Slices)
- `Path` 객체의 `addArc` 메서드를 활용합니다.
```swift
// SwiftUI Coordinate System에서는 0도가 오른쪽(3시)이므로, 시계방향 회전 시 각도 계산에 주의합니다.
Path { path in
    path.move(to: center)
    path.addArc(
        center: center,
        radius: radius,
        startAngle: .degrees(startAngle),
        endAngle: .degrees(endAngle),
        clockwise: false // SwiftUI의 addArc는 Standard Cartesian 좌표계 기준으로 clockwise 여부를 제어합니다.
    )
}
.fill(color)
```

#### 회전 그라데이션 애니메이션 (TimelineView)
- `TimelineView`를 구동하여 갱신 간격을 잡고, `AngularGradient`를 사용해 회전 효과를 줄 수 있습니다.
```swift
TimelineView(.animation(minimumInterval: 0.03, paused: !hasActiveSession)) { timeline in
    let date = timeline.date
    let offsetAngle = calculateOffset(for: date) // 시간에 따라 증가하는 각도 계산
    
    Canvas { context, size in
        // ... 전체 조각 루프 렌더링 ...
        if slice.isActive {
            var activeContext = context
            // 그라데이션 회전 효과 적용
            activeContext.rotate(by: .radians(offsetAngle))
            
            let gradient = Gradient(colors: [baseColor, baseColor, .white.opacity(0.5), baseColor, baseColor])
            let angularGrad = GraphicsContext.Shading.gradient(
                .angular(gradient, center: center, startAngle: .zero, endAngle: .degrees(360))
            )
            // 액티브 세션 영역 패스에 그라데이션 마스킹 및 페인팅
            activeContext.fill(slicePath, with: angularGrad)
        }
    }
}
```

### 5.2 UIKit (Core Graphics / UIView) 환경 구현 방법

`UIView`의 서브클래스를 생성하고 `draw(_ rect: CGRect)` 메서드 내부에서 그립니다.

#### Core Graphics 좌표 변환
- `CGContext.addArc`를 호출하여 호(Arc)를 생성하고 칠합니다.
```objc
CGContextRef ctx = UIGraphicsGetCurrentContext();
CGContextMoveToPoint(ctx, centerX, centerY);
CGContextAddArc(ctx, centerX, centerY, radius, startAngleRadians, endAngleRadians, 0); // 0: 시계 방향, 1: 반시계 방향
CGContextClosePath(ctx);
CGContextSetFillColorWithColor(ctx, color.CGColor);
CGContextFillPath(ctx);
```

#### 프레임 동기화 (CADisplayLink)
- 액티브 세션이 활성화되었을 때 `CADisplayLink`를 등록하여 메인 런루프에서 동기화합니다.
```swift
var displayLink: CADisplayLink?

func startAnimation() {
    guard displayLink == nil else { return }
    displayLink = CADisplayLink(target: self, selector: #selector(updateFrame))
    displayLink?.add(to: .main, forMode: .common)
}

func stopAnimation() {
    displayLink?.invalidate()
    displayLink = nil
}

@objc func updateFrame() {
    self.gradientOffset += 0.05
    self.setNeedsDisplay() // 화면 갱신 유도
}
```
- `draw` 메서드 내에서 `gradientOffset`을 적용하여 액티브 세션 영역에 그라데이션 브러시를 렌더링합니다.

---

## 6. 프론트엔드-백엔드 통신 프로토콜 규격 (Communication Protocol)

본 장은 24시간 원형 시계 차트를 완성하기 위해 프론트엔드와 백엔드가 데이터를 주고받는 방식 및 시간 관련 오프셋 처리 기법을 정의합니다.

### 6.1 API 엔드포인트 및 인증 헤더
- **HTTP Method**: `GET`
- **Path**: `/study/stats`
- **필수 요청 헤더**:
  ```http
  Authorization: Bearer <JWT_Token>
  Content-Type: application/json
  ```

### 6.2 일별 차트 조회를 위한 시간 경계 및 요청 파라미터 계산법
클라이언트에서 특정 날짜 `D` (예: 디바이스 로컬 기준 `2026-06-30`)에 대한 24시간 차트를 그리려면, 해당 날짜의 로컬 타임존 기준 시작 시각(`00:00:00.000`)과 종료 시각(`23:59:59.999`)을 구하여 ISO 8601 UTC 문자열로 변환한 뒤 쿼리 스트링 파라미터로 요청해야 합니다.

#### 파라미터 구조
- `startDate` (필수): 조회 시작 시점 (ISO 8601 UTC 규격)
- `endDate` (필수): 조회 종료 시점 (ISO 8601 UTC 규격)

#### 한국 표준시 (KST, UTC+09:00) 기준 예시 계산
- **사용자 조회 대상 로컬 일자**: `2026-06-30`
- **디바이스 로컬 기준 시작/종료 범위**:
  - 시작 시각: `2026-06-30T00:00:00.000+09:00`
  - 종료 시각: `2026-06-30T23:59:59.999+09:00`
- **ISO 8601 UTC 변환 결과 (요청 파라미터 전달 값)**:
  - `startDate` = `2026-06-29T15:00:00.000Z`
  - `endDate` = `2026-06-30T14:59:59.999Z`

> [!IMPORTANT]
> 서버는 수신한 `startDate`와 `endDate` 사이의 세션만 DB에서 조회하여 반환하며, 자체적으로 타임존 오프셋을 계산하지 않습니다. 따라서 클라이언트는 반드시 **디바이스 타임존을 반영한 UTC 시간 범위**를 명확히 계산하여 전송해야 합니다.

### 6.3 서버 응답 데이터 구조와 차트 요소 간의 매핑 규칙
`/study/stats` 호출 성공 시 반환되는 JSON 데이터에서 차트 구성에 사용되는 핵심 배열은 `sessions`입니다.

#### 응답 세션 데이터 스키마
`sessions` 배열의 각 객체(`session`)는 다음 필드를 제공합니다.

| 서버 데이터 필드 | 데이터 타입 | 설명 | 차트(Slice) 매핑 속성 |
| :--- | :--- | :--- | :--- |
| `subject_name` | String | 과목 이름 | 2.2절 공부 세션 조각의 라벨 텍스트로 활용 |
| `color` | String | 과목 고유 색상 (Hex 코드) | 2.2절 공부 세션 조각의 배경색으로 사용 (예: `#339af0`) |
| `start` | String | 세션 시작 시각 (ISO 8601 UTC) | 2.1절 세션 시작 타임스탬프 계산의 기준점 |
| `end` | String | 세션 종료 시각 (ISO 8601 UTC) | 2.1절 세션 종료 타임스탬프 계산의 기준점 |
| `is_active` | Boolean | 실시간 공부 진행 중 여부 | `true`일 경우, 4절의 회전 광선 애니메이션 적용 |

### 6.4 클라이언트 사이드 타임존 변환 및 시간 오프셋 보정 가이드
서버로부터 수신한 `sessions`의 `start`와 `end`는 UTC 시간이므로, 24시간 원형 차트 상의 각도(0도 ~ 360도)로 매핑하기 위해서는 **디바이스 로컬 타임존의 '오늘 오전 0시' 기준 경과 초**로 변환해야 합니다.

#### 로컬 경과 초(초 단위 시간 오프셋) 환산 로직

1. 기준일의 로컬 오전 0시(`DayStart`)를 구하여 Unix 타임스탬프(밀리초)로 변환합니다.
2. 서버 세션의 `start`와 `end` ISO 8601 문자열을 디바이스 로컬 `Date` 객체로 파싱하여 각각의 Unix 타임스탬프(밀리초)를 구합니다.
3. 오전 0시 기준 경과 초(`elapsedSeconds`)는 다음과 같이 계산합니다:
   - `start_elapsed = (session.start_timestamp - DayStart_timestamp) / 1000`
   - `end_elapsed = (session.end_timestamp - DayStart_timestamp) / 1000`
4. 계산된 경과 초를 1.2절의 각도 환산 기준에 대입하여 물리적 렌더링 각도를 계산합니다.
   - *공식*: `각도(Degree) = (elapsedSeconds / 86400) * 360 - 90`

#### 플랫폼별 구현 예시

##### JavaScript (Web 프론트엔드)
```javascript
// 조회 대상일: 2026-06-30
const dayStart = new Date("2026-06-30T00:00:00"); // 로컬 시간 기준 00:00:00
const dayStartTime = dayStart.getTime();

// 서버로부터 수신한 세션 데이터 예시
const session = {
  subject_name: "수학",
  color: "#339af0",
  start: "2026-06-30T03:00:00.000Z", // KST 기준 12:00:00
  end: "2026-06-30T03:40:00.000Z",   // KST 기준 12:40:00
  is_active: false
};

// 타임스탬프 획득 및 경과 초 계산
const sessionStartTime = new Date(session.start).getTime();
const sessionEndTime = new Date(session.end).getTime();

const startElapsedSeconds = (sessionStartTime - dayStartTime) / 1000; // 43200초 (12시간 경과)
const endElapsedSeconds = (sessionEndTime - dayStartTime) / 1000;     // 45600초 (12시간 40분 경과)

// 각도 환산
const startAngle = (startElapsedSeconds / 86400) * 360 - 90; // 90도 (정오 12시 방향)
const endAngle = (endElapsedSeconds / 86400) * 360 - 90;     // 100도
```

##### Swift (iOS 네이티브 - SwiftUI / UIKit)
```swift
import Foundation

// 1. 조회 대상일 로컬 시작 시각 설정
var calendar = Calendar.current
calendar.timeZone = TimeZone.current // 디바이스 로컬 타임존

let targetDateComponents = DateComponents(year: 2026, month: 6, day: 30)
guard let dayStart = calendar.date(from: targetDateComponents) else { return }
let dayStartTimeInterval = dayStart.timeIntervalSince1970 // Unix timestamp (seconds)

// 2. 서버 ISO 8601 UTC 문자열 파싱 formatter
let isoFormatter = ISO8601DateFormatter()
isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

// 서버 데이터 예시
let serverStartStr = "2026-06-30T03:00:00.000Z"
let serverEndStr = "2026-06-30T03:40:00.000Z"

guard let sessionStartDate = isoFormatter.date(from: serverStartStr),
      let sessionEndDate = isoFormatter.date(from: serverEndStr) else { return }

let sessionStartTimeInterval = sessionStartDate.timeIntervalSince1970
let sessionEndTimeInterval = sessionEndDate.timeIntervalSince1970

// 3. 로컬 00:00:00 기준 경과 초(Seconds) 산출
let startElapsedSeconds = sessionStartTimeInterval - dayStartTimeInterval // 43200.0
let endElapsedSeconds = sessionEndTimeInterval - dayStartTimeInterval     // 45600.0

// 4. 각도 변환 (삼각함수 좌표계 오프셋 -90도 적용)
let startAngle = (startElapsedSeconds / 86400.0) * 360.0 - 90.0
let endAngle = (endElapsedSeconds / 86400.0) * 360.0 - 90.0
```

> [!WARNING]
> 날짜 경계를 넘어서는 세션(예: 전날 밤 23:00에 시작하여 당일 01:30에 종료된 공부)의 경우, 디바이스의 로컬 시작 시각 `DayStart` 이전의 세션 구간은 `startElapsedSeconds`가 음수(`startElapsedSeconds < 0`)로 계산됩니다.
> 이 경우, 클라이언트의 시간 분할 알고리즘(2.2절)에서는 `DayStart` 시점인 0초(`startElapsedSeconds = 0`)로 잘라내어(Clamping) 당일 차트에는 00:00 시작으로 렌더링하고, 초과된 이전 시간 조각은 당일 차트 렌더링에서 제외해야 합니다. 반대로 `DayEnd`를 초과하여 끝나는 세션의 경우 역시 `86400초` 지점에서 자르는 예외 처리가 필요합니다.
