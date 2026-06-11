"""
gait.py - Tripod Gait 보행 패턴 + 아두이노 시리얼 통신
=========================================================

Tripod Gait 구조
─────────────────
한 번에 3개의 다리가 지면을 지지(Stance)하고,
나머지 3개가 공중에서 이동(Swing)한다.

  Group A (홀수 틱): LF(0), RM(4), LR(2) → Swing
  Group B (홀수 틱): RF(3), LM(1), RR(5) → Swing

  ┌─────┬──────────┬──────────┐
  │ 위상 │  Group A  │  Group B  │
  ├─────┼──────────┼──────────┤
  │  1  │  SWING   │  STANCE  │
  │  2  │  STANCE  │  SWING   │
  └─────┴──────────┴──────────┘

시리얼 통신 포맷 (라즈베리파이 → 아두이노)
───────────────────────────────────────────
  한 프레임 = JSON 한 줄
  {"L":[[c,f,t],[c,f,t],[c,f,t]],"R":[[c,f,t],[c,f,t],[c,f,t]]}\n

  L 인덱스: LF, LM, LR / R 인덱스: RF, RM, RR
  각 다리: coxa, femur, tibia 순
  각도 단위: 도(°), 소수점 1자리
  coxa는 다리별 기본 방향각 대비 상대각으로 전송

다리 번호:
  0: LF (Left Front)    3: RF (Right Front)
  1: LM (Left Middle)   4: RM (Right Middle)
  2: LR (Left Rear)     5: RR (Right Rear)
"""

from __future__ import annotations

import time
import math
import os
from glob import glob

try:
    import serial
except ImportError:
    serial = None

try:
    from IK import solve_all, COXA_LEN, FEMUR_LEN, TIBIA_LEN
except ImportError:
    from ik import solve_all, COXA_LEN, FEMUR_LEN, TIBIA_LEN

# ─── 시리얼 설정 ──────────────────────────────────────────────────────────────
SERIAL_BAUD  = 115200
SERIAL_TIMEOUT = 0.1

# ─── 보행 파라미터 ────────────────────────────────────────────────────────────
STEP_LENGTH  = 40.0    # 한 걸음 앞으로 이동 거리 (mm)
STEP_HEIGHT  = 30.0    # 발을 들어올리는 높이 (mm)
BODY_HEIGHT  = 110.0   # 지면에서 몸체까지 높이 (mm)
GAIT_SPEED   = 0.03    # 한 스텝 소요 시간 (초) — 낮을수록 빠름
STEPS        = 8       # Swing/Stance 분할 스텝 수

COXA_CMD_MIN, COXA_CMD_MAX = -60.0, 60.0
FEMUR_CMD_MIN, FEMUR_CMD_MAX = -90.0, 90.0
TIBIA_CMD_MIN, TIBIA_CMD_MAX = -150.0, 0.0

# ─── 다리 그룹 (Tripod Gait) ─────────────────────────────────────────────────
GROUP_A = [0, 4, 2]   # LF, RM, LR
GROUP_B = [3, 1, 5]   # RF, LM, RR

# ─── 각 다리 Coxa 관절의 몸체 부착 위치 & 기본 방향각 (도) ──────────────────
# (body_x, body_y): 몸체 중심 기준 Coxa 위치 (mm)
# default_angle   : 다리가 뻗는 기본 방향 (0°=앞, 90°=옆, 180°=뒤)
LEG_CONFIG = [
    # idx  이름   body_x   body_y  default_angle
    (  0,  "LF",   80.0,   50.0,    45.0  ),
    (  1,  "LM",    0.0,   70.0,    90.0  ),
    (  2,  "LR",  -80.0,   50.0,   135.0  ),
    (  3,  "RF",   80.0,  -50.0,   -45.0  ),
    (  4,  "RM",    0.0,  -70.0,   -90.0  ),
    (  5,  "RR",  -80.0,  -50.0,  -135.0  ),
]

# ─── 유틸: 중립 발끝 좌표 계산 ───────────────────────────────────────────────

def neutral_foot(leg_idx: int) -> tuple[float, float, float]:
    """다리별 중립 발끝 위치 (Coxa 관절 기준 좌표)"""
    _, _, _, _, angle_deg = LEG_CONFIG[leg_idx]
    angle_rad = math.radians(angle_deg)
    reach = COXA_LEN + FEMUR_LEN * 0.6          # 편안한 뻗기 거리
    x = reach * math.cos(angle_rad)
    y = reach * math.sin(angle_rad)
    z = -BODY_HEIGHT
    return x, y, z


# ─── Swing 궤적: 포물선 보간 ─────────────────────────────────────────────────

def swing_trajectory(start: tuple, end: tuple, t: float) \
        -> tuple[float, float, float]:
    """
    t ∈ [0, 1]: 0 = 출발, 1 = 도착
    x, y는 선형 보간, z는 포물선(sin)으로 들어올림
    """
    x = start[0] + (end[0] - start[0]) * t
    y = start[1] + (end[1] - start[1]) * t
    z = start[2] + (end[2] - start[2]) * t + STEP_HEIGHT * math.sin(math.pi * t)
    return x, y, z


