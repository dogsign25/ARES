import cv2
import json
import os
import time
import threading
from pathlib import Path
import paho.mqtt.client as mqtt
from flask import Flask, Response
from flask_cors import CORS
from picamera2 import Picamera2


def load_local_env():
    env_path = Path(__file__).with_name("ares.env")
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


load_local_env()

from gait import MotionCancelled, TripodGait, connect_serial
from serial_protocol import SerialProtocol, SerialProtocolError

app = Flask(__name__)
CORS(app)

ENABLE_YOLO = os.getenv("ARES_ENABLE_YOLO", "false").lower() in ("1", "true", "yes")
model = None
if ENABLE_YOLO:
    from ultralytics import YOLO
    model = YOLO('yolov8n.pt')

picam2 = Picamera2()
config = picam2.create_video_configuration(
    main={"size": (640, 480)}
)
picam2.configure(config)
picam2.start()

# MQTT
MQTT_BROKER = os.getenv("ARES_MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("ARES_MQTT_PORT", "1883"))
ROBOT_ID = os.getenv("ARES_ROBOT_ID", "robot-01")
ENABLE_GAIT = os.getenv("ARES_ENABLE_GAIT", "false").lower() not in ("0", "false", "no")
ENABLE_FAKE_SENSORS = os.getenv("ARES_FAKE_SENSORS", "false").lower() in ("1", "true", "yes")
MQTT_TOPIC_SENSORS = f"hexapod/{ROBOT_ID}/sensors"
MQTT_TOPIC_COMMANDS = f"hexapod/{ROBOT_ID}/command"
MQTT_TOPIC_STATUS = f"hexapod/{ROBOT_ID}/status"
mqtt_client = mqtt.Client()
mqtt_connected = threading.Event()

if MQTT_BROKER in {"localhost", "127.0.0.1"}:
    print(
        "[MQTT] 경고: 브로커가 localhost로 설정됨. "
        "Spring 백엔드와 Mosquitto가 다른 PC에 있다면 "
        "ARES_MQTT_BROKER=<백엔드_PC_IP>로 실행해야 합니다."
    )


class RobotMotionController:
    def __init__(self, enabled=True):
        self.enabled = enabled
        self.serial = None
        self.protocol = None
        self.gait = None
        self.command = "STOP"
        self.condition = threading.Condition()
        self.cancel_motion = threading.Event()
        self.running = False

    def start(self):
        try:
            self.serial = connect_serial()
        except Exception as exc:
            print(f"[Robot] 아두이노 시리얼 연결 실패: {exc}")
            return

        self.protocol = SerialProtocol(
            self.serial,
            sensor_callback=self._handle_sensor_data,
        )
        try:
            self.protocol.start()
        except SerialProtocolError as exc:
            print(f"[Robot] Arduino handshake 실패: {exc}")
            self.protocol.close()
            self.serial.close()
            self.serial = None
            self.protocol = None
            return

        if not self.enabled:
            self._send_direct_command("STAND")
            print("[Robot] 서기 전용 모드: 보행 명령은 무시하고 STAND/STOP만 전달")
            return

        self.gait = TripodGait(
            self.protocol,
            should_cancel=self.cancel_motion.is_set,
        )
        self.running = True
        threading.Thread(target=self._run, daemon=True).start()
        print("[Robot] 보행 제어 worker 시작")

    def set_command(self, command):
        normalized = normalize_command(command)
        if normalized is None:
            print(f"[Robot] 알 수 없는 명령 무시: {command}")
            return

        if not self.enabled:
            if normalized == "STOP":
                self._send_direct_command("STOP")
            else:
                self._send_direct_command("STAND")
                print(f"[Robot] 서기 전용 모드에서 보행 명령 차단: {normalized}")
            return

        self.cancel_motion.set()
        with self.condition:
            self.command = normalized
            self.condition.notify_all()
        if normalized == "STOP":
            self._send_direct_command("STOP")
        print(f"[Robot] 명령 설정: {normalized}")

    def _send_direct_command(self, command):
        if self.protocol is None:
            print(f"[Robot] 시리얼 미연결로 직접 명령 전송 실패: {command}")
            return
        try:
            self.protocol.send_command(command)
            print(f"[Robot] Arduino 직접 명령 전송: {command}")
        except SerialProtocolError as exc:
            print(f"[Robot] Arduino 직접 명령 실패: {command} - {exc}")

    def _run(self):
        last_stopped = False
        while self.running:
            with self.condition:
                command = self.command
                if command == "STOP" and last_stopped:
                    self.condition.wait()
                    continue
                self.cancel_motion.clear()

            try:
                if command == "STOP":
                    self.gait.stand()
                    last_stopped = True
                elif command == "WALK":
                    self.gait.step(direction=1.0)
                    last_stopped = False
                elif command == "BACKWARD":
                    self.gait.step(direction=-1.0)
                    last_stopped = False
                elif command == "TURN_LEFT":
                    self.gait.turn(clockwise=False)
                    last_stopped = False
                elif command == "TURN_RIGHT":
                    self.gait.turn(clockwise=True)
                    last_stopped = False
            except MotionCancelled:
                last_stopped = False
            except Exception as exc:
                print(f"[Robot] 명령 실행 실패: {exc}")
                with self.condition:
                    self.command = "STOP"
                last_stopped = False

    def _handle_sensor_data(self, data):
        publish_sensor_data(normalize_sensor_payload(data))


def normalize_command(command):
    if command is None:
        return None

    value = str(command).strip().upper()
    aliases = {
        "FORWARD": "WALK",
        "W": "WALK",
        "BACK": "BACKWARD",
        "REVERSE": "BACKWARD",
        "S": "BACKWARD",
        "LEFT": "TURN_LEFT",
        "A": "TURN_LEFT",
        "RIGHT": "TURN_RIGHT",
        "D": "TURN_RIGHT",
        "IDLE": "STOP",
        "EMERGENCY_STOP": "STOP",
    }
    value = aliases.get(value, value)
    return value if value in {"WALK", "BACKWARD", "TURN_LEFT", "TURN_RIGHT", "STOP"} else None


robot_motion = RobotMotionController(enabled=ENABLE_GAIT)


def normalize_sensor_payload(data):
    sensor_data = dict(data)
    sensor_data["robotId"] = ROBOT_ID
    sensor_data["timestamp"] = int(time.time() * 1000)

    return sensor_data


def publish_sensor_data(sensor_data):
    if not mqtt_connected.is_set():
        print(
            f"[MQTT] 센서 발행 실패: 브로커 {MQTT_BROKER}:{MQTT_PORT}에 연결되지 않음"
        )
        return False

    result = mqtt_client.publish(
        MQTT_TOPIC_SENSORS,
        json.dumps(sensor_data, separators=(",", ":")),
        qos=1,
    )
    if result.rc != mqtt.MQTT_ERR_SUCCESS:
        print(f"[MQTT] 센서 발행 실패: rc={result.rc}, topic={MQTT_TOPIC_SENSORS}")
        return False

    print(f"[MQTT] Sensor sent: topic={MQTT_TOPIC_SENSORS} data={sensor_data}")
    return True


def extract_command(payload):
    try:
        data = json.loads(payload)
    except json.JSONDecodeError:
        return payload

    for key in ("gait", "command", "action", "direction"):
        if key in data:
            return data[key]
    return None

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        mqtt_connected.set()
        print(f"[MQTT] 브로커 연결 성공: {MQTT_BROKER}:{MQTT_PORT}")
        client.publish(MQTT_TOPIC_STATUS, '{"status":"ONLINE"}', qos=1, retain=True)
        client.subscribe(MQTT_TOPIC_COMMANDS, qos=1)
        print(f"[MQTT] Command subscribe: {MQTT_TOPIC_COMMANDS}")
    else:
        mqtt_connected.clear()
        print(f"[MQTT] 브로커 연결 실패: rc={rc}, broker={MQTT_BROKER}:{MQTT_PORT}")


def on_disconnect(client, userdata, rc):
    mqtt_connected.clear()
    print(f"[MQTT] 브로커 연결 끊김: rc={rc}")


def on_message(client, userdata, msg):
    payload = msg.payload.decode("utf-8", errors="ignore")
    print(f"[MQTT] Received: topic={msg.topic} payload={payload}")

    if msg.topic == MQTT_TOPIC_COMMANDS:
        robot_motion.set_command(extract_command(payload))

mqtt_client.will_set(
    MQTT_TOPIC_STATUS,
    payload='{"status":"OFFLINE"}',
    qos=1,
    retain=True,
)
mqtt_client.reconnect_delay_set(min_delay=1, max_delay=30)
mqtt_client.on_connect = on_connect
mqtt_client.on_disconnect = on_disconnect
mqtt_client.on_message = on_message
try:
    print(f"[MQTT] 브로커 연결 시도: {MQTT_BROKER}:{MQTT_PORT}")
    mqtt_client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()
except Exception as exc:
    print(f"[MQTT] 브로커 연결 예외: {MQTT_BROKER}:{MQTT_PORT} - {exc}")


def send_fake_sensors():
    import random
    while True:
        sensor_data = {
            "robotId": ROBOT_ID,
            "timestamp": int(time.time() * 1000),
            "gyro": {
                "gyroZ": round(random.uniform(-5, 5), 2),
                "gyroX": 0.0,
                "gyroY": 0.0,
                "accelX": round(random.uniform(0, 1), 2),
                "accelY": 0.0,
                "speed": round(random.uniform(0.5, 1.2), 2)
            },
            "distance": {
                "front": random.randint(30, 200),
                "left": random.randint(30, 200),
                "right": random.randint(30, 200)
            },
            "thermal": {
                "maxTemp": round(random.uniform(24, 38), 1)
            },
            "gas": {
                "level": round(random.uniform(5, 60), 1)
            },
            "sound": {
                "level": round(random.uniform(35, 80), 1)
            },
            "ai": {
                "survivalRate": round(random.uniform(0.1, 0.9), 2)
            }
        }
        
        
        publish_sensor_data(sensor_data)
        time.sleep(1)

if ENABLE_FAKE_SENSORS:
    threading.Thread(target=send_fake_sensors, daemon=True).start()

class VideoStream:
    def __init__(self):
        self.condition = threading.Condition()
        self.latest_frame = None
        self.frame_id = 0
        self.running = False
        self.yolo_enabled = model is not None

    def start(self):
        with self.condition:
            if self.running:
                return
            self.running = True
        threading.Thread(target=self._capture_loop, daemon=True).start()
        print("[Video] 카메라/YOLO worker 시작")

    def _capture_loop(self):
        while self.running:
            try:
                frame = picam2.capture_array()
                frame = frame[:, :, :3]
                frame = frame[:, :, ::-1]
                annotated_frame = frame
                if self.yolo_enabled:
                    try:
                        results = model(
                            frame,
                            imgsz=320,
                            conf=0.5,
                            device='cpu',
                            verbose=False
                        )
                        annotated_frame = results[0].plot()
                    except Exception as exc:
                        self.yolo_enabled = False
                        print(f"[Video] YOLO 비활성화 후 원본 영상 송출: {exc}")
                encoded, buffer = cv2.imencode('.jpg', annotated_frame)
                if not encoded:
                    continue

                with self.condition:
                    self.latest_frame = buffer.tobytes()
                    self.frame_id += 1
                    self.condition.notify_all()
            except Exception as exc:
                print(f"[Video] 프레임 처리 실패: {exc}")
                time.sleep(0.5)

    def generate(self):
        last_frame_id = -1
        try:
            while True:
                with self.condition:
                    self.condition.wait_for(
                        lambda: self.latest_frame is not None
                        and self.frame_id != last_frame_id
                    )
                    frame_bytes = self.latest_frame
                    last_frame_id = self.frame_id

                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n'
                       + frame_bytes + b'\r\n')
        except GeneratorExit:
            print("[Video] 클라이언트 스트림 연결 종료")


video_stream = VideoStream()


@app.route('/video_feed')
def video_feed():
    video_stream.start()
    return Response(
        video_stream.generate(),
        mimetype='multipart/x-mixed-replace; boundary=frame',
        headers={
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            "Pragma": "no-cache",
        }
    )


@app.route('/health')
def health():
    serial_connected = (
        robot_motion.serial is not None
        and bool(getattr(robot_motion.serial, "is_open", False))
    )
    arduino_handshake = (
        robot_motion.protocol is not None
        and robot_motion.protocol.handshake_complete.is_set()
    )
    return {
        "status": "ok",
        "camera": bool(getattr(picam2, "started", True)),
        "videoWorker": video_stream.running,
        "yolo": video_stream.yolo_enabled,
        "serialConnected": serial_connected,
        "arduinoHandshake": arduino_handshake,
    }


if __name__ == "__main__":
    robot_motion.start()
    print("Flask 서버 실행 중...")
    app.run(host='0.0.0.0', port=5000, threaded=True)
