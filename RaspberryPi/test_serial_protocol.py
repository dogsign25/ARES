import json
import queue
import threading
import time
import unittest

from serial_protocol import (
    PROTOCOL_VERSION,
    SerialNackError,
    SerialProtocol,
)


class FakeArduinoSerial:
    def __init__(self):
        self.rx = queue.Queue()
        self.writes = []
        self.is_open = True
        self.port = "FAKE"
        self.baudrate = 115200
        self.handshake_complete = False
        self.drop_next_reply = False
        self.nack_next_frame = False

    def write(self, payload):
        line = payload.decode("ascii").strip()
        self.writes.append(line)
        self._process_line(line)
        return len(payload)

    def flush(self):
        return None

    def read_until(self, separator=b"\n"):
        try:
            return self.rx.get(timeout=0.05)
        except queue.Empty:
            return b""

    def emit(self, line):
        self.rx.put((line + "\n").encode("ascii"))

    def _reply(self, line):
        if self.drop_next_reply:
            self.drop_next_reply = False
            return
        self.emit(line)

    def _process_line(self, line):
        if line == f"HELLO:{PROTOCOL_VERSION}":
            self.handshake_complete = True
            self._reply(f"ACK:HELLO:{PROTOCOL_VERSION}")
            return

        if not self.handshake_complete:
            self._reply("NACK:HELLO:REQUIRED")
            return

        if line.startswith("PING:"):
            self._reply(f"ACK:{line}")
            return

        if line.startswith("CMD:"):
            _, sequence, command = line.split(":", 2)
            if command not in {"STAND", "STOP", "WALK", "FORWARD"}:
                self._reply(f"NACK:CMD:{sequence}:UNKNOWN_COMMAND")
            else:
                self._reply(f"ACK:CMD:{sequence}")
            return

        if line.startswith("FRAME:"):
            _, sequence, payload = line.split(":", 2)
            if self.nack_next_frame:
                self.nack_next_frame = False
                self._reply(f"NACK:FRAME:{sequence}:ANGLE_RANGE")
                return
            data = json.loads(payload)
            if len(data["L"]) == 3 and len(data["R"]) == 3:
                self._reply(f"ACK:FRAME:{sequence}")


class SerialProtocolTest(unittest.TestCase):
    def setUp(self):
        self.serial = FakeArduinoSerial()
        self.sensors = []
        self.protocol = SerialProtocol(
            self.serial,
            sensor_callback=self.sensors.append,
            ack_timeout=0.15,
            heartbeat_interval=10.0,
        )
        self.protocol.start()

    def tearDown(self):
        self.protocol.close()

    def test_handshake_command_frame_and_sensor(self):
        self.protocol.send_command("STAND")
        pose = [[0.0, 45.0, -90.0]] * 3
        self.serial.emit('SENSOR:{"millis":123,"gas":{"level":42}}')
        self.protocol.send_frame(pose, pose)

        deadline = time.monotonic() + 0.5
        while not self.sensors and time.monotonic() < deadline:
            time.sleep(0.01)

        self.assertTrue(self.serial.writes[0].startswith("HELLO:"))
        self.assertTrue(any(line.startswith("CMD:") for line in self.serial.writes))
        self.assertTrue(any(line.startswith("FRAME:") for line in self.serial.writes))
        self.assertEqual(self.sensors[0]["gas"]["level"], 42)

    def test_frame_nack_is_reported(self):
        self.serial.nack_next_frame = True
        pose = [[0.0, 45.0, -90.0]] * 3
        with self.assertRaises(SerialNackError):
            self.protocol.send_frame(pose, pose)

    def test_ack_timeout_forces_new_handshake(self):
        self.serial.drop_next_reply = True
        self.protocol.send_command("STOP")
        hello_count = sum(
            line == f"HELLO:{PROTOCOL_VERSION}" for line in self.serial.writes
        )
        self.assertEqual(hello_count, 2)

    def test_arduino_reboot_is_recovered_automatically(self):
        self.serial.handshake_complete = False
        self.serial.emit("ARES_BOOT")
        time.sleep(0.02)

        self.protocol.send_command("STAND")

        hello_count = sum(
            line == f"HELLO:{PROTOCOL_VERSION}" for line in self.serial.writes
        )
        self.assertEqual(hello_count, 2)

    def test_concurrent_requests_remain_framed(self):
        errors = []

        def send(command):
            try:
                self.protocol.send_command(command)
            except Exception as exc:
                errors.append(exc)

        threads = [
            threading.Thread(target=send, args=("STAND",)),
            threading.Thread(target=send, args=("STOP",)),
            threading.Thread(target=send, args=("WALK",)),
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        self.assertEqual(errors, [])
        command_lines = [line for line in self.serial.writes if line.startswith("CMD:")]
        self.assertEqual(len(command_lines), 3)
        self.assertTrue(all(line.count(":") == 2 for line in command_lines))


if __name__ == "__main__":
    unittest.main()
