-- Dedicated database for the airspace / corridor catalog (flight_zones).
CREATE DATABASE IF NOT EXISTS irago_zones CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
GRANT ALL PRIVILEGES ON irago_zones.* TO 'irago'@'%';
FLUSH PRIVILEGES;
