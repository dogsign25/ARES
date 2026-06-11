package com.ares.controller;

import com.ares.mqtt.MqttPublisher;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * React → 백엔드 → MQTT → 라즈베리파이 로봇 제어 명령
 * mock.enabled=false 일 때만 활성화 (Mock 중엔 실제 명령 불필요)
 */
@RestController
@RequestMapping("/api/robots/{robotId}/command")
@RequiredArgsConstructor
@ConditionalOnProperty(name = "mock.enabled", havingValue = "false", matchIfMissing = true)
public class RobotCommandController {

    private static final Set<String> ALLOWED_GAITS = Set.of(
            "WALK",
            "BACKWARD",
            "TURN_LEFT",
            "TURN_RIGHT",
            "STOP"
    );

    private final MqttPublisher mqttPublisher;

    /**
     * 이동 명령: { "gait": "WALK" | "BACKWARD" | "STOP" | "TURN_LEFT" | "TURN_RIGHT" }
     */
    @PostMapping("/move")
    public ResponseEntity<?> sendMoveCommand(
            @PathVariable String robotId,
            @RequestBody Map<String, Object> command) {
        if (robotId == null || robotId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "robotId is required"));
        }

        String gait = normalizeGait(extractCommand(command));
        if (gait == null) {
            return ResponseEntity
                    .status(HttpStatus.BAD_REQUEST)
                    .body(Map.of(
                            "error", "Invalid robot command",
                            "allowed", ALLOWED_GAITS
                    ));
        }

        Map<String, Object> safeCommand = Map.of(
                "gait", gait,
                "requestedAt", Instant.now().toString()
        );

        mqttPublisher.publish(robotId, safeCommand);
        return ResponseEntity.ok(Map.of("sent", true, "command", safeCommand));
    }

    /**
     * 긴급 정지
     */
    @PostMapping("/stop")
    public ResponseEntity<?> emergencyStop(@PathVariable String robotId) {
        if (robotId == null || robotId.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "robotId is required"));
        }

        Map<String, Object> cmd = Map.of(
                "gait", "STOP",
                "emergency", true,
                "requestedAt", Instant.now().toString()
        );
        mqttPublisher.publish(robotId, cmd);
        return ResponseEntity.ok(Map.of("sent", true, "command", cmd));
    }

    private Object extractCommand(Map<String, Object> command) {
        if (command == null) {
            return null;
        }

        for (String key : new String[]{"gait", "command", "action", "direction"}) {
            Object value = command.get(key);
            if (value != null) {
                return value;
            }
        }

        return null;
    }

    private String normalizeGait(Object rawCommand) {
        if (rawCommand == null) {
            return null;
        }

        String value = rawCommand.toString().trim().toUpperCase(Locale.ROOT);
        value = switch (value) {
            case "FORWARD", "W" -> "WALK";
            case "BACK", "REVERSE", "S" -> "BACKWARD";
            case "LEFT", "A" -> "TURN_LEFT";
            case "RIGHT", "D" -> "TURN_RIGHT";
            case "IDLE", "EMERGENCY_STOP" -> "STOP";
            default -> value;
        };

        return ALLOWED_GAITS.contains(value) ? value : null;
    }
}
