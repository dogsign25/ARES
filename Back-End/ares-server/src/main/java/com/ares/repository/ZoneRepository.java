package com.ares.repository;

import com.ares.domain.entity.Zone;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ZoneRepository extends JpaRepository<Zone, Long> {
    List<Zone> findByMissionId(Long missionId);
    List<Zone> findByMissionIdAndStatus(Long missionId, Zone.ZoneStatus status);
    Optional<Zone> findByOperator(String operator);

    Optional<Zone> findByOperatorAndStatus(String operator,Zone.ZoneStatus status);
}
