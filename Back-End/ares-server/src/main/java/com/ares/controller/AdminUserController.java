package com.ares.controller;
import com.ares.domain.entity.User;
import com.ares.domain.entity.User.UserStatus;
import com.ares.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/admin/users")
@RequiredArgsConstructor
public class AdminUserController {
    private final UserRepository userRepository;

    @GetMapping
    public ResponseEntity<List<User>> getAllUsers() {
        // JpaRepository가 기본 제공하는 findAll()을 사용하므로 Repository 수정도 필요 없습니다!
        return ResponseEntity.ok(userRepository.findAll());
    }

    /** 2. 가입 승인 처리 (POST /api/admin/users/{userId}/approve) */
    @PostMapping("/{userId}/approve")
    public ResponseEntity<?> approveUser(@PathVariable Long userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    user.setStatus(UserStatus.APPROVED);
                    user.setApprovedAt(java.time.LocalDateTime.now());
                    userRepository.save(user);
                    return ResponseEntity.ok(Map.of("message", user.getUsername() + " 계정이 승인되었습니다."));
                })
                .orElse(ResponseEntity.notFound().build());
    }

    /** 3. 가입 거절 처리 (POST /api/admin/users/{userId}/reject) */
    @PostMapping("/{userId}/reject")
    public ResponseEntity<?> rejectUser(@PathVariable Long userId) {
        return userRepository.findById(userId)
                .map(user -> {
                    user.setStatus(UserStatus.REJECTED);
                    userRepository.save(user);
                    return ResponseEntity.ok(Map.of("message", "가입 신청이 거절되었습니다."));
                })
                .orElse(ResponseEntity.notFound().build());
    }
}
