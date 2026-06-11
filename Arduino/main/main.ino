// hexapod.ino
// 라즈베리파이로부터 시리얼 JSON 수신
// → PCA9685 두 개로 18개 서보 PWM 제어
// PCA9685 0x41: 왼쪽 다리 (1,3,5번)
// PCA9685 0x40: 오른쪽 다리 (2,4,6번)

#include "DHT.h"
#include "I2Cdev.h"
#include "MPU6050.h"
#include "Wire.h"
#include <Adafruit_PWMServoDriver.h>
#include <ArduinoJson.h>
#include <math.h>

// ── PCA9685 인스턴스 ──
Adafruit_PWMServoDriver pca_left  = Adafruit_PWMServoDriver(0x41);
Adafruit_PWMServoDriver pca_right = Adafruit_PWMServoDriver(0x40);

// ── ARES_test에서 확인한 서보 펄스/각도 범위 ──
#define SERVO_FREQ 50
#define USMIN 700
#define USMAX 2300
#define SERVO_MIN_ANGLE 45.0
#define SERVO_MAX_ANGLE 150.0
#define SERVO_NEUTRAL_ANGLE 90.0
#define SERIAL_TIMEOUT_MS 1000
#define MAX_FRAME_LEN 256
#define SENSOR_INTERVAL_MS 2000
#define PROTOCOL_VERSION "ARES/1"

// ── 센서 핀 설정 ──
#define DHTPIN 8
#define DHTTYPE DHT11
#define TRIG 2
#define ECHO 3
#define GAS A0
#define INTERRUPT_PIN 4

#define HC_SR04_TRIG_PIN TRIG
#define HC_SR04_ECHO_PIN ECHO
#define DHT11_PIN DHTPIN
#define MQ2_PIN GAS
#define MPU6050_ADDR_LOW 0x68
#define MPU6050_ADDR_HIGH 0x69
#define ENABLE_SERVO_OUTPUT 0
#define ENABLE_MPU_AUTO_CALIBRATION 0
#define ENABLE_MPU_SENSOR_READ 0
#define MPU_CALIBRATION_LOOPS 6
#define MPU_WARMUP_MS 1000
#define I2C_TIMEOUT_US 3000
#define WALK_STEP_INTERVAL_MS 280
#define WALK_COXA_SWING 8.0
#define WALK_FEMUR_LIFT 18.0

DHT dht(DHTPIN, DHTTYPE);
MPU6050 accelgyro68(MPU6050_ADDR_LOW);
MPU6050 accelgyro69(MPU6050_ADDR_HIGH);
MPU6050* activeMpu = &accelgyro68;
uint8_t activeMpuAddress = MPU6050_ADDR_LOW;
bool activeMpuPresent = false;
uint8_t activeMpuWhoAmI = 0;

const float COXA_MIN = -60.0;
const float COXA_MAX = 60.0;
const float FEMUR_MIN = -90.0;
const float FEMUR_MAX = 90.0;
const float TIBIA_MIN = -150.0;
const float TIBIA_MAX = 0.0;

// 라즈베리파이 IK 명령에서 기본 서기 자세로 사용하는 논리 각도
const float COXA_NEUTRAL = 0.0;
const float FEMUR_NEUTRAL = 45.0;
const float TIBIA_NEUTRAL = -90.0;

String inputBuffer = "";
bool discardInputUntilNewline = false;
unsigned long lastCommandAt = 0;
unsigned long lastSensorAt = 0;
unsigned long lastWalkAt = 0;
bool failSafeActive = false;
bool handshakeComplete = false;

enum MotionMode {
    MODE_STAND,
    MODE_WALK
};

MotionMode motionMode = MODE_STAND;
int walkPhase = 0;

// ── 관절 오프셋 보정값 (조립 오차 보정, 단위: 도) ──
// 왼쪽 배열: Leg1, Leg3, Leg5 / 오른쪽 배열: Leg2, Leg4, Leg6
float left_offset[3][3] = {
    {0, -10, 5},
    {0,   0, 0},
    {0,   0, 0}
};
float right_offset[3][3] = {
    {0, 10, 0},
    {0, 15, 5},
    {0, 10, 0}
};

