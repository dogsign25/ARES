package com.ares.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "robots")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Robot {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String robotKey;        // "robot-01" 같은 식별 문자열 (MQTT topic의 robotId)

    @Enumerated(EnumType.STRING)
    private RobotStatus status;

    @Enumerated(EnumType.STRING)
    @Column(name = "usage_status")
    private UsageStatus usageStatus;

//    private String gaitMode;
// WALK / TURN / STOP / IDLE

    private LocalDateTime lastSeenAt;

    //로봇 생성 시간 추가
    private LocalDateTime createdAt;

    public enum RobotStatus {
        ONLINE, OFFLINE, ERROR
    }

    public enum UsageStatus {
        AVAILABLE, IN_USE
    }
}