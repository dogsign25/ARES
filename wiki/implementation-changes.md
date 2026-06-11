# ARES Implementation Changes

작성일: 2026-05-29

이 문서는 백엔드, 라즈베리파이, 아두이노 연동을 위해 지금까지 수정한 내용을 정리한다. 프론트엔드는 최대한 건드리지 않는 방향으로 진행했다.

## 1. 백엔드 수정

### 테스트/빌드 안정화

- `Back-End/ares-server/build.gradle`
  - `spring-boot-starter-test`를 추가했다.
  - Gradle 9 계열에서 JUnit Platform을 찾지 못하는 문제를 막기 위해 `junit-platform-launcher`를 추가했다.
  - `test { useJUnitPlatform() }` 설정을 추가했다.

- `Back-End/ares-server/src/test/java/com/hexapodserver/HexapodServerApplicationTests.java`
  - 테스트 패키지를 실제 애플리케이션 패키지인 `com.ares`로 맞췄다.

검증:

```bash
cd Back-End/ares-server
./gradlew test
```

결과: `BUILD SUCCESSFUL`

### MQTT mock 모드 처리

- `Back-End/ares-server/src/main/java/com/ares/config/MqttConfig.java`
  - `mock.enabled=true`일 때 MQTT inbound adapter가 브로커 연결을 시도하지 않도록 조건을 추가했다.
  - 실제 라즈베리파이 MQTT 수신을 사용하려면 `mock.enabled=false`가 필요하다.

- `Back-End/ares-server/src/main/resources/application.yml`
  - logging package를 `com.hexapod`에서 실제 패키지인 `com.ares`로 수정했다.

### 로봇 제어 명령 검증

- `Back-End/ares-server/src/main/java/com/ares/controller/RobotCommandController.java`
  - 기존에는 request body를 그대로 MQTT로 발행했지만, 이제 허용된 명령만 통과시킨다.
  - 허용 명령:
    - `WALK`
    - `BACKWARD`
    - `TURN_LEFT`
    - `TURN_RIGHT`
    - `STOP`
  - alias 처리:
    - `FORWARD`, `W` -> `WALK`
    - `BACK`, `REVERSE`, `S` -> `BACKWARD`
    - `LEFT`, `A` -> `TURN_LEFT`
    - `RIGHT`, `D` -> `TURN_RIGHT`
    - `IDLE`, `EMERGENCY_STOP` -> `STOP`
  - invalid command는 `400 Bad Request`를 반환한다.
  - MQTT로 나가는 payload는 `gait`와 `requestedAt` 중심으로 재구성한다.
  - `/stop`은 항상 emergency stop payload를 발행한다.

예시:

```json
{
  "gait": "WALK",
  "requestedAt": "ISO-8601 timestamp"
}
```

## 2. 라즈베리파이 수정

### MQTT sensor publish 형식 정리

- `RaspberryPi/app.py`
  - 센서 topic을 백엔드 구독 형식에 맞췄다.

```text
hexapod/{robotId}/sensors
```

  - sensor payload를 백엔드 `SensorDataDto`와 맞는 중첩 JSON 구조로 변경했다.
  - 환경변수로 주요 설정을 바꿀 수 있게 했다.

```bash
ARES_MQTT_BROKER=localhost
ARES_ROBOT_ID=robot-01
ARES_ENABLE_GAIT=true
```

### 백엔드 command subscribe 추가

- `RaspberryPi/app.py`
  - 백엔드가 발행하는 command topic을 구독한다.

```text
hexapod/{robotId}/command
```

  - `RobotMotionController`를 추가했다.
  - 수신한 명령을 정규화한 뒤 `TripodGait`에 전달한다.
  - 지원 명령:
    - `WALK`
    - `BACKWARD`
    - `TURN_LEFT`
    - `TURN_RIGHT`
    - `STOP`
  - 최종 실행 진입점은 `app.py` 하나로 정리했다.

권장 실행:

```bash
ARES_MQTT_BROKER=<broker-ip> \
ARES_ROBOT_ID=robot-01 \
ARES_SERIAL_PORT=/dev/ttyUSB0 \
python3 RaspberryPi/app.py
```

### IK/gait 안전성 및 프로토콜 정리

- `RaspberryPi/IK.py`
  - coxa는 다리 기준 절대 방향각으로 계산하도록 범위를 확장했다.
  - `gait.py`에서 다리별 기본 방향각을 빼 상대 coxa 명령으로 변환한다.
  - `NaN`, `inf`, `D=0` 방어를 추가했다.
  - femur 계산 부호를 수정해 기본 자세가 `None`이 되던 문제를 해결했다.

