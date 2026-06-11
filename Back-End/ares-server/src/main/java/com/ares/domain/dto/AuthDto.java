package com.ares.domain.dto;

import lombok.*;

public class AuthDto {

    @Getter @Setter
    public static class LoginRequest {
        private String username;
        private String password;
    }

    @Getter @Setter
    public static class RegisterRequest {
        private String username;
        private String password;
        private String role;    // "ADMIN" or "OPERATOR"
    }

    @Getter @Builder
    public static class LoginResponse {
        private String token;
        private Long userId;
        private String username;
        private String role;
        private long expiresIn;  // ms
    }
}