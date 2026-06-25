-- Migration 016: Smart Home AcceptGrant (async-event) tokens
--
-- Stores the per-user OAuth tokens obtained from the Smart Home skill's
-- Alexa.Authorization / AcceptGrant directive. These tokens carry the
-- alexa::async_event:write scope and are the ONLY credentials Amazon's
-- Event Gateway (api.amazonalexa.com/v3/events) accepts for proactive
-- events such as the virtual prayer DoorbellPress.
--
-- These are distinct from:
--   * alexa_app_link_tokens (Login-with-Amazon user profile token)
--   * alexa_skill_tokens     (tokens AdhanNow ISSUES to Amazon for linking)

IF NOT EXISTS (
  SELECT 1 FROM sys.tables
  WHERE name = 'alexa_event_gateway_tokens' AND schema_id = SCHEMA_ID('dbo')
)
BEGIN
  CREATE TABLE dbo.alexa_event_gateway_tokens (
    id            UNIQUEIDENTIFIER NOT NULL DEFAULT NEWSEQUENTIALID() PRIMARY KEY,
    user_id       UNIQUEIDENTIFIER NOT NULL UNIQUE
      CONSTRAINT FK_alexa_event_gateway_tokens_users REFERENCES dbo.users(id) ON DELETE CASCADE,
    access_token  NVARCHAR(MAX) NULL,
    refresh_token NVARCHAR(MAX) NULL,
    scope         NVARCHAR(1000) NULL,
    expires_at    DATETIME2 NULL,
    revoked_at    DATETIME2 NULL,
    created_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at    DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );

  CREATE INDEX IX_alexa_event_gateway_tokens_user
    ON dbo.alexa_event_gateway_tokens(user_id, updated_at DESC);
END;
GO
