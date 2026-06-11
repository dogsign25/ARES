package com.ares.domain.dto;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.*;
import java.time.LocalDateTime;

/**
 * 백엔드 → React 프론트로 WebSocket(/topic/sensors/{robotId}) 을 통해 전송
 * 라즈베리파이 DTO를 그대로 넘기지 않고 정제된 형태로 변환
 */
@Getter
@Setter
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonInclude(JsonInclude.Include.NON_NULL)
public class SensorBroadcastDto {

    private String robotId;
    private Long missionId;
    private LocalDateTime timestamp;

    // 자이로 원시값
    private Double gyroX;
    private Double gyroY;
    private Double gyroZ;       // yaw 각속도 (deg/s)
    private Double accelX;
    private Double accelY;
    private Double speed;       // 추정 속력 (m/s)

    //위치 & 습도
    private Double temperature;
    private Double humidity;

    // 거리 센서
    private Integer frontDistance;

    // 탐지 센서
    private GasPayload gas;
    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
    public static class GasPayload {
        private Double level;
    }
    // AI
    private Double survivalRate;

    // 장애물 경고
    private Boolean obstacleWarning;

    private PositionPayload position;

    @Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder // 빌더 추가
    public static class PositionPayload {
        private Double posX;
        private Double posY;
        private Double heading;
    }
}
