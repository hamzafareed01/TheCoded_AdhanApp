IF COL_LENGTH('dbo.user_profiles','use_mosque_location') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD use_mosque_location BIT NOT NULL
      CONSTRAINT DF_user_profiles_use_mosque_location DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.user_profiles','mosque_id') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD mosque_id NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','mosque_name') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD mosque_name NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','mosque_address') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD mosque_address NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','mosque_lat') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD mosque_lat FLOAT NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles','mosque_lng') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles ADD mosque_lng FLOAT NULL;
END
GO
