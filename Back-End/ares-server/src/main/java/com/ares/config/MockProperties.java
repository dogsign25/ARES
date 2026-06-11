package com.ares.config;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Getter
@Setter
@Component
@ConfigurationProperties(prefix = "mock")
public class MockProperties {
    private boolean enabled;
    private String robotId;
    private String robotName;
    private long intervalMs;
    private double survivorRate;
}