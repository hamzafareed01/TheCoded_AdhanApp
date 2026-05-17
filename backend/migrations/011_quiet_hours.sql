-- 011_quiet_hours.sql
-- Adds quiet hours columns that were included in the 001 CREATE TABLE but
-- never added to existing databases (migration 001 was already applied before
-- those columns were added to the file).
-- Also adds global quiet hours columns to user_profiles which have no prior migration.

-- ── prayer_configs ───────────────────────────────────────────────────────────
IF COL_LENGTH('dbo.prayer_configs','quiet_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_enabled BIT NOT NULL
      CONSTRAINT DF_prayer_configs_quiet_enabled DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.prayer_configs','quiet_from') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_from TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.prayer_configs','quiet_to') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_to TIME(0) NULL;
END
GO

-- ── user_profiles (global quiet hours) ──────────────────────────────────────
IF COL_LENGTH('dbo.user_profiles','quiet_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_enabled BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_enabled DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_from') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_from TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_to') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_to TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_mute_fajr') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_mute_fajr BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_mute_fajr DEFAULT 1;
END
GO
