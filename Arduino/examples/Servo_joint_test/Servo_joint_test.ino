#include <Wire.h>
#include <Adafruit_PWMServoDriver.h>

Adafruit_PWMServoDriver pwmLeft(0x41);
Adafruit_PWMServoDriver pwmRight(0x40);

#define SERVO_FREQ 50
#define USMIN 700
#define USMAX 2300

// 안전 점검용 제한 범위입니다. 필요할 때 조금씩 넓히세요.
#define TEST_MIN_ANGLE 70
#define TEST_MAX_ANGLE 110
#define TEST_NEUTRAL_ANGLE 90
#define TEST_STEP_ANGLE 2
#define TEST_STEP_DELAY_MS 80
#define I2C_TIMEOUT_US 25000

enum JointType {
  JOINT_COXA = 0,
  JOINT_FEMUR = 1,
  JOINT_TIBIA = 2
};

struct ServoTarget {
  Adafruit_PWMServoDriver* driver;
  uint8_t channel;
  uint8_t address;
};

int selectedLeg = 1;
JointType selectedJoint = JOINT_COXA;
int currentAngle = TEST_NEUTRAL_ANGLE;
bool outputEnabled = false;

ServoTarget getTarget(int leg, JointType joint) {
  bool isLeft = leg == 1 || leg == 3 || leg == 5;
  int sideIndex = (leg - 1) / 2;
  uint8_t channel = sideIndex * 3 + (int)joint;

  if (isLeft) {
    return {&pwmLeft, channel, 0x41};
  }
  return {&pwmRight, channel, 0x40};
}

bool i2cDevicePresent(uint8_t address) {
  Wire.beginTransmission(address);
  uint8_t result = Wire.endTransmission();

  Serial.print("I2C 0x");
  Serial.print(address, HEX);
  Serial.print(" result=");
  Serial.println(result);

  return result == 0;
}

int angleToMicroseconds(int angle) {
  angle = constrain(angle, TEST_MIN_ANGLE, TEST_MAX_ANGLE);
  return map(angle, 0, 180, USMIN, USMAX);
}

void disableChannel(Adafruit_PWMServoDriver& driver, uint8_t channel) {
  driver.setPWM(channel, 0, 0);
}

void disableAllOutputs() {
  for (uint8_t channel = 0; channel < 16; channel++) {
    disableChannel(pwmLeft, channel);
    disableChannel(pwmRight, channel);
  }
  outputEnabled = false;
  Serial.println("PWM:ALL_OFF");
}

void disableSelectedOutput() {
  ServoTarget target = getTarget(selectedLeg, selectedJoint);
  disableChannel(*target.driver, target.channel);
  outputEnabled = false;
  Serial.println("PWM:SELECTED_OFF");
}

const char* jointName(JointType joint) {
  if (joint == JOINT_COXA) return "COXA";
  if (joint == JOINT_FEMUR) return "FEMUR";
  return "TIBIA";
}

void printSelection() {
  ServoTarget target = getTarget(selectedLeg, selectedJoint);

  Serial.print("SELECTED leg=");
  Serial.print(selectedLeg);
  Serial.print(" joint=");
  Serial.print(jointName(selectedJoint));
  Serial.print(" pca=0x");
  Serial.print(target.address, HEX);
  Serial.print(" channel=");
  Serial.print(target.channel);
  Serial.print(" angle=");
  Serial.print(currentAngle);
  Serial.print(" output=");
  Serial.println(outputEnabled ? "ON" : "OFF");
}

void selectLeg(int leg) {
  disableSelectedOutput();
  selectedLeg = leg;
  currentAngle = TEST_NEUTRAL_ANGLE;
  printSelection();
}

void selectJoint(JointType joint) {
  disableSelectedOutput();
  selectedJoint = joint;
  currentAngle = TEST_NEUTRAL_ANGLE;
  printSelection();
}

void writeSelectedAngle(int angle) {
  ServoTarget target = getTarget(selectedLeg, selectedJoint);
  currentAngle = constrain(angle, TEST_MIN_ANGLE, TEST_MAX_ANGLE);
  target.driver->writeMicroseconds(
      target.channel,
      angleToMicroseconds(currentAngle));
  outputEnabled = true;

  Serial.print("MOVE angle=");
  Serial.println(currentAngle);
}

void moveSelectedSlowly(int targetAngle) {
  targetAngle = constrain(targetAngle, TEST_MIN_ANGLE, TEST_MAX_ANGLE);

  if (!outputEnabled) {
    writeSelectedAngle(currentAngle);
    delay(TEST_STEP_DELAY_MS);
  }

  while (currentAngle != targetAngle) {
    currentAngle += targetAngle > currentAngle ? 1 : -1;
    writeSelectedAngle(currentAngle);
    delay(TEST_STEP_DELAY_MS);
  }
}

void printHelp() {
  Serial.println();
  Serial.println("=== ONE JOINT SERVO TEST ===");
  Serial.println("1~6 : select leg");
  Serial.println("C/F/T: select coxa/femur/tibia");
  Serial.println("+/- : move selected joint by 2 degrees");
  Serial.println("0   : slowly move selected joint to 90 degrees");
  Serial.println("X   : release selected servo PWM");
  Serial.println("!   : disable every PCA9685 PWM channel");
  Serial.println("P   : print current selection");
  Serial.println("H   : print this help");
  Serial.println("Test with the robot lifted and only one servo connected if possible.");
  Serial.println();
}

void handleCommand(char command) {
  if (command >= '1' && command <= '6') {
    selectLeg(command - '0');
    return;
  }

  if (command == 'c' || command == 'C') {
    selectJoint(JOINT_COXA);
  } else if (command == 'f' || command == 'F') {
    selectJoint(JOINT_FEMUR);
  } else if (command == 't' || command == 'T') {
    selectJoint(JOINT_TIBIA);
  } else if (command == '+') {
    moveSelectedSlowly(currentAngle + TEST_STEP_ANGLE);
  } else if (command == '-') {
    moveSelectedSlowly(currentAngle - TEST_STEP_ANGLE);
  } else if (command == '0') {
    moveSelectedSlowly(TEST_NEUTRAL_ANGLE);
  } else if (command == 'x' || command == 'X') {
    disableSelectedOutput();
  } else if (command == '!') {
    disableAllOutputs();
  } else if (command == 'p' || command == 'P') {
    printSelection();
  } else if (command == 'h' || command == 'H' || command == '?') {
    printHelp();
  }
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("SERVO_JOINT_TEST_BOOT");

  Wire.begin();
#if defined(WIRE_HAS_TIMEOUT)
  Wire.setWireTimeout(I2C_TIMEOUT_US, false);
#endif

  bool leftReady = i2cDevicePresent(0x41);
  bool rightReady = i2cDevicePresent(0x40);
  if (!leftReady || !rightReady) {
    Serial.println("PCA_NOT_FOUND: check 0x41, 0x40, SDA, SCL, VCC and GND");
    return;
  }

  pwmLeft.begin();
  pwmLeft.setPWMFreq(SERVO_FREQ);
  pwmRight.begin();
  pwmRight.setPWMFreq(SERVO_FREQ);
  delay(10);

  // 부팅할 때는 어떤 모터도 자동으로 움직이지 않습니다.
  disableAllOutputs();
  printHelp();
  printSelection();
}

void loop() {
  while (Serial.available()) {
    char command = Serial.read();
    if (command != '\r' && command != '\n' && command != ' ') {
      handleCommand(command);
    }
  }
}
