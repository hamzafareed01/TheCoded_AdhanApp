IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='alexa_customer_endpoints')
BEGIN
  CREATE TABLE dbo.alexa_customer_endpoints (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_alexa_customer_endpoints_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    endpoint_id NVARCHAR(255) NOT NULL,
    friendly_name NVARCHAR(255) NOT NULL,
    endpoint_kind NVARCHAR(40) NOT NULL CONSTRAINT DF_alexa_customer_endpoints_kind DEFAULT 'device',
    device_family NVARCHAR(40) NULL,
    device_id NVARCHAR(255) NULL,
    supports_audio BIT NOT NULL CONSTRAINT DF_alexa_customer_endpoints_supports_audio DEFAULT 1,
    supports_fire_tv BIT NOT NULL CONSTRAINT DF_alexa_customer_endpoints_supports_fire_tv DEFAULT 0,
    source NVARCHAR(40) NULL,
    metadata_json NVARCHAR(MAX) NULL,
    sort_order INT NOT NULL CONSTRAINT DF_alexa_customer_endpoints_sort_order DEFAULT 100,
    is_enabled BIT NOT NULL CONSTRAINT DF_alexa_customer_endpoints_enabled DEFAULT 1,
    last_seen_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_alexa_customer_endpoints_user_endpoint UNIQUE (user_id, endpoint_id)
  );

  CREATE INDEX IX_alexa_customer_endpoints_user_enabled
    ON dbo.alexa_customer_endpoints(user_id, is_enabled, sort_order, friendly_name);
END
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='alexa_playback_target_selections')
BEGIN
  CREATE TABLE dbo.alexa_playback_target_selections (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_alexa_playback_target_selections_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    endpoint_id NVARCHAR(255) NOT NULL,
    enabled BIT NOT NULL CONSTRAINT DF_alexa_playback_target_selections_enabled DEFAULT 1,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_alexa_playback_target_selections_user_endpoint UNIQUE (user_id, endpoint_id)
  );

  CREATE INDEX IX_alexa_playback_target_selections_user
    ON dbo.alexa_playback_target_selections(user_id, enabled, created_at);
END
GO
