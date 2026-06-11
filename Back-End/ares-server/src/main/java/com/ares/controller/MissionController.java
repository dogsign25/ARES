package com.ares.controller;

import com.ares.domain.entity.Mission;
import com.ares.domain.entity.Robot;
import com.ares.domain.entity.User;
import com.ares.domain.entity.Zone;
import com.ares.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@RestController
@RequestMapping("/api/missions")
@RequiredArgsConstructor
public class MissionController {

    private final MissionRepository missionRepository;
    private final RobotRepository robotRepository;
    private final UserRepository userRepository;
    private final ZoneRepository zoneRepository;
    private final SensorLogRepository sensorLogRepository;
    private final SurvivorMarkRepository survivorMarkRepository;

    /** 미션 목록 조회 */
    @GetMapping
    public List<Mission> getAllMissions() {
        return missionRepository.findAll();
    }

    /** 특정 미션 상세 (센서 로그 + 생존자 마킹 포함) */
    @GetMapping("/{missionId}")
    public ResponseEntity<?> getMission(@PathVariable Long missionId) {
        return missionRepository.findById(missionId)
                .map(mission -> ResponseEntity.ok(Map.of(
                        "mission", mission,
                        "zones", mission.getZones(),
                        "sensorLogs", sensorLogRepository.findByMissionIdOrderByTimestampAsc(missionId),
                        "survivorMarks", survivorMarkRepository.findByMissionIdOrderByDetectedAtDesc(missionId)
                )))
                .orElse(ResponseEntity.notFound().build());
    }

    /** 미션 시작 */
    @PostMapping("/start")
    public ResponseEntity<?> startMission(@RequestBody Map<String, Object> body) {
        Long userId = parseRequiredLong(body, "userId");
        String sido = requiredString(body, "sido");
        String sigungu = requiredString(body, "sigungu");
        String dong = requiredString(body, "dong");
        String description = requiredString(body, "description");

        if (userId == null || sido == null || sigungu == null || dong == null || description == null) {
            return ResponseEntity.badRequest().body("userId, sido, sigungu, dong, description은 필수입니다.");
        }

        User user = userRepository.findById(userId).orElse(null);
        if (user == null) {
            return ResponseEntity.badRequest().body("유저(관리자)를 찾을 수 없습니다 ID: " + userId);
        }


        Mission mission = missionRepository.save(Mission.builder()
                .user(user)
                .sido(sido)
                .sigungu(sigungu)
                .dong(dong)
                .description(description)
                .startedAt(LocalDateTime.now())
                .status(Mission.MissionStatus.IN_PROGRESS)
                .build());

        return ResponseEntity.ok(mission);
    }

