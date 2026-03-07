IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='users')
BEGIN
  CREATE TABLE dbo.users (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    amazon_user_id NVARCHAR(255) NOT NULL UNIQUE,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='user_profiles')
BEGIN
  CREATE TABLE dbo.user_profiles (
    user_id UNIQUEIDENTIFIER NOT NULL PRIMARY KEY
      CONSTRAINT FK_user_profiles_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    sect NVARCHAR(10) NOT NULL CONSTRAINT DF_user_profiles_sect DEFAULT 'SUNNI',
    calculation_method NVARCHAR(50) NOT NULL CONSTRAINT DF_user_profiles_calc DEFAULT 'isna',
    madhhab NVARCHAR(20) NOT NULL CONSTRAINT DF_user_profiles_madhhab DEFAULT 'hanafi',
    high_latitude_method NVARCHAR(30) NOT NULL CONSTRAINT DF_user_profiles_highlat DEFAULT 'automatic',

    language NVARCHAR(10) NOT NULL CONSTRAINT DF_user_profiles_lang DEFAULT 'en',

    country NVARCHAR(64) NOT NULL CONSTRAINT DF_user_profiles_country DEFAULT 'US',
    city NVARCHAR(128) NOT NULL CONSTRAINT DF_user_profiles_city DEFAULT 'Chicago',
    timezone NVARCHAR(64) NOT NULL CONSTRAINT DF_user_profiles_tz DEFAULT 'America/Chicago',

    latitude FLOAT NULL,
    longitude FLOAT NULL,

    account_enabled BIT NOT NULL CONSTRAINT DF_user_profiles_enabled DEFAULT 0,

    offset_fajr INT NOT NULL CONSTRAINT DF_off_fajr DEFAULT 0,
    offset_dhuhr INT NOT NULL CONSTRAINT DF_off_dhuhr DEFAULT 0,
    offset_asr INT NOT NULL CONSTRAINT DF_off_asr DEFAULT 0,
    offset_maghrib INT NOT NULL CONSTRAINT DF_off_maghrib DEFAULT 0,
    offset_isha INT NOT NULL CONSTRAINT DF_off_isha DEFAULT 0,

    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_user_profiles_sect CHECK (sect IN ('SUNNI','SHIA'))
  );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='prayer_configs')
BEGIN
  CREATE TABLE dbo.prayer_configs (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_prayer_configs_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    prayer_name NVARCHAR(10) NOT NULL,
    enabled BIT NOT NULL CONSTRAINT DF_prayer_enabled DEFAULT 1,

    offset_min INT NOT NULL CONSTRAINT DF_prayer_offset DEFAULT 0,

    quiet_enabled BIT NOT NULL CONSTRAINT DF_quiet_enabled DEFAULT 0,
    quiet_from TIME(0) NULL,
    quiet_to TIME(0) NULL,

    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_prayer_name CHECK (prayer_name IN ('fajr','dhuhr','asr','maghrib','isha')),
    CONSTRAINT UQ_user_prayer UNIQUE (user_id, prayer_name)
  );
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='devices')
BEGIN
  CREATE TABLE dbo.devices (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_devices_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    platform NVARCHAR(20) NOT NULL CONSTRAINT DF_devices_platform DEFAULT 'alexa',
    device_id NVARCHAR(255) NOT NULL,
    device_name NVARCHAR(255) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_user_device UNIQUE (user_id, platform, device_id)
  );
END
GO
