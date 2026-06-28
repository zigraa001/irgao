-- Wipe all app data for a fresh local auth test.
-- Tables stay in place (created by npm run db:init / server boot).
-- Usage: npm run local:reset

SET FOREIGN_KEY_CHECKS = 0;
TRUNCATE TABLE bookings;
TRUNCATE TABLE otp_requests;
TRUNCATE TABLE users;
TRUNCATE TABLE aircraft;
SET FOREIGN_KEY_CHECKS = 1;
