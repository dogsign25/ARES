package com.ares.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import jakarta.persistence.*;
import lombok.*;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Entity
@Table(name = "missions")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Mission {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    @JsonIgnoreProperties({"hibernateLazyInitializer", "handler"})
    private User user;

    @Column(nullable = false)
    private String sido;

    @Column(nullable = false)
    private String sigungu;

    @Column(nullable = false)
    private String dong;

    @Column(nullable = false, length = 1000)
    private String description;

    @Builder.Default
    @OneToMany(mappedBy = "mission", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Zone> zones = new ArrayList<>();

    @Column(nullable = false)
    private LocalDateTime startedAt;

    private LocalDateTime endedAt;      // null이면 진행 중

    @Enumerated(EnumType.STRING)
    private MissionStatus status;

    public enum MissionStatus {
        IN_PROGRESS, COMPLETED, ABORTED
    }

    public void addZone(Zone zone) {
        this.zones.add(zone);
        zone.setMission(this);
    }
}