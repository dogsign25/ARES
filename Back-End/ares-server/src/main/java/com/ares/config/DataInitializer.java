package com.ares.config;

import com.ares.domain.entity.User;
import com.ares.domain.entity.User.UserStatus;
import com.ares.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class DataInitializer implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) throws Exception {
        // 1. DB에 이미 'admin'이라는 아이디가 있는지 확인
        if (!userRepository.existsByUsername("admin")) {

            // 2. 없다면 프로젝트 내부의 passwordEncoder를 사용해 'admin'을 안전하게 암호화
            String encodedPassword = passwordEncoder.encode("admin");

            User adminUser = User.builder()
                    .username("admin")
                    .password(encodedPassword)
                    .role(User.Role.ADMIN)
                    .status(UserStatus.APPROVED)
                    .createdAt(LocalDateTime.now())
                    .approvedAt(LocalDateTime.now())
                    .build();

            // 3. DB에 강제 삽입 및 즉시 반영(Flush)
            userRepository.saveAndFlush(adminUser);

            System.out.println("=========================================");
            System.out.println("[⚠️ 시스템 최고 관리자 계정이 자동 생성되었습니다]");
            System.out.println("ID: admin / PW: admin (상태: APPROVED)");
            System.out.println("=========================================");
        }
    }
}