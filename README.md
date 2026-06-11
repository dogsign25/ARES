# ARES

ARES는 재난 현장에서 육각 보행 로봇을 원격 제어하고, 카메라와 환경 센서로
현장을 관제하기 위한 통합 구조 시스템입니다. 운영자는 웹 화면에서 미션과
로봇을 배정하고 실시간 상태를 확인하며, 관리자는 미션·로봇·사용자 승인을
관리할 수 있습니다.

## 주요 기능

- 미션 및 작업 구역 생성, 배정, 완료·중단 처리
- 관리자와 현장 운영자 역할 기반 인증(JWT)
- 육각 보행 로봇 전진·후진·좌회전·우회전·정지 제어
- MQTT 기반 로봇 명령 및 센서 데이터 송수신
- STOMP WebSocket 기반 실시간 센서 모니터링
- Raspberry Pi 카메라 MJPEG 스트리밍과 선택적 YOLO 추론
- 생존자 감지 결과 및 센서 이력 저장
- Raspberry Pi 없이 개발할 수 있는 백엔드 Mock 센서 모드

## 시스템 구성

```text
React (5173)
  ├── REST/JWT ────────────────┐
  ├── STOMP WebSocket          │
  └── MJPEG video              │
                               ▼
                        Spring Boot (8086)
                          ├── MySQL (3306)
                          └── MQTT (1883)
                               │
                               ▼
                      Raspberry Pi (5000)
                       ├── Camera / YOLO
                       ├── Sensor publish
                       └── ARES/1 Serial
                               │
                               ▼
                       Arduino Mega 2560
                               │
                     PCA9685 x 2 / Servo x 18
```

로봇 명령은 `Spring Boot → MQTT → Raspberry Pi → Serial → Arduino` 순서로
전달됩니다. 센서 데이터는 반대 방향으로 전달되어 DB에 저장되고 WebSocket을
통해 프런트엔드에 방송됩니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| Frontend | React 19, Vite 8, React Router, Axios, STOMP/SockJS, Leaflet |
| Backend | Java 21, Spring Boot 3.2.5, Spring Security, JPA, WebSocket |
| Messaging | Eclipse Paho MQTT, Spring Integration MQTT, Mosquitto |
| Database | MySQL 8 |
| Edge | Python, Flask, Picamera2, OpenCV, PySerial, Ultralytics YOLO |
| Firmware | Arduino Mega 2560, PCA9685, ArduinoJson |

## 디렉터리 구조

```text
ARES/
├── Front-End/
│   ├── ares-frontend/       # React 관제 웹 애플리케이션
│   └── ares-server/         # PC 웹캠용 간이 영상 서버
├── Back-End/
│   └── ares-server/         # Spring Boot API, MQTT, WebSocket 서버
├── RaspberryPi/             # 카메라, MQTT, 보행 및 직렬 통신
├── Arduino/
│   ├── main/                # 최종 로봇 제어 펌웨어
│   └── examples/            # 서보 및 보행 테스트 스케치
├── Database/                # JPA 엔티티 기준 MySQL 스키마
└── wiki/                    # 구현 변경 및 연동 기록
```

## 시작하기

### 요구 사항

- Node.js 20 이상, npm
- JDK 21
- MySQL 8
- 실제 로봇 연동 시 Mosquitto MQTT broker
- Raspberry Pi OS 및 Python 3
- Arduino Mega 2560, PCA9685 모듈 2개

### 1. 데이터베이스 준비

MySQL에서 데이터베이스를 생성합니다.

```sql
CREATE DATABASE ares_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_0900_ai_ci;
```

그다음
`Back-End/ares-server/src/main/resources/application.yml`의 MySQL 계정 정보를
로컬 환경에 맞게 수정합니다. 기본 설정은 `ddl-auto: update`이므로 백엔드를
실행하면 JPA가 필요한 테이블을 생성합니다.

고정 스키마가 필요한 경우 `Database/`의 SQL을 `users → robots → missions →
zones → sensor_logs → survivor_marks` 순서로 적용할 수 있습니다.

### 2. 백엔드 실행

하드웨어와 MQTT broker 없이 UI와 API를 개발할 때는 Mock 모드를 사용합니다.

```bash
cd Back-End/ares-server
./gradlew bootRun --args='--mock.enabled=true'
```

