package com.ares.controller;

import com.ares.domain.dto.RobotRequestDto;
import com.ares.domain.dto.RobotResponseDto;
import com.ares.service.RobotService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/robots")
@RequiredArgsConstructor
public class RobotController {

    private final RobotService robotService;

    /** 1. 전체 로봇 목록 조회 */
    @GetMapping
    public ResponseEntity<List<RobotResponseDto>> getAllRobots() {
        List<RobotResponseDto> robots = robotService.findAllRobots();
        return ResponseEntity.ok(robots);
    }

    /** 2. 특정 로봇 조회 (로봇 키 기준) */
    @GetMapping("/{robotKey}")
    public ResponseEntity<?> getRobot(@PathVariable String robotKey) {
        try {
            RobotResponseDto response = robotService.findRobotByKey(robotKey);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /** 3. 새로운 로봇 등록 */
    @PostMapping
    public ResponseEntity<?> registerRobot(@RequestBody RobotRequestDto requestDto) {
        try {
            RobotResponseDto response = robotService.registerRobot(requestDto);
            return ResponseEntity.ok(response);
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }

    /** 4. 등록된 로봇 삭제 */
    @DeleteMapping("/{id}")
    public ResponseEntity<?> deleteRobot(@PathVariable Long id) {
        try {
            robotService.deleteRobot(id);
            return ResponseEntity.ok().build();
        } catch (IllegalArgumentException e) {
            return ResponseEntity.badRequest().body(e.getMessage());
        }
    }
}
