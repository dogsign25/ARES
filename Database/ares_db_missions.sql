-- Current ARES missions schema aligned with JPA entity com.ares.domain.entity.Mission

DROP TABLE IF EXISTS `missions`;

CREATE TABLE `missions` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_id` bigint NOT NULL,
  `sido` varchar(255) NOT NULL,
  `sigungu` varchar(255) NOT NULL,
  `dong` varchar(255) NOT NULL,
  `description` varchar(1000) NOT NULL,
  `started_at` datetime(6) NOT NULL,
  `ended_at` datetime(6) DEFAULT NULL,
  `status` enum('IN_PROGRESS','COMPLETED','ABORTED') DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_missions_user_id` (`user_id`),
  CONSTRAINT `fk_missions_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
