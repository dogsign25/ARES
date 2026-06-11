package com.ares.domain.dto;

import com.ares.domain.entity.Robot;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Getter;

import java.time.format.DateTimeFormatter;

@Getter
public class RobotResponseDto {
    private Long id;

    @JsonProperty("robot_key")
    private String robotKey;

    private String status;

    @JsonProperty("last_seen_at")
    private String lastSeenAt;

    public RobotResponseDto(Robot robot) {
        this.id = robot.getId();
        this.robotKey = robot.getRobotKey();
        this.status = robot.getStatus() == Robot.RobotStatus.ONLINE ? "온라인" : "오프라인";

        DateTimeFormatter formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");
        this.lastSeenAt = robot.getLastSeenAt() != null ? robot.getLastSeenAt().format(formatter) : "-";
    }
}