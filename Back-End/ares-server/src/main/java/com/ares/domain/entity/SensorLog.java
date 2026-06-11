package com.ares.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "sensor_logs", indexes = {
        @Index(name = "idx_mission_time", columnList = "mission_id, timestamp")
})
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SensorLog {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mission_id")
    private Mission mission;

    // 생존자 탐지 센서
    private Double gasLevel;            // 가스 농도 (ppm)

    // 장애물 거리 센서 (cm)
    private Integer frontDistance;

    // 위치
    private Double heading;             // 진행 방향각 (0~360도)
    private Double speed;
    @Column(name = "pos_x")
    private Double posX;
    @Column(name = "pos_y")
    private Double posY;

    //온도 & 습도
    private Double temperature;
    private Double humidity;

    @Column(nullable = false)
    private LocalDateTime timestamp;



}