실제 로봇과 연결할 때는 Mosquitto를 먼저 실행한 후 다음과 같이 시작합니다.

```bash
cd Back-End/ares-server
ARES_MQTT_BROKER_URL=tcp://localhost:1883 ./gradlew bootRun
```

백엔드 주소는 `http://localhost:8086`이며, 최초 실행 시 개발용 관리자 계정
`admin / admin`이 자동 생성됩니다. 실제 배포 전에는 기본 계정, DB 비밀번호,
JWT secret을 반드시 변경해야 합니다.

### 3. 프런트엔드 실행

```bash
cd Front-End/ares-frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:5173`으로 접속합니다.

다른 장비의 서버를 사용할 때는 실행 전에 주소를 지정합니다.

```bash
VITE_BACKEND_URL=http://<backend-ip>:8086 \
VITE_VIDEO_URL=http://<raspberry-pi-ip>:5000/video_feed \
npm run dev
```

### 4. Raspberry Pi 실행

Raspberry Pi 전용 카메라 패키지인 `Picamera2`가 필요합니다. Python 환경에
Flask, flask-cors, paho-mqtt, OpenCV, pyserial을 설치하고, YOLO를 사용할
경우에만 ultralytics를 추가로 설치합니다.

`RaspberryPi/ares.env` 파일 또는 셸 환경변수로 장비 설정을 지정할 수 있습니다.

```bash
ARES_MQTT_BROKER=<broker-ip>
ARES_MQTT_PORT=1883
ARES_ROBOT_ID=robot-01
ARES_SERIAL_PORT=/dev/ttyACM0
ARES_ENABLE_GAIT=true
ARES_FAKE_SENSORS=false
ARES_ENABLE_YOLO=false
```

```bash
python3 RaspberryPi/app.py
```

상태 확인은 `http://<raspberry-pi-ip>:5000/health`, 영상 스트림은
`http://<raspberry-pi-ip>:5000/video_feed`에서 할 수 있습니다.

### 5. Arduino 업로드

Arduino IDE 또는 Arduino CLI에서 보드를 `Arduino Mega 2560`으로 선택하고
ArduinoJson 라이브러리를 설치한 뒤 `Arduino/main/main.ino`를 업로드합니다.

Raspberry Pi와 Arduino는 115200 baud의 `ARES/1` 프로토콜을 사용합니다.
Arduino는 통신이 1초 이상 끊기면 기본 서기 자세로 복귀하고 새 핸드셰이크를
요구합니다.

## 주요 포트 및 토픽

| 용도 | 주소 또는 토픽 |
| --- | --- |
| Frontend | `http://localhost:5173` |
| Backend API | `http://localhost:8086/api` |
| WebSocket | `http://localhost:8086/ws` |
| Raspberry Pi video | `http://<pi-ip>:5000/video_feed` |
| MQTT sensor | `hexapod/{robotId}/sensors` |
| MQTT alert | `hexapod/{robotId}/alert` |
| MQTT status | `hexapod/{robotId}/status` |
| MQTT command | `hexapod/{robotId}/command` |

## 테스트 및 빌드

```bash
# Backend
cd Back-End/ares-server
./gradlew test

# Frontend
cd Front-End/ares-frontend
npm run lint
npm run build

# Raspberry Pi serial protocol
python3 -m unittest RaspberryPi/test_serial_protocol.py
```

## 관련 문서

- [프런트엔드 사용자 매뉴얼](Front-End/README.md)
- [백엔드 아키텍처](Back-End/README.md)
- [Arduino 배선 및 직렬 프로토콜](Arduino/README.md)
- [하드웨어 연동 변경 기록](wiki/implementation-changes.md)

## 주의 사항

- 현재 설정 파일에는 개발용 DB 인증정보와 JWT secret이 포함되어 있습니다.
  외부 배포 시 환경변수나 별도 비밀 저장소로 분리해야 합니다.
- `mock.enabled=true`에서는 실제 MQTT 센서 구독과 로봇 명령 API가 비활성화됩니다.
- 로봇을 움직이기 전에 서보 방향, 오프셋, PWM 범위를 실제 하드웨어에 맞게
  캘리브레이션하고 비상 정지 동작을 먼저 확인하세요.
- 백엔드 CORS 허용 대역은 개발 환경 중심으로 설정되어 있으므로 배포 환경의
  프런트엔드 주소에 맞게 조정해야 합니다.
