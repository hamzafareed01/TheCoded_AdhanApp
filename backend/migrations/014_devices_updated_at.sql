-- 014_devices_updated_at.sql
-- Adds updated_at column to dbo.devices. The device-seen MERGE in index.js
-- writes to this column on MATCH, but it was never added to the schema.
-- Without this, every Alexa device re-registration fails with
-- "Invalid column name 'updated_at'" (SQL error 207).

IF COL_LENGTH('dbo.devices','updated_at') IS NULL
BEGIN
  ALTER TABLE dbo.devices
    ADD updated_at DATETIME2 NOT NULL
      CONSTRAINT DF_devices_updated_at DEFAULT SYSUTCDATETIME();
END
GO