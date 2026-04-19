
IF COL_LENGTH('dbo.user_profiles','quiet_down_enabled') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_enabled BIT NOT NULL
      CONSTRAINT DF_user_profiles_quiet_down_enabled DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.user_profiles','quiet_down_policy_json') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD quiet_down_policy_json NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='alexa_smart_home_log')
BEGIN
  CREATE TABLE dbo.alexa_smart_home_log (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_alexa_smart_home_log_users REFERENCES dbo.users(id) ON DELETE SET NULL,
    endpoint_id NVARCHAR(255) NOT NULL,
    directive_name NVARCHAR(120) NOT NULL,
    payload_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_alexa_smart_home_log_user_created
    ON dbo.alexa_smart_home_log(user_id, created_at DESC);
END
GO
