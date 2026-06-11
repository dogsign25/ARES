package com.ares.websocket;

import com.ares.domain.dto.AlertDto;
import com.ares.domain.dto.SensorBroadcastDto;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class WebSocketPublisher {

    private final SimpMessagingTemplate messaging;

    /**
     * 센서 데이터 브로드캐스트
     * React 구독 경로: /topic/sensors/{robotId}
     */
    public void broadcastSensor(SensorBroadcastDto dto) {
        String destination = "/topic/sensors/" + dto.getRobotId();
        messaging.convertAndSend(destination, dto);
        messaging.convertAndSend("/topic/sensors", dto);
        log.info(
                "WebSocket 센서 브로드캐스트 | robotId: {} | destinations: {}, /topic/sensors",
                dto.getRobotId(),
                destination
        );
    }

    /**
     * 생존자 감지 알림 브로드캐스트
     * React 구독 경로: /topic/alert/{robotId}
     * 알림음, 팝업 등 즉각 반응 필요한 이벤트
     */
    public void broadcastAlert(AlertDto dto) {
        String destination = "/topic/alert/" + dto.getRobotId();
        messaging.convertAndSend(destination, dto);
        log.info("생존자 감지 알림 브로드캐스트 | robotId: {} | survivalRate: {}",
                dto.getRobotId(), dto.getSurvivalRate());
    }
}
