package com.ares.service;

import com.ares.domain.dto.SensorBroadcastDto;
import com.ares.domain.dto.SensorDataDto;
import com.ares.domain.entity.Mission;
import com.ares.domain.entity.SensorLog;
import com.ares.repository.MissionRepository;
import com.ares.repository.SensorLogRepository;
import com.ares.websocket.WebSocketPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

@Slf4j
@Service
@RequiredArgsConstructor
public class SensorService {

    private static final int OBSTACLE_WARN_CM = 20;
    private static final double AUTO_MARK_THRESHOLD = 0.7;

    private final SensorLogRepository sensorLogRepository;
    private final MissionRepository missionRepository;
    private final SurvivorService survivorService;
    private final WebSocketPublisher webSocketPublisher;
    private final SensorRealtimeStore realtimeStore;

    @Transactional
    public void process(SensorDataDto dto) {
        SensorBroadcastDto broadcastDto = toBroadcastDto(dto);
        realtimeStore.update(broadcastDto);
        webSocketPublisher.broadcastSensor(broadcastDto);

        Mission mission = resolveMission(dto.getMissionId());

        SensorLog sensorLog = toEntity(dto, mission);
        sensorLogRepository.save(sensorLog);

        /*
        double survivalRate = getSurvivalRate(dto);
        if (survivalRate >= AUTO_MARK_THRESHOLD) {
            survivorService.autoMarkFromSensor(dto);
        }
        */
    }

    private Mission resolveMission(Long missionId) {
        if (missionId == null) return null;
        return missionRepository.findById(missionId)
                .orElseGet(() -> {
                    log.warn("존재하지 않는 missionId: {}", missionId);
                    return null;
                });
    }

    private SensorLog toEntity(SensorDataDto dto, Mission mission) {
        LocalDateTime ts = dto.getTimestamp() != null
                ? LocalDateTime.ofInstant(Instant.ofEpochMilli(dto.getTimestamp()), ZoneId.of("Asia/Seoul"))
                : LocalDateTime.now();

        return SensorLog.builder()
                .mission(mission)
                .timestamp(ts)
                // 위치는 프론트에서 dead reckoning으로 계산하므로 저장 안 함
                .frontDistance(dto.getDistance() != null ? dto.getDistance().getFront() : null)
                .posX(dto.getPosition() != null ? dto.getPosition().getPosX() : null)
                .posY(dto.getPosition() != null ? dto.getPosition().getPosY() : null)
                .heading(dto.getPosition() != null ? dto.getPosition().getHeading() : null)
                .speed(dto.getGyro() != null ? dto.getGyro().getSpeed() : null)
                .gasLevel(dto.getGas() != null ? dto.getGas().getLevel() : null)
                .temperature(dto.getEnvironment() != null ? dto.getEnvironment().getTemperature() : null)
                .humidity(dto.getEnvironment() != null ? dto.getEnvironment().getHumidity() : null)
                .build();
    }

    private SensorBroadcastDto toBroadcastDto(SensorDataDto dto) {
        Integer frontDist = dto.getDistance() != null ? dto.getDistance().getFront() : null;

        return SensorBroadcastDto.builder()
                .robotId(dto.getRobotId())
                .missionId(dto.getMissionId())
                .timestamp(LocalDateTime.now())
                .gyroX(dto.getGyro() != null ? dto.getGyro().getGyroX() : null)
                .gyroY(dto.getGyro() != null ? dto.getGyro().getGyroY() : null)
                .gyroZ(dto.getGyro() != null ? dto.getGyro().getGyroZ() : null)
                .accelX(dto.getGyro() != null ? dto.getGyro().getAccelX() : null)
                .accelY(dto.getGyro() != null ? dto.getGyro().getAccelY() : null)
                .speed(dto.getGyro() != null ? dto.getGyro().getSpeed() : null)
                .frontDistance(frontDist)
                .gas(dto.getGas() != null ?
                        SensorBroadcastDto.GasPayload.builder()
                                .level(dto.getGas().getLevel())
                                .build()
                        : null)
                .survivalRate(getSurvivalRate(dto))
                .temperature(dto.getEnvironment() != null ? dto.getEnvironment().getTemperature() : null)
                .humidity(dto.getEnvironment() != null ? dto.getEnvironment().getHumidity() : null)
                .obstacleWarning(frontDist != null && frontDist < OBSTACLE_WARN_CM)
                .position(dto.getPosition() != null ?
                        SensorBroadcastDto.PositionPayload.builder()
                                .posX(dto.getPosition().getPosX())
                                .posY(dto.getPosition().getPosY())
                                .heading(dto.getPosition().getHeading())
                                .build()
                        : null)
                .build();
    }

    private Double getSurvivalRate(SensorDataDto dto) {
        if (dto.getAi() == null) return null;
        return dto.getAi().getSurvivalRate();
    }
}
