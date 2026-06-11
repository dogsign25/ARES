"""
ik.py - 6족 보행 로봇 역기구학 (Inverse Kinematics)
======================================================
각 다리의 목표 발끝 좌표 (x, y, z) → 관절 각도 (coxa, femur, tibia) 변환

다리 구조 (3-DOF per leg)
                   Body
                    │
              [Coxa Joint]  ← 수평 회전 (α)
                    │ L1
              [Femur Joint] ← 수직 회전 (β)
                    │ L2
              [Tibia Joint] ← 수직 회전 (γ)
                    │ L3
                  [발끝]

좌표계: 각 다리의 Coxa 관절 기준
  x: 앞방향 (+)
  y: 옆방향 — 왼쪽다리 (+바깥), 오른쪽다리 (+바깥)
  z: 위방향 (+), 발은 아래에 있으므로 보통 음수

다리 번호:
  0: LF (Left Front)    3: RF (Right Front)
  1: LM (Left Middle)   4: RM (Right Middle)
  2: LR (Left Rear)     5: RR (Right Rear)
"""

import math

# ─── 링크 길이 설정 (mm) ───────────────────────────────────────────────────────
COXA_LEN  = 50.0   # Coxa 길이: 몸체 ~ Femur 관절
FEMUR_LEN = 65.0   # Femur 길이: Femur ~ Tibia 관절
TIBIA_LEN = 130.0  # Tibia 길이: Tibia ~ 발끝

# ─── 관절 가동 범위 (도) ───────────────────────────────────────────────────────
# Coxa는 다리 기준 절대 방향각이다. 실제 서보 명령은 gait.py에서
# 다리별 기본 방향각을 뺀 상대각으로 변환한다.
COXA_MIN,  COXA_MAX  = -180, 180
FEMUR_MIN, FEMUR_MAX = -90,  90
TIBIA_MIN, TIBIA_MAX = -150, 0


def solve(x: float, y: float, z: float) -> tuple[float, float, float] | None:
    """
    단일 다리 역기구학 풀이

    Parameters
    ----------
    x, y : 수평면에서 발끝 목표 위치 (mm), Coxa 관절 기준
    z    : 수직 발끝 목표 위치 (mm), 아래가 음수

    Returns
    -------
    (coxa_deg, femur_deg, tibia_deg) or None (도달 불가)
    """

    if not all(math.isfinite(v) for v in (x, y, z)):
        return None

    # ── 1단계: Coxa 각도 ──────────────────────────────────────────────────────
    # 수평면 기준 발끝 방향각
    coxa_deg = math.degrees(math.atan2(y, x))

    # ── 2단계: 수직 평면 2D IK ───────────────────────────────────────────────
    # Coxa를 지나 Femur 관절까지의 수평 거리 제거 후 남은 거리
    horizontal = math.sqrt(x**2 + y**2) - COXA_LEN

    # Femur 관절에서 발끝까지의 직선 거리
    D = math.sqrt(horizontal**2 + z**2)
    if D <= 1e-6:
        return None

    # 도달 가능 범위 확인 (삼각형 성립 조건)
    reach_max = FEMUR_LEN + TIBIA_LEN
    reach_min = abs(FEMUR_LEN - TIBIA_LEN)
    if D > reach_max or D < reach_min:
        return None   # 도달 불가

    # ── 3단계: 코사인 법칙으로 Femur 각도 ────────────────────────────────────
    # Femur와 발끝 직선이 이루는 각도
    cos_beta = (FEMUR_LEN**2 + D**2 - TIBIA_LEN**2) / (2 * FEMUR_LEN * D)
    cos_beta = max(-1.0, min(1.0, cos_beta))   # 수치 오차 클램프
    beta = math.acos(cos_beta)

    # 수평선 대비 발끝 방향각
    phi = math.atan2(-z, horizontal)           # z 아래가 음수이므로 부호 반전

    femur_deg = math.degrees(phi - beta)

    # ── 4단계: 코사인 법칙으로 Tibia 각도 ────────────────────────────────────
    cos_gamma = (FEMUR_LEN**2 + TIBIA_LEN**2 - D**2) / (2 * FEMUR_LEN * TIBIA_LEN)
    cos_gamma = max(-1.0, min(1.0, cos_gamma))
    tibia_deg = math.degrees(math.acos(cos_gamma)) - 180  # 펼침이 0°

    # ── 5단계: 가동 범위 확인 ────────────────────────────────────────────────
    if not (COXA_MIN  <= coxa_deg  <= COXA_MAX):  return None
    if not (FEMUR_MIN <= femur_deg <= FEMUR_MAX):  return None
    if not (TIBIA_MIN <= tibia_deg <= TIBIA_MAX):  return None

    return round(coxa_deg, 2), round(femur_deg, 2), round(tibia_deg, 2)


def solve_all(foot_positions: list[tuple[float, float, float]]) \
        -> list[tuple[float, float, float] | None]:
    """
    6개 다리 전체 IK 풀이

    Parameters
    ----------
    foot_positions : [(x0,y0,z0), ..., (x5,y5,z5)]
                     각 다리 Coxa 기준 발끝 목표 좌표 (mm)

    Returns
    -------
    [(coxa, femur, tibia), ...] — 도달 불가 다리는 None
    """
    return [solve(x, y, z) for x, y, z in foot_positions]


# ─── 간단 테스트 ──────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # 모든 다리를 중립 위치로
    neutral_foot = (COXA_LEN + FEMUR_LEN * 0.5, 0.0, -(TIBIA_LEN * 0.8))
    result = solve(*neutral_foot)
    print(f"중립 발끝 {neutral_foot} → 관절각: {result}")
