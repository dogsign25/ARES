package com.ares.service;

import com.ares.domain.dto.SensorBroadcastDto;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

@Component
public class SensorRealtimeStore {

    private final Map<String, SensorBroadcastDto> latestByRobot = new ConcurrentHashMap<>();

    public void update(SensorBroadcastDto sensor) {
        if (sensor.getRobotId() != null) {
            latestByRobot.put(sensor.getRobotId(), sensor);
        }
    }

    public Optional<SensorBroadcastDto> getLatest(String robotId) {
        return Optional.ofNullable(latestByRobot.get(robotId));
    }
}
