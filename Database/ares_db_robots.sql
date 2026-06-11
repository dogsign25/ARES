-- Current ARES robots schema aligned with JPA entity com.ares.domain.entity.Robot

DROP TABLE IF EXISTS `robots`;

CREATE TABLE `robots` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `robot_key` varchar(255) NOT NULL,
  `status` enum('ONLINE','OFFLINE','ERROR') DEFAULT NULL,
  `usage_status` enum('AVAILABLE','IN_USE') DEFAULT NULL,
  `last_seen_at` datetime(6) DEFAULT NULL,
  `created_at` datetime(6) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_robots_robot_key` (`robot_key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