# ─── Stance 궤적: 지면 밀기 ─────────────────────────────────────────────────

def stance_trajectory(current: tuple, t: float, direction: float) \
        -> tuple[float, float, float]:
    """
    t ∈ [0, 1]: 지면을 뒤로 밀어 몸체를 앞으로 이동
    direction: 1.0=전진, -1.0=후진
    """
    x = current[0] - direction * STEP_LENGTH * (t / STEPS)
    y = current[1]
    z = current[2]   # 지면 유지
    return x, y, z


# ─── 시리얼 연결 ─────────────────────────────────────────────────────────────

def find_serial_port() -> str:
    configured_port = os.getenv("ARES_SERIAL_PORT")
    if configured_port:
        if not os.path.exists(configured_port):
            raise RuntimeError(f"설정된 시리얼 포트가 없습니다: {configured_port}")
        return configured_port

    candidates = sorted(
        glob("/dev/serial/by-id/*")
        + glob("/dev/ttyACM*")
        + glob("/dev/ttyUSB*")
    )
    if not candidates:
        raise RuntimeError(
            "Arduino 시리얼 포트를 찾지 못했습니다. "
            "USB 연결과 /dev/ttyACM* 또는 /dev/ttyUSB*를 확인하세요."
        )
    return candidates[0]


def connect_serial() -> serial.Serial:
    if serial is None:
        raise RuntimeError("pyserial이 설치되어 있지 않습니다. `pip install pyserial` 후 다시 실행하세요.")

    serial_port = find_serial_port()
    print(f"[Serial] 포트 {serial_port} 연결 중...")
    try:
        ser = serial.Serial(serial_port, SERIAL_BAUD, timeout=SERIAL_TIMEOUT)
    except PermissionError as exc:
        raise RuntimeError(
            f"시리얼 포트 권한이 없습니다: {serial_port}. "
            "사용자를 dialout 그룹에 추가해야 합니다."
        ) from exc
    except serial.SerialException as exc:
        raise RuntimeError(
            f"시리얼 포트를 열 수 없습니다: {serial_port}. "
            "Arduino IDE 시리얼 모니터 등 다른 프로그램의 점유를 확인하세요."
        ) from exc
    try:
        time.sleep(2.0)   # 포트를 열 때 발생하는 Arduino 리셋 대기
        print("[Serial] 연결 완료, 센서 스트림 대기")
        return ser
    except Exception:
        ser.close()
        raise


def send_angles(protocol,
                angles: list[tuple[float, float, float] | None]) -> bool:
    """
    Arduino/main.ino가 파싱하는 JSON 형식으로 18개 각도를 전송한다.
    도달 불가 또는 안전 범위 밖인 프레임은 전송하지 않는다.
    """
    command_angles = to_servo_commands(angles)
    if command_angles is None:
        print("[Gait] IK 결과가 안전 범위를 벗어나 프레임 전송을 건너뜀")
        return False

    left = [command_angles[0], command_angles[1], command_angles[2]]
    right = [command_angles[3], command_angles[4], command_angles[5]]
    protocol.send_frame(left, right)
    return True


def to_servo_commands(angles: list[tuple[float, float, float] | None]) \
        -> list[list[float]] | None:
    if len(angles) != 6:
        return None

    command_angles = []
    for leg_idx, a in enumerate(angles):
        if a is None:
            return None

        coxa_abs, femur, tibia = a
        _, _, _, _, default_angle = LEG_CONFIG[leg_idx]
        coxa = normalize_degrees(coxa_abs - default_angle)

        if not (COXA_CMD_MIN <= coxa <= COXA_CMD_MAX):
            return None
        if not (FEMUR_CMD_MIN <= femur <= FEMUR_CMD_MAX):
            return None
        if not (TIBIA_CMD_MIN <= tibia <= TIBIA_CMD_MAX):
            return None

        command_angles.append([round(coxa, 1), round(femur, 1), round(tibia, 1)])

    return command_angles


def normalize_degrees(angle: float) -> float:
    while angle > 180.0:
        angle -= 360.0
    while angle < -180.0:
        angle += 360.0
    return angle


# ─── Tripod Gait 메인 루프 ────────────────────────────────────────────────────

class MotionCancelled(RuntimeError):
    pass


