package com.ares.repository;

import com.ares.domain.entity.Mission;
import com.ares.domain.entity.Robot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface MissionRepository extends JpaRepository<Mission, Long> {

    Optional<Mission> findTopByStatusOrderByIdDesc(Mission.MissionStatus status);
}