#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>
#include <avr/io.h>

Adafruit_PWMServoDriver pwmL = Adafruit_PWMServoDriver(0x41);
Adafruit_PWMServoDriver pwmR = Adafruit_PWMServoDriver(0x40);

#define SERVO_FREQ 50
#define USMIN 700
#define USMAX 2300
#define SERVO_MIN_ANGLE 45
#define SERVO_MAX_ANGLE 150
#define I2C_TIMEOUT_US 25000

uint8_t resetCause __attribute__((section(".noinit")));

void captureResetCause() __attribute__((naked)) __attribute__((section(".init3")));
void captureResetCause() {
  resetCause = MCUSR;
  MCUSR = 0;
}

// ─────────────────────────────────────────────────────────────
// 캘리브레이션 오프셋
// 양수(+) : 해당 서보 각도를 올림
// 음수(-) : 해당 서보 각도를 내림
//
// 방향 보정
//  1 : 명령 각도와 같은 방향
// -1 : 명령 각도와 반대 방향
//
// 현재 증상: 왼쪽 앞다리(Leg1) 펨러가 혼자 들려있음
//   → FEMUR 오프셋을 + 방향으로 조금씩 올려서 내려앉히세요
//   → 예: 5씩 바꿔가면서 테스트
// ─────────────────────────────────────────────────────────────
struct Offset { int coxa, femur, tibia; };
struct Direction { int8_t coxa, femur, tibia; };

Offset offsets[6] = {
  // coxa  femur  tibia
  {   0,   -10,    5  },  // Leg1: 왼쪽 앞
  {   0,     10,    0  },  // Leg2: 오른쪽 앞
  {   0,     0,    0  },  // Leg3: 왼쪽 중간
  {   0,    15,    5  },  // Leg4: 오른쪽 중간
  {   0,     0,    0  },  // Leg5: 왼쪽 뒤
  {   0,     10,   0  },  // Leg6: 오른쪽 뒤
};

Direction directions[6] = {
  // coxa  femur  tibia
  {   1,     1,    1  },  // Leg1: 왼쪽 앞
  {  -1,    -1,   -1  },  // Leg2: 오른쪽 앞
  {   1,     1,    1  },  // Leg3: 왼쪽 중간
  {  -1,    -1,   -1  },  // Leg4: 오른쪽 중간
  {   1,     1,    1  },  // Leg5: 왼쪽 뒤
  {  -1,    -1,   -1  },  // Leg6: 오른쪽 뒤
};
// ─────────────────────────────────────────────────────────────

#define COXA_N  90
#define FEMUR_N 90
#define TIBIA_N 90

#define STEP_DELAY   40
#define LERP_STEPS   16
#define COXA_SWING   8
#define FEMUR_LIFT   30
#define TIBIA_COMP   5
#define TIBIA_TEST   30
#define SUBSTEP_PAUSE 120

struct Leg {
  Adafruit_PWMServoDriver* drv;
  uint8_t ch;
  int8_t  dir;
  int coxa, femur, tibia;
};

Leg legs[6] = {
  {&pwmL, 0,  1, COXA_N, FEMUR_N, TIBIA_N},
  {&pwmR, 0, -1, COXA_N, FEMUR_N, TIBIA_N},
  {&pwmL, 3,  1, COXA_N, FEMUR_N, TIBIA_N},
  {&pwmR, 3, -1, COXA_N, FEMUR_N, TIBIA_N},
  {&pwmL, 6,  1, COXA_N, FEMUR_N, TIBIA_N},
  {&pwmR, 6, -1, COXA_N, FEMUR_N, TIBIA_N},
};

int GRP_A[3] = {0, 3, 4};
int GRP_B[3] = {1, 2, 5};
int debugStep = 0;
bool pcaLeftReady = false;
bool pcaRightReady = false;
bool walkMode = false;

bool i2cDevicePresent(uint8_t address) {
  Serial.print("I2C probe start: 0x");
  Serial.println(address, HEX);
  Serial.flush();

  Wire.beginTransmission(address);
  uint8_t result = Wire.endTransmission();

  Serial.print("I2C 0x");
  Serial.print(address, HEX);
  Serial.print(" result=");
  Serial.println(result);

  return result == 0;
}

void printResetCause() {
  Serial.print("RESET_CAUSE=");
  Serial.print(resetCause, HEX);
  Serial.print(" [");
  if (resetCause & _BV(BORF)) Serial.print(" BROWN_OUT");
  if (resetCause & _BV(WDRF)) Serial.print(" WATCHDOG");
  if (resetCause & _BV(EXTRF)) Serial.print(" EXTERNAL");
  if (resetCause & _BV(PORF)) Serial.print(" POWER_ON");
  Serial.println(" ]");
}

bool i2cBusReleased() {
  pinMode(SDA, INPUT_PULLUP);
  pinMode(SCL, INPUT_PULLUP);
  delay(10);

  int sdaLevel = digitalRead(SDA);
  int sclLevel = digitalRead(SCL);

  Serial.print("I2C pins | SDA=");
  Serial.print(sdaLevel);
  Serial.print(" SCL=");
  Serial.println(sclLevel);

  return sdaLevel == HIGH && sclLevel == HIGH;
}

