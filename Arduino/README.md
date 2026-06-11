# Arduino
Arduino Control
```
React (WASD 입력)
    │ WebSocket
    ▼
Spring 백엔드
    │ MQTT
    ▼
라즈베리파이
    ├── app.py             (MQTT, 센서 중계, 카메라 스트리밍)
    ├── gait.py            (역기구학 보행패턴 시퀀서)
    └── serial_protocol.py (ACK/NACK 직렬 프로토콜)
         │ Serial (ARES/1)
         ▼
아두이노 (Mega)
    └── main/main.ino  (JSON 파싱 → PCA9685 PWM + 센서 데이터 출력)
         │ I2C
         ├── PCA9685 (0x41) → 왼쪽 다리 9개 서보
         └── PCA9685 (0x40) → 오른쪽 다리 9개 서보
```
```
앞
   1         2
  (L)       (R)
   3         4
  (L)       (R)
   5         6
  (L)       (R)
        뒤

PCA9685 0x41 (왼쪽: 1,3,5번 다리)
CH  0: 다리1 Coxa   CH  1: 다리1 Femur   CH  2: 다리1 Tibia
CH  3: 다리3 Coxa   CH  4: 다리3 Femur   CH  5: 다리3 Tibia
CH  6: 다리5 Coxa   CH  7: 다리5 Femur   CH  8: 다리5 Tibia

PCA9685 0x40 (오른쪽: 2,4,6번 다리)
CH  0: 다리2 Coxa   CH  1: 다리2 Femur   CH  2: 다리2 Tibia
CH  3: 다리4 Coxa   CH  4: 다리4 Femur   CH  5: 다리4 Tibia
CH  6: 다리6 Coxa   CH  7: 다리6 Femur   CH  8: 다리6 Tibia
```
`main/main.ino`가 최종 업로드용 스케치입니다.

## ARES/1 직렬 프로토콜

모든 메시지는 ASCII 한 줄이며 `\n`으로 끝납니다.

```text
Pi -> Arduino  HELLO:ARES/1
Arduino -> Pi  ACK:HELLO:ARES/1

Pi -> Arduino  CMD:<seq>:STOP
Arduino -> Pi  ACK:CMD:<seq>

Pi -> Arduino  FRAME:<seq>:{"L":[...],"R":[...]}
Arduino -> Pi  ACK:FRAME:<seq>

Pi -> Arduino  PING:<seq>
Arduino -> Pi  ACK:PING:<seq>

Arduino -> Pi  SENSOR:{...}
Arduino -> Pi  NACK:<type>:<seq>:<reason>
```

Arduino는 1초 동안 명령, 각도 프레임 또는 PING을 받지 못하면 WALK 상태를
포함해 즉시 기본 서기 자세로 전환하고 다음 요청 전에 새 HELLO를 요구합니다.

`examples/ARES_test/ARES_test.ino`는 걷기 동작을 확인하는 독립 테스트
스케치입니다. 두 스케치를 별도 폴더에 두어 `setup()`과 `loop()`가 중복
컴파일되지 않도록 구성했습니다.
