-- Current ARES zones schema aligned with JPA entity com.ares.domain.entity.Zone

DROP TABLE IF EXISTS `zones`;

CREATE TABLE `zones` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mission_id` bigint NOT NULL,
  `zone_name` varchar(255) NOT NULL,
  `operator` varchar(255) DEFAULT NULL,
  `robot_id` varchar(255) DEFAULT NULL,
  `status` enum('READY','RUNNING','COMPLETED','ABORTED') NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_zones_mission_id` (`mission_id`),
  CONSTRAINT `fk_zones_mission` FOREIGN KEY (`mission_id`) REFERENCES `missions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
