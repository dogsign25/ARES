package com.ares.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.integration.support.MessageBuilder;
import org.springframework.messaging.MessageChannel;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class MqttPublisher {

    private final MessageChannel mqttOutboundChannel;
    private final ObjectMapper objectMapper;


    public void publish(String robotId, Object payload) {
        try {
            String topic = "hexapod/" + robotId + "/command";
            String json = objectMapper.writeValueAsString(payload);

            mqttOutboundChannel.send(
                    MessageBuilder.withPayload(json)
                            .setHeader(MqttHeaders.TOPIC, topic)
                            .setHeader(MqttHeaders.QOS, 1)
                            .build()
            );

            log.debug("MQTT 발행 | topic: {} | payload: {}", topic, json);
        } catch (Exception e) {
            log.error("MQTT 발행 실패 | robotId: {} | error: {}", robotId, e.getMessage(), e);
        }
    }
}