    @DeleteMapping("/{missionId}")
    @Transactional
    public ResponseEntity<?> deleteMission(@PathVariable Long missionId) {

        return missionRepository.findById(missionId)
                .map(mission -> {
                    mission.getZones().forEach(this::releaseRobotIfAssigned);

                    missionRepository.delete(mission);

                    return ResponseEntity.ok("미션이 삭제되었습니다.");
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PostMapping("/{missionId}/zones")
    @Transactional
    public ResponseEntity<?> addZoneToMission(@PathVariable Long missionId, @RequestBody Map<String, String> body) {
        String zoneName = body.get("zoneName");
        if (zoneName == null || zoneName.isBlank()) {
            return ResponseEntity.badRequest().body("zoneName은 필수입니다.");
        }

        return missionRepository.findById(missionId).map(mission -> {
            Zone zone = Zone.builder()
                    .zoneName(zoneName.trim())
                    .build();
            mission.addZone(zone); // 연관관계 편의 메서드로 추가
            missionRepository.save(mission); // CascadeType.ALL로 구역도 같이 저장됨
            return ResponseEntity.ok(zone);
        }).orElse(ResponseEntity.notFound().build());
    }

    @DeleteMapping("/{missionId}/zones/{zoneId}")
    @Transactional
    public ResponseEntity<?> deleteZoneFromMission(@PathVariable Long missionId, @PathVariable Long zoneId) {
        return missionRepository.findById(missionId).map(mission -> {
            mission.getZones().removeIf(zone -> {
                if (!zone.getId().equals(zoneId)) {
                    return false;
                }
                releaseRobotIfAssigned(zone);
                return true;
            });
            missionRepository.save(mission);
            return ResponseEntity.ok().body("구역이 삭제되었습니다.");
        }).orElse(ResponseEntity.notFound().build());
    }

    @PatchMapping("/zones/{zoneId}/status")
    @Transactional
    public ResponseEntity<?> updateZoneStatus(@PathVariable Long zoneId, @RequestBody Map<String, String> body) {
        String statusStr = body.get("status"); // READY, RUNNING, COMPLETED
        Zone.ZoneStatus status;
        try {
            status = Zone.ZoneStatus.valueOf(statusStr);
        } catch (Exception e) {
            return ResponseEntity.badRequest().body("지원하지 않는 구역 상태입니다: " + statusStr);
        }

        return zoneRepository.findById(zoneId).map(zone -> {
            zone.setStatus(status);
            return ResponseEntity.ok(zoneRepository.save(zone));
        }).orElse(ResponseEntity.notFound().build());
    }

    /** 미션 종료 */
    @PostMapping("/{missionId}/end")
    public ResponseEntity<?> endMission(@PathVariable Long missionId) {
        return missionRepository.findById(missionId)
                .map(mission -> {
                    mission.getZones().forEach(this::releaseRobotIfAssigned);
                    mission.setStatus(Mission.MissionStatus.COMPLETED);
                    mission.setEndedAt(LocalDateTime.now());
                    mission.getZones().forEach(zone -> zone.setStatus(Zone.ZoneStatus.COMPLETED));
                    return ResponseEntity.ok(missionRepository.save(mission));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/zones/{zoneId}/assign")
    @Transactional
    public ResponseEntity<?> assignOperatorAndRobot(@PathVariable Long zoneId, @RequestBody Map<String, String> body) {
        String operator = body.get("operator");
        String robotId = body.get("robotId");
        if (operator == null || operator.isBlank() || robotId == null || robotId.isBlank()) {
            return ResponseEntity.badRequest().body("operator와 robotId는 필수입니다.");
        }
        final String assignedOperator = operator.trim();
        final String assignedRobotId = robotId.trim();

        Optional<Zone> activeZone =
                zoneRepository.findByOperatorAndStatus(
                        assignedOperator,
                        Zone.ZoneStatus.RUNNING
                );

        if (activeZone.isPresent()
                && !activeZone.get().getId().equals(zoneId)) {
            return ResponseEntity.badRequest()
                    .body("이미 다른 구역을 탐색중입니다.");
        }

        Robot robot = robotRepository
                .findByRobotKey(assignedRobotId)
                .orElseThrow(() ->
                        new RuntimeException("로봇을 찾을 수 없습니다."));

        if (robot.getUsageStatus() == Robot.UsageStatus.IN_USE) {
            Optional<Zone> currentZone = zoneRepository.findById(zoneId);
            if (currentZone.isEmpty()
                    || !assignedRobotId.equals(currentZone.get().getRobotId())) {
                return ResponseEntity.badRequest()
                        .body("이미 사용중인 로봇입니다.");
            }
        }

        return zoneRepository.findById(zoneId).map(zone -> {
            releaseRobotIfAssigned(zone);

            zone.setOperator(assignedOperator);
            zone.setRobotId(assignedRobotId);
            zone.setStatus(Zone.ZoneStatus.RUNNING);
            robot.setUsageStatus(Robot.UsageStatus.IN_USE);
            robotRepository.save(robot);
            zoneRepository.save(zone);
            return ResponseEntity.ok(zone);

        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/zones/{zoneId}/release")
    @Transactional
    public ResponseEntity<?> releaseZoneAssignment(@PathVariable Long zoneId) {
        return zoneRepository.findById(zoneId).map(zone -> {
            releaseRobotIfAssigned(zone);
            zone.setOperator(null);
            zone.setRobotId(null);
            zone.setStatus(Zone.ZoneStatus.READY); // 대기 상태로 복귀
            return ResponseEntity.ok(zoneRepository.save(zone));
        }).orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/active-zone")
    public ResponseEntity<?> getActiveZoneByOperatorParam(@RequestParam String operator) {
        return activeZoneResponse(operator);
    }

    @GetMapping("/active-zone/{operator}")
    public ResponseEntity<?> getActiveZoneByOperator(@PathVariable String operator) {
        // URL 디코딩 등의 문제를 방지하고 깔끔하게 경로에서 운영자 이름을 파싱합니다.
        System.out.println("===== active-zone 진입 =====");
        System.out.println("operator = " + operator);

        return activeZoneResponse(operator);
    }

    private ResponseEntity<?> activeZoneResponse(String operator) {
        if (operator == null || operator.isBlank()) {
            return ResponseEntity.badRequest().body("operator는 필수입니다.");
        }

        Optional<Zone> activeZone = zoneRepository.findByOperatorAndStatus(
                operator.trim(),
                Zone.ZoneStatus.RUNNING
        );

        if (activeZone.isPresent()) {
            Zone zone = activeZone.get();
            Map<String, Object> result = new HashMap<>();

            if (zone.getMission() != null) {
                result.put("missionId", zone.getMission().getId());
            } else {
                result.put("missionId", null);
            }

            result.put("zoneId", zone.getId());
            result.put("robotId", zone.getRobotId());
            return ResponseEntity.ok(result);
        }

        return ResponseEntity.noContent().build();
    }

    @PutMapping("/zones/{zoneId}/complete")
    @Transactional
    public ResponseEntity<?> completeZone(@PathVariable Long zoneId) {

        return zoneRepository.findById(zoneId).map(zone -> {

            releaseRobotIfAssigned(zone);

            zone.setStatus(Zone.ZoneStatus.COMPLETED);
            zone.setOperator(null);
            zone.setRobotId(null);

            return ResponseEntity.ok(zoneRepository.save(zone));

        }).orElse(ResponseEntity.notFound().build());
    }

    @PutMapping("/zones/{zoneId}/abort")
    @Transactional
    public ResponseEntity<?> abortZone(@PathVariable Long zoneId) {

        return zoneRepository.findById(zoneId).map(zone -> {

            releaseRobotIfAssigned(zone);

            zone.setStatus(Zone.ZoneStatus.ABORTED);
            zone.setOperator(null);
            zone.setRobotId(null);

            return ResponseEntity.ok(zoneRepository.save(zone));

        }).orElse(ResponseEntity.notFound().build());
    }

    private void releaseRobotIfAssigned(Zone zone) {
        if (zone.getRobotId() == null || zone.getRobotId().isBlank()) {
            return;
        }
        robotRepository.findByRobotKey(zone.getRobotId())
                .ifPresent(robot -> {
                    robot.setUsageStatus(Robot.UsageStatus.AVAILABLE);
                    robotRepository.save(robot);
                });
    }

    private Long parseRequiredLong(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (value == null) return null;
        try {
            return Long.valueOf(value.toString());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private String requiredString(Map<String, Object> body, String key) {
        Object value = body.get(key);
        if (value == null) return null;
        String text = value.toString().trim();
        return text.isEmpty() ? null : text;
    }


}
