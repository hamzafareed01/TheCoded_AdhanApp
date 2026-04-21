IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='alexa_prayer_target_selections')
BEGIN
  CREATE TABLE dbo.alexa_prayer_target_selections (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL CONSTRAINT FK_alexa_prayer_target_selections_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    prayer_name NVARCHAR(20) NOT NULL,
    endpoint_id NVARCHAR(255) NOT NULL,
    enabled BIT NOT NULL CONSTRAINT DF_alexa_prayer_target_selections_enabled DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_alexa_prayer_target_selections_user_prayer_endpoint UNIQUE (user_id, prayer_name, endpoint_id)
  );

  CREATE INDEX IX_alexa_prayer_target_selections_user
    ON dbo.alexa_prayer_target_selections(user_id, prayer_name, enabled, created_at);
END
GO
