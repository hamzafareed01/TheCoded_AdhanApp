IF NOT EXISTS (SELECT *
FROM sys.tables
WHERE name='alexa_skill_authorization_codes')
BEGIN
  CREATE TABLE dbo.alexa_skill_authorization_codes
  (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    auth_code_hash NVARCHAR(128) NOT NULL UNIQUE,
    auth_code_prefix NVARCHAR(24) NOT NULL,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_alexa_skill_auth_codes_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    client_id NVARCHAR(255) NOT NULL,
    redirect_uri NVARCHAR(1000) NOT NULL,
    scope NVARCHAR(255) NULL,
    expires_at DATETIME2 NOT NULL,
    consumed_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_alexa_skill_auth_codes_user'
    AND object_id = OBJECT_ID('dbo.alexa_skill_authorization_codes')
)
BEGIN
    CREATE INDEX IX_alexa_skill_auth_codes_user
    ON dbo.alexa_skill_authorization_codes(user_id, created_at DESC);
  END
END
GO

IF NOT EXISTS (SELECT *
FROM sys.tables
WHERE name='alexa_skill_tokens')
BEGIN
  CREATE TABLE dbo.alexa_skill_tokens
  (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT FK_alexa_skill_tokens_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    client_id NVARCHAR(255) NOT NULL,
    scope NVARCHAR(255) NOT NULL CONSTRAINT DF_alexa_skill_tokens_scope DEFAULT 'alexa',
    access_token_hash NVARCHAR(128) NOT NULL UNIQUE,
    access_token_prefix NVARCHAR(24) NOT NULL,
    refresh_token_hash NVARCHAR(128) NOT NULL UNIQUE,
    refresh_token_prefix NVARCHAR(24) NOT NULL,
    alexa_user_id NVARCHAR(255) NULL,
    expires_at DATETIME2 NOT NULL,
    last_used_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_alexa_skill_tokens_user'
    AND object_id = OBJECT_ID('dbo.alexa_skill_tokens')
)
BEGIN
    CREATE INDEX IX_alexa_skill_tokens_user
    ON dbo.alexa_skill_tokens(user_id, created_at DESC);
  END
END
GO

IF NOT EXISTS (SELECT *
FROM sys.tables
WHERE name='alexa_dispatch_log')
BEGIN
  CREATE TABLE dbo.alexa_dispatch_log
  (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NULL
      CONSTRAINT FK_alexa_dispatch_log_users REFERENCES dbo.users(id) ON DELETE SET NULL,
    request_id NVARCHAR(255) NULL,
    prayer_name NVARCHAR(20) NULL,
    device_id NVARCHAR(255) NULL,
    trigger_source NVARCHAR(40) NOT NULL,
    status NVARCHAR(30) NOT NULL,
    message NVARCHAR(1000) NULL,
    payload_json NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = 'IX_alexa_dispatch_log_user'
    AND object_id = OBJECT_ID('dbo.alexa_dispatch_log')
)
BEGIN
    CREATE INDEX IX_alexa_dispatch_log_user
    ON dbo.alexa_dispatch_log(user_id, created_at DESC);
  END
END
GO
