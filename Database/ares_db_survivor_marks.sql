-- Current ARES survivor_marks schema aligned with JPA entity com.ares.domain.entity.SurvivorMark

DROP TABLE IF EXISTS `survivor_marks`;

CREATE TABLE `survivor_marks` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mission_id` bigint DEFAULT NULL,
  `survival_rate` double DEFAULT NULL,
  `detected_at` datetime(6) DEFAULT NULL,
  `heading` double DEFAULT NULL,
  `pos_x` double DEFAULT NULL,
  `pos_y` double DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_survivor_marks_mission_id` (`mission_id`),
  CONSTRAINT `fk_survivor_marks_mission` FOREIGN KEY (`mission_id`) REFERENCES `missions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
