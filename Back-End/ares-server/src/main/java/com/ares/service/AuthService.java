package com.ares.service;

import com.ares.domain.dto.AuthDto;
import com.ares.domain.entity.User;
import com.ares.repository.UserRepository;
import com.ares.security.JwtProvider;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import com.ares.domain.entity.User.UserStatus;

import java.time.LocalDateTime;

@Service
@RequiredArgsConstructor

@Profile("!test")
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtProvider jwtProvider;

    /** 로그인 */
    public AuthDto.LoginResponse login(AuthDto.LoginRequest req) {
        User user = userRepository.findByUsername(req.getUsername())
                .orElseThrow(() -> new IllegalArgumentException("존재하지 않는 계정입니다."));

        if (!passwordEncoder.matches(req.getPassword(), user.getPassword())) {
            throw new IllegalArgumentException("비밀번호가 올바르지 않습니다.");
        }

        if (user.getStatus() == UserStatus.PENDING) {
            throw new IllegalArgumentException("시스템 관리자의 가입 승인을 대기 중입니다.");
        } else if (user.getStatus() == UserStatus.REJECTED) {
            throw new IllegalArgumentException("가입 신청이 거절된 계정입니다. 관리자에게 문의하세요.");
        }
        String token = jwtProvider.generate(user.getUsername(), user.getRole().name());

        return AuthDto.LoginResponse.builder()
                .token(token)
                .userId(user.getId())
                .username(user.getUsername())
                .role(user.getRole().name())
                .expiresIn(86400000L)
                .build();
    }

    /** 회원가입 */
    public void register(AuthDto.RegisterRequest req) {
        if (userRepository.existsByUsername(req.getUsername())) {
            throw new IllegalArgumentException("이미 존재하는 계정입니다: " + req.getUsername());
        }

        User.Role role;
        try {
            role = User.Role.valueOf(req.getRole() != null ? req.getRole().toUpperCase() : "OPERATOR");
        } catch (IllegalArgumentException e) {
            role = User.Role.OPERATOR;
        }

        userRepository.save(User.builder()
                .username(req.getUsername())
                .password(passwordEncoder.encode(req.getPassword()))
                .role(role)
                .status(UserStatus.PENDING)
                .createdAt(LocalDateTime.now())
                .build());
    }
}
