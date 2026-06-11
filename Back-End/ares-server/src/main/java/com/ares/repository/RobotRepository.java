package com.ares.repository;

import com.ares.domain.entity.Robot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RobotRepository extends JpaRepository<Robot, Long> {
    Optional<Robot> findByRobotKey(String robotKey);
    boolean existsByRobotKey(String robotKey);
    boolean existsByRobotKeyAndUsageStatus(String robotKey, Robot.UsageStatus usageStatus);
}