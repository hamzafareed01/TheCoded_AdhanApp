-- 015_missing_columns.sql
-- Adds columns referenced in code but missing from schema.
-- (1) amazon_token_expires_at on alexa_app_link_tokens — used by alexaRoutineCreator.js
--     for token expiry checking and refresh. Without it, proactive doorbell events
--     and speaker groups fail with "Invalid column name 'amazon_token_expires_at'".
-- (2) onboarding_complete + onboarding_completed_at on user_profiles — written by
--     POST /api/alexa/onboarding/complete (Step 6). Without them, onboarding
--     completion fails with "Invalid column name" errors.

IF COL_LENGTH('dbo.alexa_app_link_tokens', 'amazon_token_expires_at') IS NULL
BEGIN
  ALTER TABLE dbo.alexa_app_link_tokens
    ADD amazon_token_expires_at DATETIME2 NULL;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'onboarding_complete') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD onboarding_complete BIT NOT NULL
      CONSTRAINT DF_user_profiles_onboarding_complete DEFAULT 0;
END
GO

IF COL_LENGTH('dbo.user_profiles', 'onboarding_completed_at') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD onboarding_completed_at DATETIME2 NULL;
END
GO