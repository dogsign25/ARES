package com.ares.service;

import com.ares.domain.entity.Robot;
import com.ares.domain.dto.RobotRequestDto;
import com.ares.domain.dto.RobotResponseDto;
import com.ares.repository.RobotRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class RobotService {

    private final RobotRepository robotRepository;

    // 로봇 전체 조회
    public List<RobotResponseDto> findAllRobots() {
        return robotRepository.findAll().stream()
                .map(RobotResponseDto::new)
                .collect(Collectors.toList());
    }

    public RobotResponseDto findRobotByKey(String robotKey) {
        Robot robot = robotRepository.findByRobotKey(robotKey)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 로봇 Key입니다."));

        return new RobotResponseDto(robot); // 엔티티를 DTO로 변환해서 반환
    }

    // 로봇 등록
    @Transactional
    public RobotResponseDto registerRobot(RobotRequestDto requestDto) {
        if (requestDto == null || requestDto.getRobotKey() == null || requestDto.getRobotKey().isBlank()) {
            throw new IllegalArgumentException("로봇 Key는 필수입니다.");
        }

        String robotKey = requestDto.getRobotKey().trim();
        if (robotRepository.existsByRobotKey(robotKey)) {
            throw new IllegalArgumentException("이미 등록된 로봇 Key입니다.");
        }

        Robot robot = Robot.builder()
                .robotKey(robotKey)
                .status(Robot.RobotStatus.OFFLINE) // 최초 등록 시 오프라인이 기본값인 경우가 많음 (선택 변경 가능)
                .usageStatus(Robot.UsageStatus.AVAILABLE)
                .createdAt(LocalDateTime.now())
                .lastSeenAt(LocalDateTime.now()) // 혹은 null
                .build();

        Robot savedRobot = robotRepository.save(robot);
        return new RobotResponseDto(savedRobot);
    }

    // 로봇 삭제
    @Transactional
    public void deleteRobot(Long id) {
        Robot robot = robotRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 로봇입니다."));
        robotRepository.delete(robot);
    }

}
