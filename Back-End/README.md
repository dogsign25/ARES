# 🤖 Ares 백엔드 아키텍처 문서

## 전체 데이터 흐름

```
[실제 모드]
라즈베리파이 (자이로/센서)
    │  MQTT (QoS 1)
    ▼
MqttSubscriber.java          ← MQTT 메시지 수신 & 라우팅
    │
    ├─ /sensors → SensorService.process()
    ├─ /alert   → SurvivorService.mark()
    └─ /status  → RobotRepository 업데이트

[Mock 모드 — 라즈베리파이 없을 때]
MockSensorScheduler.java     ← 1초마다 가짜 데이터 생성
    │
    └─ SensorService.process() (동일 파이프라인 사용)

[공통 파이프라인]
SensorService.process()
    ├─ DB 저장 (SensorLog)
    ├─ 생존율 ≥ 70% → SurvivorService.autoMarkFromSensor()
    └─ WebSocketPublisher.broadcastSensor() → React 프론트

React 프론트 (localhost:5173)
    ├─ /topic/sensors/{robotId}  ← 1초 센서 데이터
    └─ /topic/alert/{robotId}    ← 생존자 감지 즉시 알림
```

---

## 파일 구조 및 역할

```
hexapod-server/
│
├── build.gradle                         # Java 21, Spring Boot 3.2.5
│                                        # 의존성: JPA, WebSocket, MQTT, MySQL
│
├── src/main/resources/
│   └── application.yml                  # 전체 설정 파일
│                                        # - MySQL 연결 (allowPublicKeyRetrieval=true)
│                                        # - MQTT 브로커 주소 & 구독 토픽
│                                        # - mock.enabled: true/false (모드 전환 핵심)
│
└── src/main/java/com/hexapod/
    │
    ├── HexapodApplication.java          # Spring Boot 진입점 (@SpringBootApplication)
    │
    ├── config/
    │   ├── MqttConfig.java              # MQTT 브로커 연결 설정
    │   │                                # - mqttClientFactory: 브로커 인증 & 자동 재연결
    │   │                                # - mqttInboundAdapter: 토픽 구독 (sensors/alert/status)
    │   │                                # - mqttOutboundChannel: 라즈베리파이로 명령 송신
    │   │
    │   ├── WebSocketConfig.java         # STOMP WebSocket 설정
    │   │                                # - /ws 엔드포인트 (SockJS 폴백 지원)
    │   │                                # - /topic prefix: 서버→클라이언트 브로드캐스트
    │   │                                # - /app prefix: 클라이언트→서버 메시지
    │   │
    │   └── MockProperties.java          # application.yml의 mock.* 설정을 Java 객체로 바인딩
    │                                    # - enabled, robotId, robotName, intervalMs, survivorRate
    │
    ├── domain/
    │   ├── entity/
    │   │   ├── Robot.java               # 로봇 엔티티 (DB 테이블: robots)
    │   │   │                            # - robotKey: MQTT topic의 robotId와 매핑되는 식별자
    │   │   │                            # - status: ONLINE/OFFLINE/ERROR
    │   │   │                            # - batteryLevel, gaitMode, lastSeenAt
    │   │   │
    │   │   ├── Mission.java             # 미션 세션 엔티티 (DB 테이블: missions)
    │   │   │                            # - robot: 담당 로봇 (ManyToOne)
    │   │   │                            # - areaName: 정찰 지역명
    │   │   │                            # - status: IN_PROGRESS/COMPLETED/ABORTED
    │   │   │
    │   │   ├── SensorLog.java           # 센서 시계열 로그 (DB 테이블: sensor_logs)
    │   │   │                            # - 1초마다 쌓이는 원시 센서값
    │   │   │                            # - thermalMaxTemp, gasLevel, soundLevel
    │   │   │                            # - frontDistance, leftDistance, rightDistance
    │   │   │                            # - survivalRate (AI 추론값)
    │   │   │                            # ※ GPS 제거 → 위치는 Dead Reckoning으로 프론트 계산
    │   │   │
    │   │   └── SurvivorMark.java        # 생존자 감지 마킹 (DB 테이블: survivor_marks)
    │   │                                # - detectedByCamera/Thermal/Sound: 감지 근거 센서
    │   │                                # - survivalRate: 감지 당시 AI 생존율
    │   │                                # - snapshotUrl: 카메라 캡처 이미지 경로 (optional)
    │   │
    │   └── dto/
    │       ├── SensorDataDto.java       # 라즈베리파이 → 백엔드 수신 형식
    │       │                            # [중요 변경] LocationPayload 제거
    │       │                            # GyroPayload 추가:
    │       │                            #   - gyroZ: yaw 각속도 (deg/s) ← Dead Reckoning 핵심
    │       │                            #   - gyroX, gyroY: roll/pitch (노이즈 모니터링용)
    │       │                            #   - accelX, accelY: 가속도 (m/s²)
    │       │                            #   - speed: 추정 속력 (m/s)
    │       │
    │       ├── SensorBroadcastDto.java  # 백엔드 → React 송신 형식
    │       │                            # - 자이로값 (gyroX/Y/Z, accelX/Y, speed) 포함
    │       │                            # - obstacleWarning: frontDistance < 20cm 자동 판단
    │       │
    │       └── AlertDto.java            # 생존자 감지 이벤트 DTO
    │                                    # - survivalRate, triggers (camera/thermal/sound)
    │                                    # - snapshotUrl: 감지 당시 사진
    │
    ├── mock/                            # ── Mock 모드 패키지 (mock.enabled=true일 때만 활성화) ──
    │   ├── MockDataFactory.java         # 가짜 센서 데이터 생성기
    │   │                                # - 자이로 시뮬레이션: 직진→좌회전→직진→우회전 4페이즈 순환
    │   │                                # - gyroZ: 직진 ≈ 0°/s, 회전 ≈ ±30°/s
    │   │                                # - 가우시안 노이즈로 실제 센서 특성 재현
    │   │                                # - createSurvivorAlert(): 생존자 감지 이벤트 생성
    │   │
    │   └── MockSensorScheduler.java     # Mock 스케줄러 (@ConditionalOnProperty)
    │                                    # - @PostConstruct: 앱 시작 시 Robot + Mission DB 자동 생성
    │                                    # - @Scheduled: intervalMs(1초)마다 MockDataFactory 호출
    │                                    # - survivorRate 확률로 생존자 이벤트 랜덤 발생
    │
    ├── mqtt/
    │   ├── MqttSubscriber.java          # MQTT 메시지 수신 & 라우팅
    │   │                                # @ConditionalOnProperty(mock.enabled=false)
    │   │                                # - /sensors → SensorService.process()
    │   │                                # - /alert   → SurvivorService.mark()
    │   │                                # - /status  → 배터리/gaitMode/lastSeenAt 업데이트
    │   │
    │   └── MqttPublisher.java           # 라즈베리파이로 명령 송신
    │                                    # - hexapod/{robotId}/command 토픽으로 JSON 발행
    │
    ├── service/
    │   ├── SensorService.java           # 센서 데이터 처리 핵심 서비스
    │   │                                # process() 4단계:
    │   │                                #   1. missionId로 Mission 엔티티 조회
    │   │                                #   2. SensorLog DB 저장
    │   │                                #   3. survivalRate ≥ 0.7 → 자동 생존자 마킹
    │   │                                #   4. WebSocket 브로드캐스트 (/topic/sensors/{robotId})
    │   │                                # ※ 변수명 버그 수정: log → sensorLog (@Slf4j 충돌 방지)
    │   │
    │   └── SurvivorService.java         # 생존자 마킹 처리
    │                                    # mark(): alert 토픽으로 명시적 감지 이벤트 처리
    │                                    # autoMarkFromSensor(): survivalRate 임계값 초과 시 자동 마킹
    │                                    # ※ GPS 제거 → latitude/longitude = null 저장
    │                                    # (Dead Reckoning 위치는 프론트에서 계산)
    │
    ├── repository/
    │   ├── RobotRepository.java         # Robot CRUD
    │   │                                # findByRobotKey(): MQTT robotId로 Robot 엔티티 조회
    │   │
    │   ├── MissionRepository.java       # Mission CRUD
    │   │                                # findByRobotAndStatus(): 진행 중 미션 조회
    │   │                                # ※ 버그 수정: robotId(Long) → Robot 엔티티 직접 참조
    │   │
    │   ├── SensorLogRepository.java     # SensorLog 조회
    │   │                                # findByMissionIdOrderByTimestampAsc(): 차트용 시계열 조회
    │   │                                # findByMissionAndTimeRange(): 시간 범위 필터
    │   │
    │   └── SurvivorMarkRepository.java  # SurvivorMark 조회
    │                                    # findByMissionIdOrderByDetectedAtDesc(): 최신순 조회
    │
    ├── controller/                      # REST API 엔드포인트
    │   ├── RobotController.java         # GET /api/robots         - 전체 로봇 목록
    │   │                                # GET /api/robots/{key}   - 특정 로봇 상태
    │   │
    │   ├── RobotCommandController.java  # POST /api/robots/{id}/command/move  - 이동 명령
    │   │                                # POST /api/robots/{id}/command/stop  - 긴급 정지
    │   │                                # @ConditionalOnProperty(mock.enabled=false)
    │   │                                # Mock 모드에서는 비활성화
    │   │
    │   ├── MissionController.java       # GET  /api/missions           - 미션 목록
    │   │                                # GET  /api/missions/{id}      - 상세 (센서로그+생존자)
    │   │                                # POST /api/missions/start     - 미션 시작
    │   │                                # POST /api/missions/{id}/end  - 미션 종료
    │   │
    │   └── SurvivorController.java      # GET /api/survivors               - 전체 생존자
    │                                    # GET /api/survivors/mission/{id}  - 미션별 생존자
    │
    └── websocket/
        └── WebSocketPublisher.java      # STOMP 브로드캐스트
                                         # broadcastSensor(): /topic/sensors/{robotId}
                                         # broadcastAlert():  /topic/alert/{robotId}
```

