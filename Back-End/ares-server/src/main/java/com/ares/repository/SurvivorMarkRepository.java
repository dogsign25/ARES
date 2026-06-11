package com.ares.repository;

import com.ares.domain.entity.SurvivorMark;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SurvivorMarkRepository extends JpaRepository<SurvivorMark, Long> {

    List<SurvivorMark> findByMissionIdOrderByDetectedAtDesc(Long missionId);
}