- `RaspberryPi/gait.py`
  - `Arduino/main.ino`가 받는 JSON 시리얼 프레임으로 송신한다.

```json
{
  "L": [[c, f, t], [c, f, t], [c, f, t]],
  "R": [[c, f, t], [c, f, t], [c, f, t]]
}
```

  - coxa는 다리별 기본 방향 대비 상대각으로 변환한다.
  - IK 결과가 없거나 안전 범위를 벗어나면 프레임을 보내지 않고 보행을 중단한다.
  - `ARES_SERIAL_PORT` 환경변수로 시리얼 포트를 지정할 수 있다.
  - 단독 실행 시 10보 보행 테스트를 제거하고, 기립 자세 진단만 수행하도록 바꿨다.

## 3. 아두이노 수정

### `Arduino/main.ino`

- 라즈베리파이에서 보내는 JSON 프레임을 파싱해 PCA9685 두 개로 18개 서보를 제어한다.
- 관절별 안전 범위를 추가했다.

```text
coxa:  -60 ~ 60
femur: -90 ~ 90
tibia: -150 ~ 0
```

- 기존의 단순 `angle + 90` 변환 대신 관절별 논리 각도 범위에 맞춰 PWM으로 매핑한다.
- JSON 구조 검증을 추가했다.
- 잘못된 프레임, 각도 범위 초과, 너무 긴 프레임을 거부한다.
- 시리얼 타임아웃 시 기본 자세로 복귀한다.

### 시리얼 핸드셰이크

아두이노와 라즈베리파이 사이의 시작 순서를 명확히 하기 위해 핸드셰이크를 추가했다.

흐름:

```text
Arduino boot
  -> ARES_READY

RaspberryPi
  -> HELLO

Arduino
  -> ACK:HELLO

RaspberryPi
  -> JSON gait frames
```

- 핸드셰이크 전 JSON 명령은 `NACK:NO_HANDSHAKE`로 거부한다.
- 라즈베리파이가 `ARES_READY`를 놓쳤을 경우를 대비해 아두이노가 일정 시간마다 `ARES_READY`를 재송신한다.

### `Arduino/ARES.ino`

- 테스트용 보행 코드가 전원 인가 직후 계속 걷지 않도록 수정했다.
- 시리얼로 `W`를 받을 때만 걷고, `S`를 받으면 기본 자세로 돌아간다.

## 4. Arduino CLI 컴파일 검증

`arduino-cli`는 PATH에 없었고 VS Code 확장 저장소 안에 있었다.

```text
/home/dogsign25/.config/Code/User/globalStorage/oakiot.vscode-arduino-cli/arduino-cli/arduino-cli
```

`ArduinoJson` 라이브러리가 없어 처음 컴파일이 실패했고, `ArduinoJson@7.4.3`을 설치한 뒤 성공했다.

검증 결과:

```text
Arduino Mega 2560: compile success
Sketch uses 17856 bytes (7%)
Global variables use 860 bytes (10%)
```

```text
Arduino Uno: compile success
Sketch uses 17082 bytes (52%)
Global variables use 860 bytes (41%)
```

주의:

- 현재 `Arduino/` 폴더에는 `main.ino`와 `ARES.ino`가 함께 있다.
- Arduino CLI는 폴더명과 같은 `.ino` 파일을 메인 스케치로 기대하므로, 업로드용으로는 아래처럼 분리하는 것이 안전하다.

```text
Arduino/main/main.ino
Arduino/ARES/ARES.ino
```

## 5. 현재 통신 구조

```text
Backend
  POST /api/robots/{robotId}/command/move
  POST /api/robots/{robotId}/command/stop
        |
        v
MQTT publish
  hexapod/{robotId}/command
        |
        v
RaspberryPi/app.py
  command subscribe
  RobotMotionController
        |
        v
RaspberryPi/gait.py
  IK -> JSON serial frame
        |
        v
Arduino/main.ino
  JSON validate
  PCA9685 servo control
```

센서 방향:

```text
RaspberryPi/app.py
        |
        v
MQTT publish
  hexapod/{robotId}/sensors
        |
        v
Back-End MqttSubscriber
        |
        v
SensorService -> DB/WebSocket
```

## 6. 남은 작업

- 백엔드 실기기용 profile 분리:
  - `mock.enabled=false`
  - MQTT broker 주소 외부화
- DB SQL과 JPA Entity 불일치 정리
- DB 비밀번호와 JWT secret 환경변수화
- 라즈베리파이 실제 장비에서 다음 end-to-end 테스트:
  - backend command -> MQTT -> RaspberryPi -> Serial handshake -> Arduino -> servo
- 실제 서보 방향, offset, PWM min/max 캘리브레이션
- `Arduino/` 스케치 폴더 구조 정리
