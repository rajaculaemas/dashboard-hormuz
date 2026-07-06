-- Create Notification table
CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notification_type VARCHAR(255) NOT NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  metadata JSONB,
  is_read BOOLEAN DEFAULT FALSE,
  telegram_sent BOOLEAN DEFAULT FALSE,
  telegram_message_id VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  read_at TIMESTAMP
);

-- Create indexes for notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);

-- Create ShiftNotificationConfig table
CREATE TABLE IF NOT EXISTS shift_notification_configs (
  id VARCHAR(255) PRIMARY KEY,
  user_id VARCHAR(255) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shift_start_1 VARCHAR(5) DEFAULT '07:00',
  shift_end_1 VARCHAR(5) DEFAULT '15:00',
  shift_start_2 VARCHAR(5) DEFAULT '15:00',
  shift_end_2 VARCHAR(5) DEFAULT '23:00',
  shift_start_3 VARCHAR(5) DEFAULT '23:00',
  shift_end_3 VARCHAR(5) DEFAULT '07:00',
  notification_minutes INTEGER DEFAULT 15,
  enable_in_app BOOLEAN DEFAULT TRUE,
  enable_telegram BOOLEAN DEFAULT FALSE,
  timezone VARCHAR(255) DEFAULT 'UTC',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create index for shift_notification_configs
CREATE INDEX IF NOT EXISTS idx_shift_notification_configs_user_id ON shift_notification_configs(user_id);