void setAngle(Adafruit_PWMServoDriver &drv, uint8_t ch, int angle) {
  angle = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
  drv.writeMicroseconds(ch, map(angle, 0, 180, USMIN, USMAX));
}

int applyServoAdjust(int angle, int neutral, int8_t direction, int offset) {
  return neutral + (angle - neutral) * direction + offset;
}

// 방향 보정과 오프셋을 반영해서 실제 서보에 적용
void applyLeg(int i) {
  setAngle(*legs[i].drv, legs[i].ch,
           applyServoAdjust(legs[i].coxa, COXA_N, directions[i].coxa, offsets[i].coxa));
  setAngle(*legs[i].drv, legs[i].ch + 1,
           applyServoAdjust(legs[i].femur, FEMUR_N, directions[i].femur, offsets[i].femur));
  setAngle(*legs[i].drv, legs[i].ch + 2,
           applyServoAdjust(legs[i].tibia, TIBIA_N, directions[i].tibia, offsets[i].tibia));
}

void applyAll() {
  for (int i = 0; i < 6; i++) applyLeg(i);
}

void setStandMode();
void setWalkMode();
bool handleSerialCommand();

bool responsiveDelay(unsigned long delayMs) {
  unsigned long startedAt = millis();
  while (millis() - startedAt < delayMs) {
    if (handleSerialCommand() && !walkMode) {
      return false;
    }
    delay(5);
  }
  return true;
}

int lerp(int a, int b, int step) {
  return a + (b - a) * step / LERP_STEPS;
}

void moveToTargets(int targets[6][3]) {
  int starts[6][3];

  for (int i = 0; i < 6; i++) {
    starts[i][0] = legs[i].coxa;
    starts[i][1] = legs[i].femur;
    starts[i][2] = legs[i].tibia;
  }

  for (int step = 1; step <= LERP_STEPS; step++) {
    for (int i = 0; i < 6; i++) {
      legs[i].coxa  = lerp(starts[i][0], targets[i][0], step);
      legs[i].femur = lerp(starts[i][1], targets[i][1], step);
      legs[i].tibia = lerp(starts[i][2], targets[i][2], step);
    }
    applyAll();
    if (!responsiveDelay(STEP_DELAY)) {
      return;
    }
  }
}

void copyCurrentTargets(int targets[6][3]) {
  for (int i = 0; i < 6; i++) {
    targets[i][0] = legs[i].coxa;
    targets[i][1] = legs[i].femur;
    targets[i][2] = legs[i].tibia;
  }
}

void standUp() {
  walkMode = false;
  for (int i = 0; i < 6; i++) {
    legs[i].coxa  = COXA_N;
    legs[i].femur = FEMUR_N;
    legs[i].tibia = TIBIA_N;
  }
  applyAll();
  debugStep = 0;
}

void liftGroup(int* group) {
  int targets[6][3];
  copyCurrentTargets(targets);

  for (int g = 0; g < 3; g++) {
    int leg = group[g];
    targets[leg][1] = FEMUR_N - FEMUR_LIFT;
    targets[leg][2] = TIBIA_N;
  }

  moveToTargets(targets);
}

void liftOneLeg(int leg) {
  int targets[6][3];
  copyCurrentTargets(targets);

  targets[leg][1] = FEMUR_N - FEMUR_LIFT;
  targets[leg][2] = TIBIA_N;

  moveToTargets(targets);
}

void swingGroupForwardAndPushStance(int* swingGrp, int* stanceGrp) {
  int targets[6][3];
  copyCurrentTargets(targets);

  for (int g = 0; g < 3; g++) {
    int swingLeg = swingGrp[g];
    targets[swingLeg][0] = COXA_N + legs[swingLeg].dir * COXA_SWING;

    int stanceLeg = stanceGrp[g];
    targets[stanceLeg][0] = COXA_N - legs[stanceLeg].dir * COXA_SWING;
    targets[stanceLeg][1] = FEMUR_N;
    targets[stanceLeg][2] = TIBIA_N;
  }

  moveToTargets(targets);
}

void lowerGroup(int* group) {
  int targets[6][3];
  copyCurrentTargets(targets);

  for (int g = 0; g < 3; g++) {
    int leg = group[g];
    targets[leg][1] = FEMUR_N;
    targets[leg][2] = TIBIA_N;
  }

  moveToTargets(targets);
}

void lowerOneLeg(int leg) {
  int targets[6][3];
  copyCurrentTargets(targets);

  targets[leg][1] = FEMUR_N;
  targets[leg][2] = TIBIA_N;

  moveToTargets(targets);
}

void setLegJointDirect(int leg, int joint, int angle) {
  setAngle(*legs[leg].drv, legs[leg].ch + joint, angle);
}

