package com.ares.mock;

import com.ares.domain.dto.AlertDto;
import com.ares.domain.dto.SensorDataDto;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Random;

/**
 * 실제 라즈베리파이가 보내는 것과 동일한 형태의 DTO를 생성
 * 재난 현장 정찰 시뮬레이션:
 *   - 4개 웨이포인트를 순환하며 이동
 *   - 거리 센서는 랜덤 장애물 반영
 *   - 열화상/가스/소음은 노이즈 포함한 정상 범위 유지
 *   - survivorRate 가 임계값 초과 시 alert 이벤트 발생
 */
@Slf4j
@Component
public class MockDataFactory {

    private final Random random = new Random();

    // 로봇 운동 상태
    private double posX = 0.0;
    private double posY = 0.0;
    private double heading = 0.0;      // 현재 방향각 (deg)
    private double speed = 0.15;        // 이동 속력 (m/s)
    private long lastTick = System.currentTimeMillis();
    private int phase = 0;              // 0:직진 1:좌회전 2:직진 3:우회전 순환
    private int phaseTick = 0;

    public SensorDataDto nextSensorData(String robotId, Long missionId) {
        long now = System.currentTimeMillis();
        double dt = (now - lastTick) / 1000.0;  // 초 단위
        lastTick = now;

        // ── 페이즈별 각속도 시뮬레이션 ──
        // 직진: gyroZ ≈ 0, 회전: gyroZ ≈ ±30 deg/s
        double gyroZ = simulateGyroZ();
        heading += gyroZ * dt;
        if (heading > 180) heading -= 360;
        if (heading < -180) heading += 360;
        double rad = Math.toRadians(heading);
        posX += Math.cos(rad) * speed * dt;
        posY += Math.sin(rad) * speed * dt;
        phaseTick++;
        if (phaseTick > 30) { phase = (phase + 1) % 4; phaseTick = 0; }

        SensorDataDto dto = new SensorDataDto();
        dto.setRobotId(robotId);
        dto.setMissionId(missionId);
        dto.setTimestamp(now);

        // 자이로 데이터
        SensorDataDto.GyroPayload gyro = new SensorDataDto.GyroPayload();
        gyro.setGyroZ(gyroZ + gaussian(0.5));          // yaw (핵심)
        gyro.setGyroX(gaussian(0.3));                   // roll 노이즈
        gyro.setGyroY(gaussian(0.3));                   // pitch 노이즈
        gyro.setAccelX(Math.cos(Math.toRadians(heading)) * speed + gaussian(0.02));
        gyro.setAccelY(Math.sin(Math.toRadians(heading)) * speed + gaussian(0.02));
        gyro.setSpeed(speed + gaussian(0.01));
        dto.setGyro(gyro);

        // 거리 센서
        SensorDataDto.DistancePayload dist = new SensorDataDto.DistancePayload();
        dist.setFront(simulateDistance(80));
        dto.setDistance(dist);

        // 온습도 센서
        SensorDataDto.EnvironmentPayload env = new SensorDataDto.EnvironmentPayload();
        env.setTemperature(20.0 + random.nextDouble() * 25.0); // 20~45도
        env.setHumidity(30.0 + random.nextDouble() * 40.0);   // 30~70%
        dto.setEnvironment(env);

        SensorDataDto.GasPayload gas = new SensorDataDto.GasPayload();
        gas.setLevel(10.0 + random.nextDouble() * 10.0);
        dto.setGas(gas);

        SensorDataDto.AiPayload ai = new SensorDataDto.AiPayload();
        ai.setSurvivalRate(0.05 + random.nextDouble() * 0.20);
        dto.setAi(ai);

        SensorDataDto.PositionPayload pos = new SensorDataDto.PositionPayload();
        pos.setPosX(posX);
        pos.setPosY(posY);
        pos.setHeading(heading);
        dto.setPosition(pos);
        return dto;
    }

    private double simulateGyroZ() {
        return switch (phase) {
            case 0 -> gaussian(1.0);          // 직진: gyroZ ≈ 0
            case 1 -> 30.0 + gaussian(2.0);   // 좌회전: +30 deg/s
            case 2 -> gaussian(1.0);          // 직진
            case 3 -> -30.0 + gaussian(2.0);  // 우회전: -30 deg/s
            default -> 0.0;
        };
    }

    public AlertDto createSurvivorAlert(String robotId, Long missionId, SensorDataDto base) {
        AlertDto alert = new AlertDto();
        alert.setRobotId(robotId);
        alert.setMissionId(missionId);
        alert.setTimestamp(System.currentTimeMillis());
        alert.setSurvivalRate(0.75 + random.nextDouble() * 0.24);

//        AlertDto.TriggerPayload triggers = new AlertDto.TriggerPayload();
//        triggers.setCamera(random.nextBoolean());
//        triggers.setThermal(true);
//        triggers.setSound(random.nextBoolean());
//        alert.setTriggers(triggers);
//
//        base.getThermal().setMaxTemp(36.5 + random.nextDouble() * 1.5);
//        base.getSound().setLevel(65.0 + random.nextDouble() * 20.0);
        base.getAi().setSurvivalRate(alert.getSurvivalRate());

        alert.setPosX(base.getPosition().getPosX()); // 현재 위치 복사[cite: 1]
        alert.setPosY(base.getPosition().getPosY());
        alert.setHeading(base.getPosition().getHeading());
        return alert;
    }

    private int simulateDistance(int base) {
        if (random.nextDouble() < 0.05) return 15 + random.nextInt(10);
        return Math.max(10, (int)(base + gaussian(20)));
    }

    private double gaussian(double std) {
        return random.nextGaussian() * std;
    }
}
