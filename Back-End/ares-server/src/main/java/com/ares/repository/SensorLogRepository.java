package com.ares.repository;

import com.ares.domain.entity.SensorLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface SensorLogRepository extends JpaRepository<SensorLog, Long> {

    // 특정 미션의 시계열 데이터 조회 (차트용)
    List<SensorLog> findByMissionIdOrderByTimestampAsc(Long missionId);

    // 특정 시간 범위 조회
    @Query("SELECT s FROM SensorLog s WHERE s.mission.id = :missionId " +
            "AND s.timestamp BETWEEN :from AND :to ORDER BY s.timestamp ASC")
    List<SensorLog> findByMissionAndTimeRange(
            @Param("missionId") Long missionId,
            @Param("from") LocalDateTime from,
            @Param("to") LocalDateTime to
    );

    // 최근 1개 (현재 상태)
    SensorLog findTopByMissionIdOrderByTimestampDesc(Long missionId);
}