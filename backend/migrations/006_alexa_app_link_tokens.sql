IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='alexa_app_link_tokens')
BEGIN
  CREATE TABLE dbo.alexa_app_link_tokens (
    id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id UNIQUEIDENTIFIER NOT NULL UNIQUE
      CONSTRAINT FK_alexa_app_link_tokens_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    amazon_access_token NVARCHAR(MAX) NULL,
    amazon_refresh_token NVARCHAR(MAX) NULL,
    amazon_scope NVARCHAR(1000) NULL,
    endpoint_host NVARCHAR(255) NULL,
    customer_user_id NVARCHAR(255) NULL,
    expires_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_alexa_app_link_tokens_user
    ON dbo.alexa_app_link_tokens(user_id, updated_at DESC);
END
GO