---

## 모드 전환 (application.yml 한 줄)

| 설정 | 동작 |
|------|------|
| `mock.enabled: true` | MockSensorScheduler 활성화, MqttSubscriber/RobotCommandController 비활성화 |
| `mock.enabled: false` | MqttSubscriber/RobotCommandController 활성화, Mock 스케줄러 비활성화 |

---

## Dead Reckoning 설계 (GPS 미사용)

```
라즈베리파이
└── 자이로 센서 (MPU-6050 등)
    └── gyroZ (yaw 각속도, deg/s) ──→ 백엔드 → WebSocket → 프론트

프론트 (useDeadReckoning.js)
└── gyroZ × dt(s) → heading 변화량 누적
    └── heading + speed × dt → (x, y) 좌표 추정
        └── DeadReckoningMap.jsx (Canvas) → 이동 궤적 시각화

캘리브레이션
└── 로봇 시작 전 "원점 리셋" 버튼 클릭 → (x=0, y=0, heading=0) 초기화
```

---

## DB 테이블 관계

```
robots (1) ──── (N) missions (1) ──── (N) sensor_logs
                              └── (N) survivor_marks
```

---

## WebSocket 구독 토픽 (React 프론트)

| 토픽 | 주기 | 내용 |
|------|------|------|
| `/topic/sensors/robot-01` | 1초 | 자이로, 거리, 열화상, 가스, 소리, AI 생존율 |
| `/topic/alert/robot-01` | 즉시 | 생존자 감지 이벤트, 생존율, 트리거 센서 |