// ── 관절 방향 보정값 ──
//  1: 명령 각도와 같은 방향, -1: 명령 각도와 반대 방향
// 실제 조립 후 한 관절이 반대로 움직이면 해당 값만 1/-1로 바꾸면 됩니다.
int left_direction[3][3]  = {{ 1,  1,  1}, { 1,  1,  1}, { 1,  1,  1}};
int right_direction[3][3] = {{-1, -1, -1}, {-1, -1, -1}, {-1, -1, -1}};

// ── ARES_test와 동일한 실제 서보 각도 → 마이크로초 펄스 변환 ──
int angleToMicroseconds(float angle) {
    angle = constrain(angle, SERVO_MIN_ANGLE, SERVO_MAX_ANGLE);
    return (int)(USMIN + (angle / 180.0) * (USMAX - USMIN));
}

void setServo(Adafruit_PWMServoDriver& pca, int channel, float angle) {
#if ENABLE_SERVO_OUTPUT
    pca.writeMicroseconds(channel, angleToMicroseconds(angle));
#endif
}

bool isValidJointAngle(float angle, float minAngle, float maxAngle) {
    return !isnan(angle) && angle >= minAngle && angle <= maxAngle;
}

bool isNumericSequence(const String& sequence) {
    if (sequence.length() == 0) {
        return false;
    }
    for (unsigned int i = 0; i < sequence.length(); i++) {
        if (!isDigit(sequence.charAt(i))) {
            return false;
        }
    }
    return true;
}

float applyServoAdjust(float angle, float logicalNeutral, float offset, int direction) {
    return SERVO_NEUTRAL_ANGLE + (angle - logicalNeutral) * direction + offset;
}

void setAdjustedServo(Adafruit_PWMServoDriver& pca, int channel, float angle,
                      float logicalNeutral, float offset, int direction) {
    setServo(pca, channel,
             applyServoAdjust(angle, logicalNeutral, offset, direction));
}

bool i2cDevicePresent(uint8_t address) {
    Wire.beginTransmission(address);
    return Wire.endTransmission() == 0;
}

bool isSupportedMpuWhoAmI(uint8_t whoAmI) {
    return whoAmI == 0x68 || whoAmI == 0x70;
}

uint8_t readMpuWhoAmI(uint8_t address) {
    Wire.beginTransmission(address);
    Wire.write(0x75);
    if (Wire.endTransmission(false) != 0) {
        return 0;
    }

    if (Wire.requestFrom(address, (uint8_t)1, (uint8_t)true) != 1) {
        return 0;
    }

    return Wire.read();
}

bool initializeMpu() {
    bool foundAny = false;

    if (i2cDevicePresent(MPU6050_ADDR_LOW)) {
        foundAny = true;
        activeMpu = &accelgyro68;
        activeMpuAddress = MPU6050_ADDR_LOW;
        activeMpuPresent = true;
        activeMpuWhoAmI = readMpuWhoAmI(MPU6050_ADDR_LOW);
        activeMpu->initialize();
        if (activeMpu->testConnection() || isSupportedMpuWhoAmI(activeMpuWhoAmI)) {
            Serial.println("MPU6050 connected at 0x68");
            return true;
        }
    }

    if (i2cDevicePresent(MPU6050_ADDR_HIGH)) {
        foundAny = true;
        activeMpu = &accelgyro69;
        activeMpuAddress = MPU6050_ADDR_HIGH;
        activeMpuPresent = true;
        activeMpuWhoAmI = readMpuWhoAmI(MPU6050_ADDR_HIGH);
        activeMpu->initialize();
        if (activeMpu->testConnection() || isSupportedMpuWhoAmI(activeMpuWhoAmI)) {
            Serial.println("MPU6050 connected at 0x69");
            return true;
        }
    }

    if (!foundAny) {
        activeMpuPresent = false;
        activeMpuWhoAmI = 0;
        Serial.println("MPU6050 connection failed at 0x68 and 0x69");
    } else {
        Serial.print("MPU I2C device found, but WHO_AM_I mismatch: 0x");
        Serial.println(activeMpuWhoAmI, HEX);
    }
    return false;
}

