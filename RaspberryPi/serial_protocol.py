from __future__ import annotations

import json
import threading
import time
from collections.abc import Callable


PROTOCOL_VERSION = "ARES/1"
DEFAULT_ACK_TIMEOUT = 0.5
DEFAULT_HEARTBEAT_INTERVAL = 0.4


class SerialProtocolError(RuntimeError):
    pass


class SerialNackError(SerialProtocolError):
    pass


class SerialAckTimeout(SerialProtocolError):
    pass


class SerialConnectionLost(SerialProtocolError):
    pass


class SerialProtocol:
    def __init__(
        self,
        ser,
        sensor_callback: Callable[[dict], None] | None = None,
        ack_timeout: float = DEFAULT_ACK_TIMEOUT,
        heartbeat_interval: float = DEFAULT_HEARTBEAT_INTERVAL,
    ):
        self.serial = ser
        self.sensor_callback = sensor_callback
        self.ack_timeout = ack_timeout
        self.heartbeat_interval = heartbeat_interval
        self.write_lock = threading.Lock()
        self.request_lock = threading.Lock()
        self.reply_condition = threading.Condition()
        self.replies: dict[str, str] = {}
        self.connection_error: str | None = None
        self.running = False
        self.handshake_complete = threading.Event()
        self.sequence = 0
        self.last_transmit_at = 0.0

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        threading.Thread(target=self._reader_loop, daemon=True).start()
        self.handshake()
        threading.Thread(target=self._heartbeat_loop, daemon=True).start()

    def close(self) -> None:
        self.running = False

    def handshake(self) -> None:
        with self.request_lock:
            self._handshake_locked()

    def send_command(self, command: str) -> None:
        normalized = command.strip().upper()
        with self.request_lock:
            self._request_with_retry(
                lambda sequence: f"CMD:{sequence}:{normalized}",
                "CMD",
            )

    def send_frame(self, left: list, right: list) -> None:
        payload = json.dumps({"L": left, "R": right}, separators=(",", ":"))
        with self.request_lock:
            self._request_with_retry(
                lambda sequence: f"FRAME:{sequence}:{payload}",
                "FRAME",
            )

    def ping(self) -> None:
        with self.request_lock:
            self._request_with_retry(
                lambda sequence: f"PING:{sequence}",
                "PING",
            )

    def _handshake_locked(self) -> None:
        self.handshake_complete.clear()
        last_error = None
        for _ in range(3):
            try:
                self._send_and_wait(
                    f"HELLO:{PROTOCOL_VERSION}",
                    "HELLO",
                    require_handshake=False,
                )
                self.handshake_complete.set()
                return
            except (SerialAckTimeout, SerialConnectionLost) as exc:
                last_error = exc
                time.sleep(0.05)
        raise last_error or SerialConnectionLost("Arduino handshake failed")

    def _ensure_handshake_locked(self) -> None:
        if self.handshake_complete.is_set():
            return
        self._handshake_locked()

    def _request_with_retry(self, line_factory, reply_type: str) -> None:
        last_error = None
        for _ in range(2):
            self._ensure_handshake_locked()
            sequence = self._next_sequence()
            try:
                self._send_and_wait(
                    line_factory(sequence),
                    f"{reply_type}:{sequence}",
                )
                return
            except (SerialAckTimeout, SerialConnectionLost) as exc:
                last_error = exc
                self.handshake_complete.clear()
        raise last_error or SerialConnectionLost(f"{reply_type} request failed")

    def _send_and_wait(
        self,
        line: str,
        reply_key: str,
        require_handshake: bool = True,
    ) -> None:
        if require_handshake and not self.handshake_complete.is_set():
            raise SerialProtocolError("Arduino handshake is not complete")

        with self.reply_condition:
            self.replies.pop(reply_key, None)
            self.connection_error = None

        self._write_line(line)
        deadline = time.monotonic() + self.ack_timeout

        with self.reply_condition:
            while reply_key not in self.replies and self.connection_error is None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    self.handshake_complete.clear()
                    raise SerialAckTimeout(f"ACK timeout: {reply_key}")
                self.reply_condition.wait(remaining)
            if self.connection_error is not None:
                raise SerialConnectionLost(self.connection_error)
            reply = self.replies.pop(reply_key)

        if reply.startswith("NACK:"):
            raise SerialNackError(reply)

    def _write_line(self, line: str) -> None:
        payload = (line.rstrip("\r\n") + "\n").encode("ascii")
        with self.write_lock:
            self.serial.write(payload)
            self.serial.flush()
        self.last_transmit_at = time.monotonic()

    def _next_sequence(self) -> int:
        self.sequence = (self.sequence + 1) & 0x7FFFFFFF
        return self.sequence

    def _reader_loop(self) -> None:
        while self.running:
            try:
                raw = self.serial.read_until(b"\n")
            except Exception as exc:
                print(f"[Serial] read failed: {exc}")
                self.handshake_complete.clear()
                time.sleep(0.2)
                continue

            if not raw:
                continue

            line = raw.decode("ascii", errors="replace").strip()
            if line:
                self._handle_line(line)

    def _handle_line(self, line: str) -> None:
        print(f"[Serial RX] {line}", flush=True)

        if line == "ARES_BOOT":
            self.handshake_complete.clear()
            with self.reply_condition:
                self.connection_error = "Arduino rebooted"
                self.reply_condition.notify_all()
            return

        if line.startswith("SENSOR:"):
            self._handle_sensor(line[len("SENSOR:"):])
            return

        if line.startswith(("ACK:", "NACK:")):
            parts = line.split(":")
            if len(parts) < 2:
                return
            if line.startswith("NACK:HELLO:"):
                self.handshake_complete.clear()
                with self.reply_condition:
                    self.connection_error = line
                    self.reply_condition.notify_all()
                return
            reply_key = "HELLO" if parts[1] == "HELLO" else ":".join(parts[1:3])
            with self.reply_condition:
                self.replies[reply_key] = line
                self.reply_condition.notify_all()

    def _handle_sensor(self, payload: str) -> None:
        if self.sensor_callback is None:
            return
        try:
            self.sensor_callback(json.loads(payload))
        except (json.JSONDecodeError, TypeError) as exc:
            print(f"[Sensor] invalid JSON: {exc} payload={payload!r}")

    def _heartbeat_loop(self) -> None:
        while self.running:
            time.sleep(self.heartbeat_interval / 2)
            if time.monotonic() - self.last_transmit_at < self.heartbeat_interval:
                continue
            try:
                self.ping()
            except SerialProtocolError as exc:
                print(f"[Serial] heartbeat failed: {exc}")
