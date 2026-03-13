// backend/scripts/migrate.js
const fs = require("fs");
const path = require("path");
const { sql, getPool, closePool } = require("../db/sql");

function parseBatches(sqlText) {
  const text = String(sqlText || "").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const batches = [];
  let current = [];

  function flushCurrent(repeat = 1) {
    const batch = current.join("\n").trim();
    current = [];

    if (!batch) return;

    const times = Number.isFinite(repeat) && repeat > 0 ? repeat : 1;
    for (let i = 0; i < times; i += 1) {
      batches.push(batch);
    }
  }

  for (const line of lines) {
    const match = line.match(/^\s*GO(?:\s+(\d+))?\s*$/i);

    if (match) {
      const repeat = match[1] ? Number(match[1]) : 1;
      flushCurrent(repeat);
    } else {
      current.push(line);
    }
  }

  flushCurrent(1);
  return batches;
}

async function ensureMigrationsTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = '__migrations' AND schema_id = SCHEMA_ID('dbo'))
    BEGIN
      CREATE TABLE dbo.__migrations (
        id INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

function getMigrationFiles(migrationsDir) {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory not found: ${migrationsDir}`);
  }

  return fs
    .readdirSync(migrationsDir)
    .filter((file) => /^\d+_.+\.sql$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

async function getAppliedMigrations(pool) {
  const result = await pool.request().query(`
    SELECT filename
    FROM dbo.__migrations
    ORDER BY filename
  `);

  return new Set(result.recordset.map((row) => row.filename));
}

async function applyMigration(pool, migrationsDir, file) {
  const fullPath = path.join(migrationsDir, file);
  const text = fs.readFileSync(fullPath, "utf8");
  const batches = parseBatches(text);

  if (batches.length === 0) {
    console.log(`ℹ️ Skipping empty migration: ${file}`);
    return;
  }

  const tx = new sql.Transaction(pool);
  await tx.begin();

  try {
    for (let i = 0; i < batches.length; i += 1) {
      const batch = batches[i];

      await new sql.Request(tx).query(`
        SET XACT_ABORT ON;
        ${batch}
      `);
    }

    await new sql.Request(tx)
      .input("filename", sql.NVarChar(255), file)
      .query(`
        INSERT INTO dbo.__migrations (filename)
        VALUES (@filename)
      `);

    await tx.commit();
    console.log(`✅ Applied: ${file}`);
  } catch (err) {
    try {
      await tx.rollback();
    } catch {
      // ignore rollback failure
    }

    console.error(`❌ Failed: ${file}`);
    throw err;
  }
}

async function main() {
  const pool = await getPool();
  const migrationsDir = path.join(__dirname, "..", "migrations");

  await ensureMigrationsTable(pool);

  const files = getMigrationFiles(migrationsDir);
  const appliedSet = await getAppliedMigrations(pool);

  if (files.length === 0) {
    console.log("ℹ️ No migration files found.");
    return;
  }

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`⏭️ Already applied: ${file}`);
      continue;
    }

    await applyMigration(pool, migrationsDir, file);
  }

  console.log("✅ Migrations complete.");
}

main()
  .catch((err) => {
    console.error("Migration runner failed:");
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      if (typeof closePool === "function") {
        await closePool();
      }
    } catch (err) {
      console.error("Failed to close SQL pool cleanly:", err);
    }
  });