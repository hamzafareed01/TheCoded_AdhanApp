IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'users' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.users (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_users PRIMARY KEY
      DEFAULT NEWSEQUENTIALID(),

    amazon_user_id NVARCHAR(255) NOT NULL
      CONSTRAINT UQ_users_amazon_user_id UNIQUE,

    created_at DATETIME2 NOT NULL
      CONSTRAINT DF_users_created_at DEFAULT SYSUTCDATETIME(),

    updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_users_updated_at DEFAULT SYSUTCDATETIME()
  );
END
GO

IF COL_LENGTH('dbo.users', 'amazon_user_id') IS NULL
BEGIN
  ALTER TABLE dbo.users
    ADD amazon_user_id NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.users', 'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.users
    ADD created_at DATETIME2 NOT NULL
      CONSTRAINT DF_users_created_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.users', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.users
    ADD updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_users_updated_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'UX_users_amazon_user_id'
    AND object_id = OBJECT_ID('dbo.users')
)
AND NOT EXISTS (
  SELECT 1
  FROM sys.key_constraints
  WHERE name = 'UQ_users_amazon_user_id'
    AND parent_object_id = OBJECT_ID('dbo.users')
)
BEGIN
  CREATE UNIQUE INDEX UX_users_amazon_user_id
    ON dbo.users(amazon_user_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'user_profiles' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.user_profiles (
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_user_profiles PRIMARY KEY
      CONSTRAINT FK_user_profiles_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    sect NVARCHAR(10) NOT NULL
      CONSTRAINT DF_user_profiles_sect DEFAULT 'SUNNI',

    calculation_method NVARCHAR(50) NOT NULL
      CONSTRAINT DF_user_profiles_calc DEFAULT 'isna',

    madhhab NVARCHAR(20) NOT NULL
      CONSTRAINT DF_user_profiles_madhhab DEFAULT 'hanafi',

    high_latitude_method NVARCHAR(30) NOT NULL
      CONSTRAINT DF_user_profiles_highlat DEFAULT 'automatic',

    language NVARCHAR(10) NOT NULL
      CONSTRAINT DF_user_profiles_lang DEFAULT 'en',

    country NVARCHAR(64) NOT NULL
      CONSTRAINT DF_user_profiles_country DEFAULT 'US',

    city NVARCHAR(128) NOT NULL
      CONSTRAINT DF_user_profiles_city DEFAULT 'Chicago',

    timezone NVARCHAR(64) NOT NULL
      CONSTRAINT DF_user_profiles_tz DEFAULT 'America/Chicago',

    latitude FLOAT NULL,
    longitude FLOAT NULL,

    mosque_id NVARCHAR(255) NULL,
    mosque_name NVARCHAR(255) NULL,
    mosque_address NVARCHAR(500) NULL,
    mosque_lat FLOAT NULL,
    mosque_lng FLOAT NULL,

    account_enabled BIT NOT NULL
      CONSTRAINT DF_user_profiles_enabled DEFAULT 0,

    offset_fajr INT NOT NULL
      CONSTRAINT DF_off_fajr DEFAULT 0,

    offset_dhuhr INT NOT NULL
      CONSTRAINT DF_off_dhuhr DEFAULT 0,

    offset_asr INT NOT NULL
      CONSTRAINT DF_off_asr DEFAULT 0,

    offset_maghrib INT NOT NULL
      CONSTRAINT DF_off_maghrib DEFAULT 0,

    offset_isha INT NOT NULL
      CONSTRAINT DF_off_isha DEFAULT 0,

    created_at DATETIME2 NOT NULL
      CONSTRAINT DF_user_profiles_created_at DEFAULT SYSUTCDATETIME(),

    updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_user_profiles_updated_at DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_user_profiles_sect CHECK (sect IN ('SUNNI', 'SHIA'))
  );
END
GO

IF COL_LENGTH('dbo.user_profiles', 'sect') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD sect NVARCHAR(10) NOT NULL
      CONSTRAINT DF_user_profiles_sect_backfill DEFAULT 'SUNNI'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'calculation_method') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD calculation_method NVARCHAR(50) NOT NULL
      CONSTRAINT DF_user_profiles_calc_backfill DEFAULT 'isna'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'madhhab') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD madhhab NVARCHAR(20) NOT NULL
      CONSTRAINT DF_user_profiles_madhhab_backfill DEFAULT 'hanafi'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'high_latitude_method') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD high_latitude_method NVARCHAR(30) NOT NULL
      CONSTRAINT DF_user_profiles_highlat_backfill DEFAULT 'automatic'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'language') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD language NVARCHAR(10) NOT NULL
      CONSTRAINT DF_user_profiles_lang_backfill DEFAULT 'en'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'country') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD country NVARCHAR(64) NOT NULL
      CONSTRAINT DF_user_profiles_country_backfill DEFAULT 'US'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'city') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD city NVARCHAR(128) NOT NULL
      CONSTRAINT DF_user_profiles_city_backfill DEFAULT 'Chicago'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'timezone') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD timezone NVARCHAR(64) NOT NULL
      CONSTRAINT DF_user_profiles_tz_backfill DEFAULT 'America/Chicago'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'latitude') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD latitude FLOAT NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'longitude') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD longitude FLOAT NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'mosque_id') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD mosque_id NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'mosque_name') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD mosque_name NVARCHAR(255) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'mosque_address') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD mosque_address NVARCHAR(500) NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'mosque_lat') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD mosque_lat FLOAT NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'mosque_lng') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD mosque_lng FLOAT NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'account_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD account_enabled BIT NOT NULL
      CONSTRAINT DF_user_profiles_enabled_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'offset_fajr') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD offset_fajr INT NOT NULL
      CONSTRAINT DF_off_fajr_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'offset_dhuhr') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD offset_dhuhr INT NOT NULL
      CONSTRAINT DF_off_dhuhr_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'offset_asr') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD offset_asr INT NOT NULL
      CONSTRAINT DF_off_asr_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'offset_maghrib') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD offset_maghrib INT NOT NULL
      CONSTRAINT DF_off_maghrib_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'offset_isha') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD offset_isha INT NOT NULL
      CONSTRAINT DF_off_isha_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD created_at DATETIME2 NOT NULL
      CONSTRAINT DF_user_profiles_created_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_user_profiles_updated_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_user_profiles_sect'
    AND parent_object_id = OBJECT_ID('dbo.user_profiles')
)
BEGIN
  ALTER TABLE dbo.user_profiles
    WITH CHECK ADD CONSTRAINT CK_user_profiles_sect
    CHECK (sect IN ('SUNNI', 'SHIA'));
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_user_profiles_mosque_id'
    AND object_id = OBJECT_ID('dbo.user_profiles')
)
BEGIN
  CREATE INDEX IX_user_profiles_mosque_id
    ON dbo.user_profiles(mosque_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'prayer_configs' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.prayer_configs (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_prayer_configs PRIMARY KEY
      DEFAULT NEWSEQUENTIALID(),

    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_prayer_configs_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    prayer_name NVARCHAR(10) NOT NULL,
    enabled BIT NOT NULL
      CONSTRAINT DF_prayer_enabled DEFAULT 1,

    offset_min INT NOT NULL
      CONSTRAINT DF_prayer_offset DEFAULT 0,

    quiet_enabled BIT NOT NULL
      CONSTRAINT DF_quiet_enabled DEFAULT 0,

    quiet_from TIME(0) NULL,
    quiet_to TIME(0) NULL,

    created_at DATETIME2 NOT NULL
      CONSTRAINT DF_prayer_configs_created_at DEFAULT SYSUTCDATETIME(),

    updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_prayer_configs_updated_at DEFAULT SYSUTCDATETIME(),

    CONSTRAINT CK_prayer_name CHECK (prayer_name IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
    CONSTRAINT UQ_user_prayer UNIQUE (user_id, prayer_name)
  );
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'enabled') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD enabled BIT NOT NULL
      CONSTRAINT DF_prayer_enabled_backfill DEFAULT 1
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'offset_min') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD offset_min INT NOT NULL
      CONSTRAINT DF_prayer_offset_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'quiet_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_enabled BIT NOT NULL
      CONSTRAINT DF_quiet_enabled_backfill DEFAULT 0
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'quiet_from') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_from TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'quiet_to') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD quiet_to TIME(0) NULL;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD created_at DATETIME2 NOT NULL
      CONSTRAINT DF_prayer_configs_created_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.prayer_configs', 'updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.prayer_configs
    ADD updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_prayer_configs_updated_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.check_constraints
  WHERE name = 'CK_prayer_name'
    AND parent_object_id = OBJECT_ID('dbo.prayer_configs')
)
BEGIN
  ALTER TABLE dbo.prayer_configs
    WITH CHECK ADD CONSTRAINT CK_prayer_name
    CHECK (prayer_name IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha'));
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_prayer_configs_user_id'
    AND object_id = OBJECT_ID('dbo.prayer_configs')
)
BEGIN
  CREATE INDEX IX_prayer_configs_user_id
    ON dbo.prayer_configs(user_id);
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'devices' AND schema_id = SCHEMA_ID('dbo'))
BEGIN
  CREATE TABLE dbo.devices (
    id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT PK_devices PRIMARY KEY
      DEFAULT NEWSEQUENTIALID(),

    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_devices_users REFERENCES dbo.users(id) ON DELETE CASCADE,

    platform NVARCHAR(20) NOT NULL
      CONSTRAINT DF_devices_platform DEFAULT 'alexa',

    device_id NVARCHAR(255) NOT NULL,
    device_name NVARCHAR(255) NOT NULL,

    created_at DATETIME2 NOT NULL
      CONSTRAINT DF_devices_created_at DEFAULT SYSUTCDATETIME(),

    CONSTRAINT UQ_user_device UNIQUE (user_id, platform, device_id)
  );
END
GO

IF COL_LENGTH('dbo.devices', 'platform') IS NULL
BEGIN
  ALTER TABLE dbo.devices
    ADD platform NVARCHAR(20) NOT NULL
      CONSTRAINT DF_devices_platform_backfill DEFAULT 'alexa'
      WITH VALUES;
END
GO

IF COL_LENGTH('dbo.devices', 'created_at') IS NULL
BEGIN
  ALTER TABLE dbo.devices
    ADD created_at DATETIME2 NOT NULL
      CONSTRAINT DF_devices_created_at_backfill DEFAULT SYSUTCDATETIME()
      WITH VALUES;
END
GO

IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_devices_user_id'
    AND object_id = OBJECT_ID('dbo.devices')
)
BEGIN
  CREATE INDEX IX_devices_user_id
    ON dbo.devices(user_id);
END
GO