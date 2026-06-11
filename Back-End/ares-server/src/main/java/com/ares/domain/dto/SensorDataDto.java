package com.ares.domain.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAlias;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class SensorDataDto {

    private String robotId;
    private Long missionId;
    private Long timestamp;

    // GPS 제거 → 자이로/가속도 센서로 교체
    private GyroPayload gyro;
    private DistancePayload distance;
    private GasPayload gas;
    private AiPayload ai;

    //온도 & 습도
    @JsonAlias("dht11")
    private EnvironmentPayload environment;


    private PositionPayload position;

    @Getter @Setter @NoArgsConstructor
    public static class PositionPayload {
        private Double posX;    // 데드 레코닝 추정 X
        private Double posY;    // 데드 레코닝 추정 Y
        private Double heading; // 현재 방향 (0~360)
    }
    @Getter @Setter @NoArgsConstructor
    public static class GyroPayload {
        private Double gyroZ;    // yaw 각속도 (deg/s) — 수평 회전, 방향 추론에 핵심
        private Double gyroX;    // roll 각속도 (deg/s)
        private Double gyroY;    // pitch 각속도 (deg/s)
        private Double accelX;   // X축 가속도 (m/s²)
        private Double accelY;   // Y축 가속도 (m/s²)
        private Double speed;    // 추정 속력 (m/s) — 엔코더 or 가속도 적분
    }

    @Getter @Setter @NoArgsConstructor
    public static class DistancePayload {
        private Integer front;
    }


    @Getter @Setter @NoArgsConstructor
    public static class EnvironmentPayload {
        private Double temperature;
        private Double humidity;
    }
    @Getter @Setter @NoArgsConstructor
    public static class GasPayload {
        private Double level;
    }

    @Getter @Setter @NoArgsConstructor
    public static class AiPayload {
        private Double survivalRate;
    }
}