void printMpuOffsets() {
    Serial.print("MPU offsets | accel: ");
    Serial.print(activeMpu->getXAccelOffset());
    Serial.print(", ");
    Serial.print(activeMpu->getYAccelOffset());
    Serial.print(", ");
    Serial.print(activeMpu->getZAccelOffset());
    Serial.print(" | gyro: ");
    Serial.print(activeMpu->getXGyroOffset());
    Serial.print(", ");
    Serial.print(activeMpu->getYGyroOffset());
    Serial.print(", ");
    Serial.println(activeMpu->getZGyroOffset());
}

void calibrateMpu() {
    if (!activeMpuPresent) {
        Serial.println("MPU calibration skipped: sensor unavailable");
        return;
    }

    Serial.println("MPU calibration starting: keep the robot still and level");
    delay(MPU_WARMUP_MS);

    activeMpu->CalibrateAccel(MPU_CALIBRATION_LOOPS);
    activeMpu->CalibrateGyro(MPU_CALIBRATION_LOOPS);

    printMpuOffsets();
    Serial.println("MPU calibration complete");
}

long readDistanceMm() {
    digitalWrite(HC_SR04_TRIG_PIN, LOW);
    delayMicroseconds(2);
    digitalWrite(HC_SR04_TRIG_PIN, HIGH);
    delayMicroseconds(10);
    digitalWrite(HC_SR04_TRIG_PIN, LOW);

    long duration = pulseIn(HC_SR04_ECHO_PIN, HIGH, 30000UL);
    if (duration == 0) {
        return -1;
    }
    return ((float)(340 * duration) / 1000) / 2;
}

void sendSensorFrame() {
    int16_t ax = 0, ay = 0, az = 0;
    int16_t gx = 0, gy = 0, gz = 0;
    float humidity = dht.readHumidity();
    float airTemp = dht.readTemperature();
    long distanceMm = readDistanceMm();
    int gasRaw = analogRead(MQ2_PIN);
    bool dhtOk = !isnan(humidity) && !isnan(airTemp);
    bool mpuReadable = activeMpuPresent && ENABLE_MPU_SENSOR_READ;

    if (mpuReadable) {
        activeMpu->getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
    }

    StaticJsonDocument<512> doc;
    doc["millis"] = millis();

    if (mpuReadable) {
        JsonObject gyro = doc.createNestedObject("gyro");
        // MPU6050 기본 범위: gyro ±250 deg/s, accel ±2g
        gyro["gyroX"] = gx / 131.0;
        gyro["gyroY"] = gy / 131.0;
        gyro["gyroZ"] = gz / 131.0;
        gyro["accelX"] = (ax / 16384.0) * 9.80665;
        gyro["accelY"] = (ay / 16384.0) * 9.80665;
    }

    if (distanceMm >= 0) {
        JsonObject distance = doc.createNestedObject("distance");
        distance["front"] = distanceMm / 10;
    }

    JsonObject gas = doc.createNestedObject("gas");
    gas["level"] = gasRaw;

    if (dhtOk) {
        JsonObject environment = doc.createNestedObject("environment");
        environment["temperature"] = airTemp;
        environment["humidity"] = humidity;
    }
    Serial.print("SENSOR:");
    serializeJson(doc, Serial);
    Serial.println();
}

