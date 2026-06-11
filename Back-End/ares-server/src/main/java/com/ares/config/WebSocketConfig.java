package com.ares.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;

@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        // 서버 → 클라이언트 브로드캐스트 prefix
        // React에서 stompClient.subscribe('/topic/sensors/1', ...) 형태로 구독
        registry.enableSimpleBroker("/topic");

        // 클라이언트 → 서버 메시지 prefix
        // React에서 stompClient.send('/app/robot/1/command', ...) 형태로 전송
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws")             // WebSocket 연결 엔드포인트
                .setAllowedOriginPatterns("*")  // 개발 중 CORS 허용 (운영 시 도메인 지정)
                .withSockJS();                  // SockJS 폴백 지원
    }
}