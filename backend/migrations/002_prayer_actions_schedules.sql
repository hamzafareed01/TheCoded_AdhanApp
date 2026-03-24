-- 002_prayer_actions_schedules.sql
-- Adds: per-prayer adhan reciter + after-adhan action, and user schedules (tilawat plans)

-- Extend prayer_configs with per-prayer adhan/after-adhan
IF COL_LENGTH('dbo.prayer_configs','adhan_reciter_id') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs ADD adhan_reciter_id NVARCHAR(64) NULL;
END
GO

IF COL_LENGTH('dbo.prayer_configs','after_type') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs ADD after_type NVARCHAR(16) NOT NULL CONSTRAINT DF_prayer_after_type DEFAULT 'none';
END
GO

IF COL_LENGTH('dbo.prayer_configs','after_payload_json') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs ADD after_payload_json NVARCHAR(MAX) NULL;
END
GO

-- User schedules (tilawat plans & future routine templates)
IF NOT EXISTS (SELECT *
FROM sys.tables
WHERE name='schedules')
BEGIN
  CREATE TABLE dbo.schedules
  (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_schedules_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    schedule_type NVARCHAR(20) NOT NULL,
    -- tilawat (MVP)
    time_of_day TIME(0) NOT NULL,
    days_mask INT NOT NULL CONSTRAINT DF_schedules_days DEFAULT 127,
    -- bits 0..6 = Sun..Sat
    enabled BIT NOT NULL CONSTRAINT DF_schedules_enabled DEFAULT 1,

    device_id NVARCHAR(255) NULL,
    -- alexa device id from dbo.devices
    payload_json NVARCHAR(MAX) NOT NULL,
    -- JSON {surahNumber, reciterId?, title?}

    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_schedules_user'
    AND object_id = OBJECT_ID('dbo.schedules')
)
BEGIN
    CREATE INDEX IX_schedules_user ON dbo.schedules(user_id);
  END
END
GO
