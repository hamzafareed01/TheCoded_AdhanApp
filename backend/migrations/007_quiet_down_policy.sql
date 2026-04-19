IF COL_LENGTH('dbo.user_profiles','quiet_down_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_enabled BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_enabled DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_strategy') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_strategy NVARCHAR(16) NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_strategy DEFAULT 'lower';
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_target_volume_pct') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_target_volume_pct INT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_target_volume_pct DEFAULT 20;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_restore') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_restore BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_restore DEFAULT 1;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_include_fire_tv') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_include_fire_tv BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_include_fire_tv DEFAULT 0;
END
GO
