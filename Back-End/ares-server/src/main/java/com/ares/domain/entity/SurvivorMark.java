package com.ares.domain.entity;

import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "survivor_marks")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SurvivorMark {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mission_id")
    private Mission mission;

    private Double survivalRate;        // 감지 당시 생존율
//    private String snapshotUrl;         // 감지 당시 캡처 이미지 경로 (optional)
    private LocalDateTime detectedAt;

    private Double heading;
    @Column(name = "pos_x")
    private Double posX;
    @Column(name = "pos_y")
    private Double posY;

}