void setLegFemurLift(int leg) {
  int logicalAngle = FEMUR_N - FEMUR_LIFT;
  int actualAngle = applyServoAdjust(logicalAngle, FEMUR_N,
                                     directions[leg].femur, offsets[leg].femur);
  setAngle(*legs[leg].drv, legs[leg].ch + 1, actualAngle);
}

void setLegFemurDown(int leg) {
  int actualAngle = applyServoAdjust(FEMUR_N, FEMUR_N,
                                     directions[leg].femur, offsets[leg].femur);
  setAngle(*legs[leg].drv, legs[leg].ch + 1, actualAngle);
}

void setLegTibiaOut(int leg) {
  int logicalAngle = TIBIA_N - TIBIA_TEST;
  int actualAngle = applyServoAdjust(logicalAngle, TIBIA_N,
                                     directions[leg].tibia, offsets[leg].tibia);
  setAngle(*legs[leg].drv, legs[leg].ch + 2, actualAngle);
}

void setLegTibiaNeutral(int leg) {
  int actualAngle = applyServoAdjust(TIBIA_N, TIBIA_N,
                                     directions[leg].tibia, offsets[leg].tibia);
  setAngle(*legs[leg].drv, legs[leg].ch + 2, actualAngle);
}

void setGroupFemurLift(int* group) {
  for (int g = 0; g < 3; g++) {
    setLegFemurLift(group[g]);
  }
}

void setGroupFemurDown(int* group) {
  for (int g = 0; g < 3; g++) {
    setLegFemurDown(group[g]);
  }
}

void setGroupTibiaOut(int* group) {
  for (int g = 0; g < 3; g++) {
    setLegTibiaOut(group[g]);
  }
}

void setGroupTibiaNeutral(int* group) {
  for (int g = 0; g < 3; g++) {
    setLegTibiaNeutral(group[g]);
  }
}

void tripodStep(int* swingGrp, int* stanceGrp) {
  liftGroup(swingGrp);
  if (!responsiveDelay(SUBSTEP_PAUSE)) return;
  swingGroupForwardAndPushStance(swingGrp, stanceGrp);
  if (!responsiveDelay(SUBSTEP_PAUSE)) return;
  lowerGroup(swingGrp);
  if (!responsiveDelay(SUBSTEP_PAUSE)) return;
}

void walkForward() {
  tripodStep(GRP_A, GRP_B);
  if (!walkMode) return;
  tripodStep(GRP_B, GRP_A);
}

void setStandMode() {
  standUp();
  Serial.println("MODE:STAND");
}

void setWalkMode() {
  if (!walkMode) {
    walkMode = true;
    Serial.println("MODE:WALK");
  }
}

void runDebugStep() {
  int phase = debugStep % 4;

  if (phase == 0) {
    Serial.println("Group A femur lift");
    setGroupFemurLift(GRP_A);
  } else if (phase == 1) {
    Serial.println("Group A tibia out");
    setGroupTibiaOut(GRP_A);
  } else if (phase == 2) {
    Serial.println("Group A tibia 90");
    setGroupTibiaNeutral(GRP_A);
  } else {
    Serial.println("Group A femur down");
    setGroupFemurDown(GRP_A);
  }

  debugStep = (debugStep + 1) % 4;
}

bool handleSerialCommand() {
  bool handled = false;

  while (Serial.available()) {
    char command = Serial.read();
    if (command == 'w' || command == 'W') {
      setWalkMode();
      handled = true;
    } else if (command == 's' || command == 'S') {
      setStandMode();
      handled = true;
    } else if (command == 'n' || command == 'N') {
      walkMode = false;
      runDebugStep();
      handled = true;
    }
  }

  return handled;
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("ARES_TEST_BOOT");
  printResetCause();

  if (!i2cBusReleased()) {
    Serial.println("I2C_BUS_STUCK_LOW: disconnect PCA boards and check SDA/SCL wiring");
    return;
  }

  Wire.begin();
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(I2C_TIMEOUT_US, false);
#endif
  Serial.println("I2C_READY");

  pcaLeftReady = i2cDevicePresent(0x41);
  pcaRightReady = i2cDevicePresent(0x40);
  if (!pcaLeftReady || !pcaRightReady) {
    Serial.println("PCA_NOT_FOUND: check 0x41(left), 0x40(right), SDA/SCL, VCC and GND");
    return;
  }

  Serial.println("PCA_LEFT_BEGIN");
  pwmL.begin();
  pwmL.setPWMFreq(SERVO_FREQ);
  Serial.println("PCA_LEFT_CONNECTED");

  Serial.println("PCA_RIGHT_BEGIN");
  pwmR.begin();
  pwmR.setPWMFreq(SERVO_FREQ);
  Serial.println("PCA_RIGHT_CONNECTED");

  setStandMode();
  Serial.println("ARES_TEST_READY");
  Serial.println("Send W: walk mode, S: stand mode, N: debug step");
}

void loop() {
  handleSerialCommand();

  if (walkMode) {
    walkForward();
  }
}
