
IF COL_LENGTH('dbo.user_profiles','quiet_down_strategy') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD quiet_down_strategy NVARCHAR(16) NOT NULL CONSTRAINT DF_user_profiles_quiet_down_strategy DEFAULT 'lower';
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_target_volume_pct') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD quiet_down_target_volume_pct INT NOT NULL CONSTRAINT DF_user_profiles_quiet_down_target_volume_pct DEFAULT 20;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_restore') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD quiet_down_restore BIT NOT NULL CONSTRAINT DF_user_profiles_quiet_down_restore DEFAULT 1;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_include_fire_tv') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD quiet_down_include_fire_tv BIT NOT NULL CONSTRAINT DF_user_profiles_quiet_down_include_fire_tv DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.devices','enabled') IS NULL
BEGIN
  ALTER TABLE dbo.devices ADD enabled BIT NOT NULL CONSTRAINT DF_devices_enabled DEFAULT 1;
END
GO

IF COL_LENGTH('dbo.devices','device_family') IS NULL
BEGIN
  ALTER TABLE dbo.devices ADD device_family NVARCHAR(40) NULL;
END
GO

IF COL_LENGTH('dbo.devices','last_seen_at') IS NULL
BEGIN
  ALTER TABLE dbo.devices ADD last_seen_at DATETIME2 NULL;
END
GO

IF COL_LENGTH('dbo.devices','last_seen_source') IS NULL
BEGIN
  ALTER TABLE dbo.devices ADD last_seen_source NVARCHAR(40) NULL;
END
GO

IF COL_LENGTH('dbo.devices','last_seen_request_id') IS NULL
BEGIN
  ALTER TABLE dbo.devices ADD last_seen_request_id NVARCHAR(255) NULL;
END
GO
