package com.ares.domain.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.*;

/**
 * 라즈베리파이가 생존자 감지 시 즉시 발행하는 이벤트
 *
 * 토픽: hexapod/{robotId}/alert
 *
 * {
 *   "robotId": "robot-01",
 *   "missionId": 1,
 *   "timestamp": 1710000000000,
 *   "lat": 37.501,
 *   "lng": 127.001,
 *   "survivalRate": 0.91,
 *   "triggers": {
 *     "camera": true,
 *     "thermal": true,
 *     "sound": false
 *   },
 *   "snapshotUrl": "http://192.168.0.10:5000/snapshot/abc.jpg"
 * }
 */
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class AlertDto {

    private String robotId;
    private Long missionId;
    private Long timestamp;

    private Double posX;      // lat 대신 변경
    private Double posY;      // lng 대신 변경
    private Double heading;   // 감지 당시 방향 추가
    private Double survivalRate;

//    private TriggerPayload triggers;
//
//    @Getter @Setter @NoArgsConstructor
//    public static class TriggerPayload {
//        private Boolean camera;
//        private Boolean thermal;
//        private Boolean sound;
//    }
}