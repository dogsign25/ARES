package com.ares.mock;

import com.ares.config.MockProperties;
import com.ares.domain.dto.AlertDto;
import com.ares.domain.dto.SensorDataDto;
import com.ares.domain.entity.Mission;
import com.ares.domain.entity.Robot;
import com.ares.domain.entity.User;
import com.ares.repository.MissionRepository;
import com.ares.repository.RobotRepository;
import com.ares.repository.UserRepository;
import com.ares.service.SensorService;
import com.ares.service.SurvivorService;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Random;

/**
 * mock.enabled=true 일 때만 활성화
 * 실제 MQTT 없이 SensorService를 직접 호출해 데이터 파이프라인 전체를 테스트
 */
@Slf4j
@Component
@EnableScheduling
@RequiredArgsConstructor
@ConditionalOnProperty(name = "mock.enabled", havingValue = "true")
public class MockSensorScheduler {

    private final MockDataFactory factory;
    private final MockProperties props;
    private final SensorService sensorService;
    private final SurvivorService survivorService;
    private final RobotRepository robotRepository;
    private final MissionRepository missionRepository;
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    private final Random random = new Random();
    private Long missionId;

    /**
     * 앱 시작 시 Mock용 Robot + Mission 을 DB에 생성
     * 이미 존재하면 재사용
     */
    @PostConstruct
    public void init() {
        // 1. 기본 admin 계정 확인 및 생성 순서 조정 (아래 중복 체크 제거 및 최적화)
        User admin = userRepository.findByUsername("admin")
                .orElseGet(() -> {
                    User newAdmin = userRepository.save(User.builder()
                            .username("admin")
                            .password(passwordEncoder.encode("admin1234"))
                            .role(User.Role.ADMIN)
                            .createdAt(LocalDateTime.now())
                            .build());
                    log.info("✅ 기본 admin 계정 생성 완료 (admin / admin1234)");
                    return newAdmin;
                });

        // 2. Mock 로봇 확인 및 생성
        Robot robot = robotRepository.findByRobotKey(props.getRobotId())
                .orElseGet(() -> robotRepository.save(Robot.builder()
                        .robotKey(props.getRobotId())
                        .status(Robot.RobotStatus.ONLINE)
                        .createdAt(LocalDateTime.now())
                        .build()));

        // 3. 💡 리팩토링된 Mission 엔티티 필드에 맞춰 가상 미션 데이터 빌드
        Mission mission = missionRepository.findTopByStatusOrderByIdDesc(Mission.MissionStatus.IN_PROGRESS)
                .orElseGet(() -> missionRepository.save(Mission.builder()
                        .user(admin)     // nullable = false 만족
                        .sido("서울특별시")
                        .sigungu("구로구")
                        .dong("고척동")
                        .description("[MOCK AUTO] 가상 데이터 파이프라인 연동 테스트 실행 중")
                        .startedAt(LocalDateTime.now())
                        .status(Mission.MissionStatus.IN_PROGRESS)
                        .build()));

        missionId = mission.getId();
        log.info("✅ Mock 미션 준비 완료 | missionId: {}, 할당 로봇: {}", missionId, robot.getRobotKey());
    }

    /**
     * 1초마다 센서 데이터 생성 → SensorService.process() 호출
     * intervalMs 는 fixedDelayString 으로 설정
     */
    @Scheduled(fixedDelayString = "${mock.interval-ms}")
    public void generateSensorData() {
        try {
            SensorDataDto sensorDto = factory.nextSensorData(props.getRobotId(), missionId);

            // 생존자 감지 이벤트 확률적 발생
            if (random.nextDouble() < props.getSurvivorRate()) {
                AlertDto alertDto = factory.createSurvivorAlert(props.getRobotId(), missionId, sensorDto);
                survivorService.mark(alertDto);
            }

            // 실제 파이프라인과 동일한 경로로 처리
            sensorService.process(sensorDto);

        } catch (Exception e) {
            log.error("[MOCK] 센서 데이터 생성 실패: {}", e.getMessage(), e);
        }
    }
}