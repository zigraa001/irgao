-- Runs once when the Docker MySQL volume is first created.
-- Ensures the app user can connect from the host (127.0.0.1).
GRANT ALL PRIVILEGES ON irago.* TO 'irago'@'%';
FLUSH PRIVILEGES;