### API 사용법

**로그인**

bash

```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin1234"}'
```

응답:

json

```json
{
  "token": "eyJhbGciOiJIUzI1NiJ9...",
  "username": "admin",
  "role": "ADMIN",
  "expiresIn": 86400000
}
```

**이후 API 호출 시 헤더에 토큰 포함**

bash

```bash
curl http://localhost:8080/api/robots \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9..."
```

**회원가입**

bash

```bash
curl -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"operator1","password":"pass1234","role":"OPERATOR"}'
```

---

### React에서 사용하는 방법

로그인 후 토큰을 저장하고 모든 API 요청에 포함시키면 됩니다.

javascript

```javascript
// 로그인
const res = await fetch('http://localhost:8080/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ username: 'admin', password: 'admin1234' })
});
const { token } = await res.json();
localStorage.setItem('token', token);

// 이후 API 호출
const robots = await fetch('http://localhost:8080/api/robots', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
});
```

---

## Database Schema

### 1. `users` (User Accounts)
| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| **id** | BIGINT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| **username** | VARCHAR(50) | NOT NULL, UNIQUE | 사용자 계정 ID |
| **password** | VARCHAR(255) | NOT NULL | 암호화된 비밀번호 (BCrypt) |
| **role** | VARCHAR(10) | DEFAULT 'OPERATOR' | 사용자 권한 (ADMIN, OPERATOR) |
| **created_at** | DATETIME | DEFAULT CURRENT_TIMESTAMP | 계정 생성 일시 |