class TripodGait:
    def __init__(self, protocol, should_cancel=None):
        self.protocol = protocol
        self.should_cancel = should_cancel or (lambda: False)
        # 각 다리 현재 발끝 위치 초기화 (중립)
        self.foot_pos = [neutral_foot(i) for i in range(6)]

    def step(self, direction: float = 1.0) -> None:
        """
        한 Tripod 사이클 실행
        direction: 1.0=전진, -1.0=후진
        """
        # ── Phase 1: Group A Swing / Group B Stance ──
        self._phase(GROUP_A, GROUP_B, direction)
        self._check_cancelled()
        # ── Phase 2: Group B Swing / Group A Stance ──
        self._phase(GROUP_B, GROUP_A, direction)

    def _phase(self,
               swing_group: list[int],
               stance_group: list[int],
               direction: float) -> None:
        """
        Swing 그룹은 들어올려 앞으로 이동,
        Stance 그룹은 지면을 밀어 몸체를 전진시킴
        """
        # Swing 그룹의 목표 발끝 (한 보폭 앞)
        swing_targets = {}
        for idx in swing_group:
            nx, ny, nz = neutral_foot(idx)
            _, _, _, _, angle_deg = LEG_CONFIG[idx]
            angle_rad = math.radians(angle_deg)
            tx = nx + direction * STEP_LENGTH * math.cos(angle_rad) * 0.5
            ty = ny + direction * STEP_LENGTH * math.sin(angle_rad) * 0.5
            swing_targets[idx] = (tx, ty, nz)

        swing_starts = {idx: self.foot_pos[idx] for idx in swing_group}

        for step_i in range(STEPS):
            self._check_cancelled()
            t = (step_i + 1) / STEPS   # 0 제외, 1 포함

            foot_positions = list(self.foot_pos)

            # Swing 보간
            for idx in swing_group:
                foot_positions[idx] = swing_trajectory(
                    swing_starts[idx], swing_targets[idx], t
                )

            # Stance 밀기
            for idx in stance_group:
                foot_positions[idx] = stance_trajectory(
                    self.foot_pos[idx], t, direction
                )

            # IK 풀이 & 송신
            angles = solve_all(foot_positions)
            if not send_angles(self.protocol, angles):
                raise RuntimeError("IK 프레임이 안전 범위를 벗어나 보행을 중단합니다.")
            self._interruptible_sleep(GAIT_SPEED)

        # 발끝 위치 업데이트
        for idx in swing_group:
            self.foot_pos[idx] = swing_targets[idx]
        for idx in stance_group:
            self.foot_pos[idx] = stance_trajectory(
                self.foot_pos[idx], 1.0, direction
            )

    def stand(self) -> None:
        """모든 다리를 중립 위치로 이동 (기립 자세)"""
        targets = [neutral_foot(i) for i in range(6)]
        angles = solve_all(targets)
        if not send_angles(self.protocol, angles):
            raise RuntimeError("기립 자세 IK 계산에 실패했습니다.")
        self.foot_pos = list(targets)
        print("[Gait] 기립 자세 완료")

    def turn(self, clockwise: bool = True) -> None:
        """제자리 회전 — Swing 그룹의 y축 이동으로 구현"""
        sign = 1.0 if clockwise else -1.0
        for swing_group, stance_group in [(GROUP_A, GROUP_B), (GROUP_B, GROUP_A)]:
            swing_targets = {}
            for idx in swing_group:
                nx, ny, nz = neutral_foot(idx)
                swing_targets[idx] = (nx, ny + sign * 20.0, nz)

            swing_starts = {idx: self.foot_pos[idx] for idx in swing_group}

            for step_i in range(STEPS):
                self._check_cancelled()
                t = (step_i + 1) / STEPS
                foot_positions = list(self.foot_pos)

                for idx in swing_group:
                    foot_positions[idx] = swing_trajectory(
                        swing_starts[idx], swing_targets[idx], t
                    )
                for idx in stance_group:
                    foot_positions[idx] = self.foot_pos[idx]

                angles = solve_all(foot_positions)
                if not send_angles(self.protocol, angles):
                    raise RuntimeError("IK 프레임이 안전 범위를 벗어나 회전을 중단합니다.")
                self._interruptible_sleep(GAIT_SPEED)

            for idx in swing_group:
                self.foot_pos[idx] = swing_targets[idx]

    def _check_cancelled(self) -> None:
        if self.should_cancel():
            raise MotionCancelled()

    def _interruptible_sleep(self, duration: float) -> None:
        deadline = time.monotonic() + duration
        while time.monotonic() < deadline:
            self._check_cancelled()
            time.sleep(min(0.005, max(0.0, deadline - time.monotonic())))


# ─── 진입점 ───────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    from serial_protocol import SerialProtocol

    ser = connect_serial()
    protocol = SerialProtocol(ser)
    protocol.start()
    gait = TripodGait(protocol)

    try:
        print("[Gait] 진단 모드: 기립 자세만 전송합니다.")
        gait.stand()

    except KeyboardInterrupt:
        print("\n[Gait] 중단 → 중립 자세")
        gait.stand()
    except RuntimeError as e:
        print(f"\n[Gait] 오류: {e}")
        gait.stand()
    finally:
        protocol.close()
        ser.close()
        print("[Serial] 연결 종료")
