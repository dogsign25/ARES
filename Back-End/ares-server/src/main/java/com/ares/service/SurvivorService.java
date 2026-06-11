package com.ares.service;

import com.ares.domain.dto.AlertDto;
import com.ares.domain.dto.SensorDataDto;
import com.ares.domain.entity.Mission;
import com.ares.domain.entity.SurvivorMark;
import com.ares.repository.MissionRepository;
import com.ares.repository.SurvivorMarkRepository;
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
public class SurvivorService {

    private final SurvivorMarkRepository survivorMarkRepository;
    private final MissionRepository missionRepository;
    private final WebSocketPublisher webSocketPublisher;

    /**
     * 라즈베리파이가 명시적으로 alert 토픽으로 발행한 생존자 감지 이벤트 처리
     */
    @Transactional
    public void mark(AlertDto dto) {
        Mission mission = dto.getMissionId() != null
                ? missionRepository.findById(dto.getMissionId()).orElse(null)
                : null;

        SurvivorMark mark = SurvivorMark.builder()
                .mission(mission)
                .survivalRate(dto.getSurvivalRate())
                .detectedAt(toLocalDateTime(dto.getTimestamp()))
                .posX(dto.getPosX())
                .posY(dto.getPosY())
                .heading(dto.getHeading())
                .build();

        survivorMarkRepository.save(mark);

        // 프론트로 즉시 알림
        webSocketPublisher.broadcastAlert(dto);
    }

    /**
     * 센서 데이터에서 생존율 임계값 초과 시 자동 마킹
     * (alert 토픽 없이 sensors 토픽만으로 감지된 경우)
     */
    @Transactional
    public void autoMarkFromSensor(SensorDataDto dto) {
        Mission mission = dto.getMissionId() != null
                ? missionRepository.findById(dto.getMissionId()).orElse(null)
                : null;

        double survivalRate = dto.getAi() != null && dto.getAi().getSurvivalRate() != null
                ? dto.getAi().getSurvivalRate() : 0.0;

        SurvivorMark mark = SurvivorMark.builder()
                .mission(mission)
                .survivalRate(dto.getAi() != null ? dto.getAi().getSurvivalRate() : 0.0)
                .detectedAt(LocalDateTime.now())
                .posX(dto.getPosition() != null ? dto.getPosition().getPosX() : null)
                .posY(dto.getPosition() != null ? dto.getPosition().getPosY() : null)
                .heading(dto.getPosition() != null ? dto.getPosition().getHeading() : null)
                .build();

        survivorMarkRepository.save(mark);
        log.info("자동 생존자 마킹 | robotId: {} | survivalRate: {}", dto.getRobotId(), survivalRate);
    }

    private LocalDateTime toLocalDateTime(Long epochMilli) {
        if (epochMilli == null) return LocalDateTime.now();
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMilli), ZoneId.of("Asia/Seoul"));
    }
}