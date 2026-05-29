-- Migration 012: Alexa Reminders tracking
-- Tracks the Alexa Reminder ID for each prayer per user so we can
-- update/delete reminders when the user changes their settings.

IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'alexa_reminders' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.alexa_reminders (
    id                  UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id             UNIQUEIDENTIFIER  NOT NULL,
    reminder_type       NVARCHAR(20)      NOT NULL, -- 'prayer' | 'tilawat' | 'pre_prayer'
    prayer_name         NVARCHAR(20)      NULL,     -- fajr | dhuhr | asr | maghrib | isha | NULL for tilawat
    schedule_id         UNIQUEIDENTIFIER  NULL,     -- FK to dbo.schedules for tilawat
    alexa_reminder_id   NVARCHAR(255)     NULL,     -- Alexa's reminder GUID
    scheduled_time_utc  NVARCHAR(8)       NULL,     -- HH:MM:SS used when reminder was last set
    timezone            NVARCHAR(100)     NULL,
    status              NVARCHAR(30)      NOT NULL DEFAULT 'active', -- active | paused | deleted | error
    last_scheduled_at   DATETIME2         NULL,
    error_message       NVARCHAR(1000)    NULL,
    created_at          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_alexa_reminders_user_id
    ON dbo.alexa_reminders (user_id);

  CREATE UNIQUE INDEX UX_alexa_reminders_user_prayer
    ON dbo.alexa_reminders (user_id, reminder_type, prayer_name, schedule_id)
    WHERE prayer_name IS NOT NULL OR schedule_id IS NOT NULL;
END;
GO

-- Add reminders_enabled flag to user_profiles if it doesn't exist
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles')
    AND name = 'reminders_enabled'
)
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD reminders_enabled BIT NOT NULL DEFAULT 1;
END;
GO

-- Add pre_prayer_reminder_min to user_profiles (minutes before prayer to send pre-reminder)
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles')
    AND name = 'pre_prayer_reminder_min'
)
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD pre_prayer_reminder_min INT NULL DEFAULT NULL; -- NULL = disabled, 5/10/15 = enabled
END;
GO

-- Migration 012 addendum: Mosque iqamah times table
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'mosque_iqamah_times' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.mosque_iqamah_times (
    id           UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id      UNIQUEIDENTIFIER NOT NULL,
    mosque_id    NVARCHAR(255)    NOT NULL,
    mosque_name  NVARCHAR(500)    NULL,
    prayer_name  NVARCHAR(20)     NOT NULL,
    iqamah_time  NVARCHAR(8)      NOT NULL,
    created_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at   DATETIME2        NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE UNIQUE INDEX UX_mosque_iqamah_user_mosque_prayer
    ON dbo.mosque_iqamah_times (user_id, mosque_id, prayer_name);
END;
GO