### 2. `robots` (Robot Management)
| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| **id** | BIGINT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| **robot_key** | VARCHAR(50) | NOT NULL, UNIQUE | 로봇 고유 식별 키 (MQTT Topic용) |
| **status** | VARCHAR(20) | DEFAULT 'OFFLINE' | 현재 상태 (ONLINE, OFFLINE, ERROR) |
| **last_seen_at** | DATETIME | | 마지막 통신 확인 시간 |
| **created_at** | DATETIME | DEFAULT CURRENT_TIMESTAMP | 로봇 등록 일시 |

### 3. `missions` (Mission History)
| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| **id** | BIGINT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| **robot_id** | BIGINT | FOREIGN KEY (robots.id) | 투입된 로봇 ID |
| **user_id** | BIGINT | FOREIGN KEY (users.id) | 미션 담당 운영자 ID |
| **area_name** | VARCHAR(255) | | 수색 구역 명칭 |
| **status** | VARCHAR(20) | CHECK (Status) | 미션 진행 상태 (IN_PROGRESS, COMPLETED, ABORTED) |
| **started_at** | DATETIME | DEFAULT CURRENT_TIMESTAMP | 미션 시작 시간 |
| **ended_at** | DATETIME | | 미션 종료 시간 |

### 4. `sensor_logs` (Real-time Sensor Data)
| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| **id** | BIGINT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| **mission_id** | BIGINT | FOREIGN KEY (missions.id) | 연결된 미션 ID |
| **gas_level** | DOUBLE | | 가스 농도 수치 |
| **front_distance**| INT | | 전방 장애물 거리 (cm) |
| **heading** | DOUBLE | | 로봇 현재 방향 (각도) |
| **speed** | DOUBLE | | 로봇 이동 속도 |
| **posX** | DOUBLE | | 맵 기준 X 좌표 |
| **posY** | DOUBLE | | 맵 기준 Y 좌표 |
| **timestamp** | DATETIME | DEFAULT CURRENT_TIMESTAMP | 데이터 수신 시간 |

### 5. `survivor_marks` (Detection History)
| Field | Type | Constraints | Description |
| :--- | :--- | :--- | :--- |
| **id** | BIGINT | PRIMARY KEY, AUTO_INCREMENT | 고유 식별자 |
| **mission_id** | BIGINT | FOREIGN KEY (missions.id) | 탐지 당시 미션 ID |
| **survival_rate** | DOUBLE | | 탐지된 생존자 확률 (%) |
| **detected_at** | DATETIME | DEFAULT CURRENT_TIMESTAMP | 생존자 탐지 시간 |
| **posX** | DOUBLE | | 탐지 지점 X 좌표 |
| **posY** | DOUBLE | | 탐지 지점 Y 좌표 |
| **heading** | DOUBLE | | 탐지 당시 로봇 방향 |