// ── 18개 서보 일괄 설정 ──
// angles_left[3][3]: 왼쪽 다리 [다리번호][coxa,femur,tibia]
// angles_right[3][3]: 오른쪽 다리
void setAllServos(float left[3][3], float right[3][3]) {
    for (int leg = 0; leg < 3; leg++) {
        int ch_base = leg * 3;
        // 왼쪽 (0x41)
        setAdjustedServo(pca_left, ch_base + 0, left[leg][0],
                         COXA_NEUTRAL, left_offset[leg][0], left_direction[leg][0]);
        setAdjustedServo(pca_left, ch_base + 1, left[leg][1],
                         FEMUR_NEUTRAL, left_offset[leg][1], left_direction[leg][1]);
        setAdjustedServo(pca_left, ch_base + 2, left[leg][2],
                         TIBIA_NEUTRAL, left_offset[leg][2], left_direction[leg][2]);
        // 오른쪽 (0x40)
        setAdjustedServo(pca_right, ch_base + 0, right[leg][0],
                         COXA_NEUTRAL, right_offset[leg][0], right_direction[leg][0]);
        setAdjustedServo(pca_right, ch_base + 1, right[leg][1],
                         FEMUR_NEUTRAL, right_offset[leg][1], right_direction[leg][1]);
        setAdjustedServo(pca_right, ch_base + 2, right[leg][2],
                         TIBIA_NEUTRAL, right_offset[leg][2], right_direction[leg][2]);
    }
}

// ── 기본 자세 (모든 서보 중립) ──
void standDefault() {
    float neutral[3][3] = {
        {COXA_NEUTRAL, FEMUR_NEUTRAL, TIBIA_NEUTRAL},
        {COXA_NEUTRAL, FEMUR_NEUTRAL, TIBIA_NEUTRAL},
        {COXA_NEUTRAL, FEMUR_NEUTRAL, TIBIA_NEUTRAL}
    };
    setAllServos(neutral, neutral);
}

void fillStandPose(float left[3][3], float right[3][3]) {
    for (int leg = 0; leg < 3; leg++) {
        left[leg][0] = COXA_NEUTRAL;
        left[leg][1] = FEMUR_NEUTRAL;
        left[leg][2] = TIBIA_NEUTRAL;
        right[leg][0] = COXA_NEUTRAL;
        right[leg][1] = FEMUR_NEUTRAL;
        right[leg][2] = TIBIA_NEUTRAL;
    }
}

void liftLeftLeg(float left[3][3], int leg) {
    left[leg][1] = FEMUR_NEUTRAL - WALK_FEMUR_LIFT;
}

void liftRightLeg(float right[3][3], int leg) {
    right[leg][1] = FEMUR_NEUTRAL - WALK_FEMUR_LIFT;
}

