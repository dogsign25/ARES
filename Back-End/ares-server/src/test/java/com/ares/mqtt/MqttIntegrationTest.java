package com.ares.mqtt;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.integration.mqtt.support.MqttHeaders;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;

import java.util.Map;

import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

class MqttIntegrationTest {

    @Test
    void publishesCommandAsJsonToRobotTopic() {
        MessageChannel channel = mock(MessageChannel.class);
        MqttPublisher publisher = new MqttPublisher(channel, new ObjectMapper());

        publisher.publish("ARES-TEST", Map.of("action", "forward"));

        verify(channel).send(argThat(message -> isExpectedCommand(message)));
    }

    private boolean isExpectedCommand(Message<?> message) {
        return "hexapod/ARES-TEST/command".equals(message.getHeaders().get(MqttHeaders.TOPIC))
                && Integer.valueOf(1).equals(message.getHeaders().get(MqttHeaders.QOS))
                && "{\"action\":\"forward\"}".equals(message.getPayload());
    }
}
