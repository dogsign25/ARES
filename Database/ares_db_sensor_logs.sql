-- Current ARES sensor_logs schema aligned with JPA entity com.ares.domain.entity.SensorLog

DROP TABLE IF EXISTS `sensor_logs`;

CREATE TABLE `sensor_logs` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `mission_id` bigint DEFAULT NULL,
  `gas_level` double DEFAULT NULL,
  `front_distance` int DEFAULT NULL,
  `heading` double DEFAULT NULL,
  `speed` double DEFAULT NULL,
  `pos_x` double DEFAULT NULL,
  `pos_y` double DEFAULT NULL,
  `temperature` double DEFAULT NULL,
  `humidity` double DEFAULT NULL,
  `timestamp` datetime(6) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_mission_time` (`mission_id`,`timestamp`),
  CONSTRAINT `fk_sensor_logs_mission` FOREIGN KEY (`mission_id`) REFERENCES `missions` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