void applyWalkPhase(int phase) {
    float left[3][3];
    float right[3][3];
    fillStandPose(left, right);

    switch (phase) {
        case 0:
            liftLeftLeg(left, 0);
            liftRightLeg(right, 1);
            liftLeftLeg(left, 2);
            break;
        case 1:
            liftLeftLeg(left, 0);
            liftRightLeg(right, 1);
            liftLeftLeg(left, 2);
            left[0][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            right[1][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            left[2][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            right[0][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            left[1][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            right[2][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            break;
        case 2:
            break;
        case 3:
            liftRightLeg(right, 0);
            liftLeftLeg(left, 1);
            liftRightLeg(right, 2);
            break;
        case 4:
            liftRightLeg(right, 0);
            liftLeftLeg(left, 1);
            liftRightLeg(right, 2);
            right[0][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            left[1][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            right[2][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            left[0][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            right[1][0] = COXA_NEUTRAL + WALK_COXA_SWING;
            left[2][0] = COXA_NEUTRAL - WALK_COXA_SWING;
            break;
        default:
            break;
    }

    setAllServos(left, right);
}

void setStandMode(const char* reason) {
    motionMode = MODE_STAND;
    walkPhase = 0;
    standDefault();
    lastCommandAt = millis();
    failSafeActive = false;
    Serial.print("MODE:STAND");
    if (reason != NULL) {
        Serial.print(":");
        Serial.print(reason);
    }
    Serial.println();
}

void setWalkMode() {
    motionMode = MODE_WALK;
    walkPhase = 0;
    lastWalkAt = 0;
    lastCommandAt = millis();
    failSafeActive = false;
    Serial.println("MODE:WALK");
}

void updateWalkMode() {
    if (motionMode != MODE_WALK) {
        return;
    }

    unsigned long now = millis();
    if (lastWalkAt != 0 && now - lastWalkAt < WALK_STEP_INTERVAL_MS) {
        return;
    }

    lastWalkAt = now;
    applyWalkPhase(walkPhase);
    walkPhase = (walkPhase + 1) % 6;
}

// ── JSON 파싱 및 서보 제어 ──
const char* processCommand(const String& jsonStr) {
    StaticJsonDocument<512> doc;
    DeserializationError err = deserializeJson(doc, jsonStr);

    if (err) {
        return "BAD_JSON";
    }

    if (!doc["L"].is<JsonArray>() || !doc["R"].is<JsonArray>() ||
        doc["L"].size() != 3 || doc["R"].size() != 3) {
        return "MISSING_LR";
    }

    // {"L":[[c,f,t],[c,f,t],[c,f,t]],"R":[[c,f,t],[c,f,t],[c,f,t]]}
    float left[3][3], right[3][3];

    for (int i = 0; i < 3; i++) {
        if (!doc["L"][i].is<JsonArray>() || !doc["R"][i].is<JsonArray>() ||
            doc["L"][i].size() != 3 || doc["R"][i].size() != 3) {
            return "BAD_LEG_ARRAY";
        }

        left[i][0]  = doc["L"][i][0]  | NAN;
        left[i][1]  = doc["L"][i][1]  | NAN;
        left[i][2]  = doc["L"][i][2]  | NAN;
        right[i][0] = doc["R"][i][0]  | NAN;
        right[i][1] = doc["R"][i][1]  | NAN;
        right[i][2] = doc["R"][i][2]  | NAN;

        if (!isValidJointAngle(left[i][0], COXA_MIN, COXA_MAX) ||
            !isValidJointAngle(left[i][1], FEMUR_MIN, FEMUR_MAX) ||
            !isValidJointAngle(left[i][2], TIBIA_MIN, TIBIA_MAX) ||
            !isValidJointAngle(right[i][0], COXA_MIN, COXA_MAX) ||
            !isValidJointAngle(right[i][1], FEMUR_MIN, FEMUR_MAX) ||
            !isValidJointAngle(right[i][2], TIBIA_MIN, TIBIA_MAX)) {
            return "ANGLE_RANGE";
        }
    }

    setAllServos(left, right);
    motionMode = MODE_STAND;
    lastCommandAt = millis();
    failSafeActive = false;
    return NULL;
}

void sendAck(const String& type, const String& sequence = "") {
    Serial.print("ACK:");
    Serial.print(type);
    if (sequence.length() > 0) {
        Serial.print(":");
        Serial.print(sequence);
    }
    Serial.println();
}

void sendNack(const String& type, const String& sequence, const char* reason) {
    Serial.print("NACK:");
    Serial.print(type);
    if (sequence.length() > 0) {
        Serial.print(":");
        Serial.print(sequence);
    }
    Serial.print(":");
    Serial.println(reason);
}

void processLine(const String& line) {
    String command = line;
    command.trim();

    if (command == "HELLO:" PROTOCOL_VERSION) {
        handshakeComplete = true;
        lastCommandAt = millis();
        failSafeActive = false;
        Serial.println("ACK:HELLO:" PROTOCOL_VERSION);
        return;
    }

    if (!handshakeComplete) {
        if (command.startsWith("CMD:") && command.endsWith(":STOP")) {
            setStandMode("UNAUTH_STOP");
        }
        Serial.println("NACK:HELLO:REQUIRED");
        return;
    }

    if (command.startsWith("PING:")) {
        String sequence = command.substring(5);
        if (!isNumericSequence(sequence)) {
            sendNack("PING", "", "MISSING_SEQUENCE");
            return;
        }
        lastCommandAt = millis();
        failSafeActive = false;
        sendAck("PING", sequence);
        return;
    }

    if (command.startsWith("CMD:")) {
        int separator = command.indexOf(':', 4);
        if (separator < 0) {
            sendNack("CMD", "", "BAD_FORMAT");
            return;
        }

        String sequence = command.substring(4, separator);
        String action = command.substring(separator + 1);
        action.toUpperCase();

        if (!isNumericSequence(sequence) || action.length() == 0) {
            sendNack("CMD", sequence, "BAD_FORMAT");
            return;
        }

        if (action == "STAND" || action == "STOP") {
            setStandMode(action.c_str());
        } else if (action == "WALK" || action == "FORWARD") {
            setWalkMode();
        } else {
            sendNack("CMD", sequence, "UNKNOWN_COMMAND");
            return;
        }
        sendAck("CMD", sequence);
        return;
    }

    if (command.startsWith("FRAME:")) {
        int separator = command.indexOf(':', 6);
        if (separator < 0) {
            sendNack("FRAME", "", "BAD_FORMAT");
            return;
        }

        String sequence = command.substring(6, separator);
        String json = command.substring(separator + 1);
        if (!isNumericSequence(sequence) || json.length() == 0) {
            sendNack("FRAME", sequence, "BAD_FORMAT");
            return;
        }

        const char* error = processCommand(json);
        if (error != NULL) {
            sendNack("FRAME", sequence, error);
            return;
        }
        sendAck("FRAME", sequence);
        return;
    }

    Serial.println("NACK:UNKNOWN:BAD_PREFIX");
}

void setup() {
    Serial.begin(115200);
    delay(300);
    Serial.println("ARES_BOOT");

    Wire.begin();
#if defined(WIRE_HAS_TIMEOUT)
    Wire.setWireTimeout(I2C_TIMEOUT_US, false);
#endif
    dht.begin();

    pinMode(HC_SR04_TRIG_PIN, OUTPUT);
    pinMode(HC_SR04_ECHO_PIN, INPUT);
    pinMode(MQ2_PIN, INPUT);
    pinMode(INTERRUPT_PIN, INPUT);

#if ENABLE_MPU_SENSOR_READ || ENABLE_MPU_AUTO_CALIBRATION
    Serial.println("MPU initialization starting");
    activeMpuPresent = initializeMpu();
#else
    activeMpuPresent = false;
    Serial.println("MPU initialization skipped");
#endif

#if ENABLE_MPU_AUTO_CALIBRATION
    calibrateMpu();
#else
    Serial.println("MPU auto calibration skipped");
#endif

#if ENABLE_SERVO_OUTPUT
    Serial.println("PCA9685 initialization starting");
    pca_left.begin();
    pca_left.setPWMFreq(SERVO_FREQ);
    pca_right.begin();
    pca_right.setPWMFreq(SERVO_FREQ);

    delay(100);
    standDefault();
#else
    Serial.println("PCA9685 servo output skipped for sensor diagnosis");
#endif
    lastCommandAt = millis();
    lastSensorAt = millis();

    Serial.println("SENSOR_LOOP_READY");
    Serial.println("ARES_READY");
}

void loop() {
    // 시리얼 데이터 수신 (줄바꿈 기준)
    while (Serial.available()) {
        char c = Serial.read();
        if (c == '\n') {
            discardInputUntilNewline = false;
            if (inputBuffer.length() > 0) {
                processLine(inputBuffer);
                inputBuffer = "";
            }
        } else if (c != '\r' && !discardInputUntilNewline) {
            if (inputBuffer.length() >= MAX_FRAME_LEN) {
                inputBuffer = "";
                discardInputUntilNewline = true;
                Serial.println("NACK:FRAME:0:TOO_LONG");
            } else {
                inputBuffer += c;
            }
        }
    }

    if (handshakeComplete && !failSafeActive && millis() - lastCommandAt > SERIAL_TIMEOUT_MS) {
        motionMode = MODE_STAND;
        walkPhase = 0;
        standDefault();
        failSafeActive = true;
        handshakeComplete = false;
        Serial.println("FAILSAFE:SERIAL_TIMEOUT");
    }

    updateWalkMode();

    if (millis() - lastSensorAt >= SENSOR_INTERVAL_MS) {
        lastSensorAt = millis();
        sendSensorFrame();
    }
}
