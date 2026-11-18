-- 006_profile_settings.sql
-- Extended profile information, gender selection, and appearance preferences

ALTER TABLE users ADD COLUMN IF NOT EXISTS gender VARCHAR(20) DEFAULT 'prefer_not_to_say';
ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(50);
ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) DEFAULT 'light';
ALTER TABLE users ADD COLUMN IF NOT EXISTS notification_preferences JSONB DEFAULT '{"task_assigned": true, "chat_mentions": true, "email_alerts": true}'::jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

-- Seed default gender on existing demo users
UPDATE users SET gender = 'male' WHERE email IN ('admin@workspace.local', 'rahul@workspace.local') AND (gender IS NULL OR gender = 'prefer_not_to_say');
UPDATE users SET gender = 'female' WHERE email = 'priya@workspace.local' AND (gender IS NULL OR gender = 'prefer_not_to_say');
