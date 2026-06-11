package com.ares.controller;

import com.ares.domain.dto.SensorBroadcastDto;
import com.ares.service.SensorRealtimeStore;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/sensors")
@RequiredArgsConstructor
public class SensorController {

    private final SensorRealtimeStore realtimeStore;

    @GetMapping("/latest/{robotId}")
    public ResponseEntity<SensorBroadcastDto> getLatest(@PathVariable String robotId) {
        return realtimeStore.getLatest(robotId)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.noContent().build());
    }
}
