package com.ares.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true)
    private String username;

    @Column(nullable = false)
    @JsonIgnore
    private String password;       // BCrypt 암호화 저장

    @Enumerated(EnumType.STRING)
    private Role role;

    private LocalDateTime createdAt;
    private LocalDateTime approvedAt;

    public enum Role {
        ADMIN, OPERATOR
    }

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private UserStatus status;

    public enum UserStatus {
        PENDING,
        APPROVED,
        REJECTED
    }
}
