-- Migration 012: Alexa Reminders tracking
 
IF NOT EXISTS (
  SELECT 1 FROM sys.tables WHERE name = 'alexa_reminders' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.alexa_reminders (
    id                  UNIQUEIDENTIFIER  NOT NULL DEFAULT NEWID() PRIMARY KEY,
    user_id             UNIQUEIDENTIFIER  NOT NULL,
    reminder_type       NVARCHAR(20)      NOT NULL,
    prayer_name         NVARCHAR(20)      NULL,
    schedule_id         UNIQUEIDENTIFIER  NULL,
    alexa_reminder_id   NVARCHAR(255)     NULL,
    scheduled_time_utc  NVARCHAR(8)       NULL,
    timezone            NVARCHAR(100)     NULL,
    status              NVARCHAR(30)      NOT NULL DEFAULT 'active',
    last_scheduled_at   DATETIME2         NULL,
    error_message       NVARCHAR(1000)    NULL,
    created_at          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at          DATETIME2         NOT NULL DEFAULT SYSUTCDATETIME()
  );
 
  CREATE INDEX IX_alexa_reminders_user_id
    ON dbo.alexa_reminders (user_id);
 
  CREATE INDEX IX_alexa_reminders_user_prayer
    ON dbo.alexa_reminders (user_id, reminder_type, prayer_name);
 
  CREATE INDEX IX_alexa_reminders_user_schedule
    ON dbo.alexa_reminders (user_id, reminder_type, schedule_id);
END;
GO
 
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
 
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles')
    AND name = 'pre_prayer_reminder_min'
)
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD pre_prayer_reminder_min INT NULL;
END;
GO
 
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.user_profiles')
    AND name = 'speaker_group_ids_json'
)
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD speaker_group_ids_json NVARCHAR(MAX) NULL;
END;
GO
 
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