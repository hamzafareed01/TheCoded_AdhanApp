-- Migration 013: Push notifications and prayer schedule cache

-- FCM token + notification prefs on user_profiles
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles') AND name = 'fcm_token'
)
BEGIN
  ALTER TABLE dbo.user_profiles ADD fcm_token NVARCHAR(500) NULL;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles') AND name = 'push_notifications_enabled'
)
BEGIN
  ALTER TABLE dbo.user_profiles ADD push_notifications_enabled BIT NOT NULL DEFAULT 1;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles') AND name = 'push_before_prayer_min'
)
BEGIN
  ALTER TABLE dbo.user_profiles ADD push_before_prayer_min INT NULL DEFAULT 10;
END;
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles') AND name = 'push_after_prayer_min'
)
BEGIN
  ALTER TABLE dbo.user_profiles ADD push_after_prayer_min INT NULL DEFAULT 30;
END;
GO

-- Daily prayer schedule cache — UTC fire times per user per prayer
-- Populated once daily, used by cron to send notifications and proactive events
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'daily_prayer_schedule' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.daily_prayer_schedule (
    id              UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id         UNIQUEIDENTIFIER NOT NULL,
    schedule_date   DATE             NOT NULL,
    prayer_name     NVARCHAR(10)     NOT NULL,
    fire_at_utc     DATETIME2        NOT NULL,
    notif_sent      BIT              NOT NULL DEFAULT 0,
    alexa_sent      BIT              NOT NULL DEFAULT 0,
    created_at      DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_daily_prayer_schedule_fire
    ON dbo.daily_prayer_schedule (fire_at_utc, notif_sent);

  CREATE UNIQUE INDEX UX_daily_prayer_user_date_prayer
    ON dbo.daily_prayer_schedule (user_id, schedule_date, prayer_name);
END;
GO
