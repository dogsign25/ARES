package com.ares.mqtt;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.ares.domain.dto.AlertDto;
import com.ares.domain.dto.SensorDataDto;
import com.ares.domain.entity.Robot;
import com.ares.repository.RobotRepository;
import com.ares.service.SensorService;
import com.ares.service.SurvivorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.integration.annotation.ServiceActivator;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.Message;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Slf4j
@Component
@RequiredArgsConstructor
// Mock 모드일 때는 MQTT 수신을 비활성화 (브로커 없으면 연결 에러 방지)
@ConditionalOnProperty(name = "mock.enabled", havingValue = "false", matchIfMissing = true)
public class MqttSubscriber {

    private final ObjectMapper objectMapper;
    private final SensorService sensorService;
    private final SurvivorService survivorService;
    private final RobotRepository robotRepository;

    @ServiceActivator(inputChannel = "mqttInboundChannel")
    public void handleMessage(Message<?> message) {
        String topic = (String) message.getHeaders().get(MqttHeaders.RECEIVED_TOPIC);
        String payload = (String) message.getPayload();

        log.info("MQTT 수신 | topic: {} | payload: {}", topic, payload);
        if (topic == null) return;

        try {
            if (topic.endsWith("/sensors")) {
                SensorDataDto sensorData = objectMapper.readValue(payload, SensorDataDto.class);
                String topicRobotId = extractRobotId(topic);
                if (!topicRobotId.equals(sensorData.getRobotId())) {
                    log.warn(
                            "센서 robotId 보정 | payload: {} | topic: {}",
                            sensorData.getRobotId(),
                            topicRobotId
                    );
                    sensorData.setRobotId(topicRobotId);
                }
                sensorService.process(sensorData);
            } else if (topic.endsWith("/alert")) {
                survivorService.mark(objectMapper.readValue(payload, AlertDto.class));
            } else if (topic.endsWith("/status")) {
                handleStatus(extractRobotId(topic), payload);
            }
        } catch (Exception e) {
            log.error("MQTT 처리 오류 | topic: {} | {}", topic, e.getMessage(), e);
        }
    }

    private void handleStatus(String robotId, String payload) {
        try {
            JsonNode node = objectMapper.readTree(payload);
            robotRepository.findByRobotKey(robotId).ifPresent(robot -> {
                if (node.has("status"))    robot.setStatus(Robot.RobotStatus.valueOf(node.get("status").asText()));
                robot.setLastSeenAt(LocalDateTime.now());
                robotRepository.save(robot);
            });
        } catch (Exception e) {
            log.error("상태 업데이트 실패 | robotId: {}", robotId, e);
        }
    }

    private String extractRobotId(String topic) {
        String[] parts = topic.split("/");
        return parts.length >= 2 ? parts[1] : "unknown";
    }
}
