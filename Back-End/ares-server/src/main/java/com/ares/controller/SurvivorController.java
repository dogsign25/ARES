package com.ares.controller;

import com.ares.domain.entity.SurvivorMark;
import com.ares.repository.SurvivorMarkRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/survivors")
@RequiredArgsConstructor
public class SurvivorController {

    private final SurvivorMarkRepository survivorMarkRepository;

    /** 미션별 생존자 마킹 목록 */
    @GetMapping("/mission/{missionId}")
    public List<Map<String, Object>> getSurvivorsByMission(@PathVariable Long missionId) {
        return survivorMarkRepository.findByMissionIdOrderByDetectedAtDesc(missionId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    /** 전체 생존자 마킹 */
    @GetMapping
    public List<Map<String, Object>> getAllSurvivors() {
        return survivorMarkRepository.findAll()
                .stream()
                .map(this::toResponse)
                .toList();
    }

    private Map<String, Object> toResponse(SurvivorMark mark) {
        Map<String, Object> response = new LinkedHashMap<>();
        response.put("id", mark.getId());
        response.put("missionId", mark.getMission() != null ? mark.getMission().getId() : null);
        response.put("survivalRate", mark.getSurvivalRate());
        response.put("detectedAt", mark.getDetectedAt());
        response.put("heading", mark.getHeading());
        response.put("posX", mark.getPosX());
        response.put("posY", mark.getPosY());
        return response;
    }
}
