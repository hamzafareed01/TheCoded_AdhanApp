-- 002_prayer_actions_schedules.sql
-- Adds:
-- 1) per-prayer adhan reciter + after-adhan action
-- 2) user schedules for tilawat plans

/* =========================================================
   Extend dbo.prayer_configs
   ========================================================= */

IF COL_LENGTH('dbo.prayer_configs', 'adhan_reciter_id') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD adhan_reciter_id NVARCHAR(64) NULL;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'after_type') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD after_type NVARCHAR(16) NOT NULL
      CONSTRAINT DF_prayer_after_type DEFAULT 'none'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'after_payload_json') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD after_payload_json NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_prayer_configs_after_type'
    AND parent_object_id = OBJECT_ID('dbo.prayer_configs')
)
BEGIN
  ALTER TABLE dbo.prayer_configs
    WITH CHECK ADD CONSTRAINT CK_prayer_configs_after_type
    CHECK (after_type IN ('none', 'dua', 'surah'));
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_prayer_configs_user_enabled'
    AND object_id = OBJECT_ID('dbo.prayer_configs')
)
BEGIN
  CREATE INDEX IX_prayer_configs_user_enabled
    ON dbo.prayer_configs(user_id, enabled);
END
GO

/* =========================================================
   Create / extend dbo.schedules
   ========================================================= */

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'schedules' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.schedules (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_schedules PRIMARY KEY
      DEFAULT NEWSEQUENTIALID(),

    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_schedules_users
      REFERENCES dbo.users(id) ON DELETE CASCADE,

    schedule_type NVARCHAR(20) NOT NULL
      CONSTRAINT DF_schedules_type DEFAULT 'tilawat',

    time_of_day TIME(0) NOT NULL,

    days_mask INT NOT NULL
      CONSTRAINT DF_schedules_days DEFAULT 127,

    enabled BIT NOT NULL
      CONSTRAINT DF_schedules_enabled DEFAULT 1,

    device_id NVARCHAR(255) NULL,

    payload_json NVARCHAR(MAX) NOT NULL,

    created_at DATETIME2 NOT NULL
      CONSTRAINT DF_schedules_created_at DEFAULT SYSUTCDATETIME(),

    updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_schedules_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF COL_LENGTH('dbo.schedules', 'schedule_type') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD schedule_type NVARCHAR(20) NOT NULL
      CONSTRAINT DF_schedules_type_backfill DEFAULT 'tilawat'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.schedules', 'time_of_day') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD time_of_day TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.schedules', 'days_mask') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD days_mask INT NOT NULL
      CONSTRAINT DF_schedules_days_backfill DEFAULT 127
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.schedules', 'enabled') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD enabled BIT NOT NULL
      CONSTRAINT DF_schedules_enabled_backfill DEFAULT 1
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.schedules', 'device_id') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD device_id NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.schedules', 'payload_json') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD payload_json NVARCHAR(MAX) NULL;
END
GO

IF COL_LENGTH('dbo.schedules', 'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD created_at DATETIME2 NOT NULL
      CONSTRAINT DF_schedules_created_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.schedules', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.schedules
    ADD updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_schedules_updated_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.schedules')
    AND name = 'time_of_day'
    AND is_nullable = 1
)
AND NOT EXISTS (
  SELECT 1
  FROM dbo.schedules
  WHERE time_of_day IS NULL
)
BEGIN
  ALTER TABLE dbo.schedules
    ALTER COLUMN time_of_day TIME(0) NOT NULL;
END
GO

IF EXISTS (
  SELECT 1
  FROM sys.columns
  WHERE object_id = OBJECT_ID('dbo.schedules')
    AND name = 'payload_json'
    AND is_nullable = 1
)
AND NOT EXISTS (
  SELECT 1
  FROM dbo.schedules
  WHERE payload_json IS NULL
)
BEGIN
  ALTER TABLE dbo.schedules
    ALTER COLUMN payload_json NVARCHAR(MAX) NOT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_schedules_type'
    AND parent_object_id = OBJECT_ID('dbo.schedules')
)
BEGIN
  ALTER TABLE dbo.schedules
    WITH CHECK ADD CONSTRAINT CK_schedules_type
    CHECK (schedule_type IN ('tilawat'));
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_schedules_days_mask'
    AND parent_object_id = OBJECT_ID('dbo.schedules')
)
BEGIN
  ALTER TABLE dbo.schedules
    WITH CHECK ADD CONSTRAINT CK_schedules_days_mask
    CHECK (days_mask >= 0 AND days_mask <= 127);
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_schedules_user_created_at'
    AND object_id = OBJECT_ID('dbo.schedules')
)
BEGIN
  CREATE INDEX IX_schedules_user_created_at
    ON dbo.schedules(user_id, created_at DESC);
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_schedules_user_enabled_time'
    AND object_id = OBJECT_ID('dbo.schedules')
)
BEGIN
  CREATE INDEX IX_schedules_user_enabled_time
    ON dbo.schedules(user_id, enabled, time_of_day);
END
GO