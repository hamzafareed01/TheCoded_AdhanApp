IF COL_LENGTH('dbo.user_profiles','selected_alexa_device_ids_json') IS NULL
BEGIN
  ALTER TABLE dbo.user_profiles
    ADD selected_alexa_device_ids_json NVARCHAR(MAX) NULL;
END
GO
