package com.ares.domain.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;

@Entity
@Table(name = "zones")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Zone {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "mission_id", nullable = false)
    @JsonIgnore
    private Mission mission;

    @Column(nullable = false)
    private String zoneName;

    @Column(nullable = true)
    private String operator;

    @Column(nullable = true)
    private String robotId;

    @Builder.Default
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ZoneStatus status = ZoneStatus.READY;

    public enum ZoneStatus {
        READY,
        RUNNING,
        COMPLETED,
        ABORTED
    }
}