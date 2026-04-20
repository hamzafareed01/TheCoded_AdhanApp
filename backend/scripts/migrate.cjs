// backend/scripts/migrate.cjs
const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("../db/sql");

function splitOnGo(sqlText) {
  const lines = sqlText.split(/\r?\n/);
  const batches = [];
  let current = [];

  for (const line of lines) {
    if (/^\s*GO\s*$/i.test(line)) {
      const batch = current.join("\n").trim();
      if (batch) batches.push(batch);
      current = [];
    } else {
      current.push(line);
    }
  }

  const last = current.join("\n").trim();
  if (last) batches.push(last);

  return batches;
}

async function ensureMigrationsTable(pool) {
  await pool.request().query(`
    IF NOT EXISTS (SELECT * FROM sys.tables WHERE name='__migrations')
    BEGIN
      CREATE TABLE dbo.__migrations (
        id INT IDENTITY(1,1) PRIMARY KEY,
        filename NVARCHAR(255) NOT NULL UNIQUE,
        applied_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
      );
    END
  `);
}

async function main() {
  console.log("Starting migrations...");
  const pool = await getPool({
    purpose: "migration",
    maxAttempts: Number(process.env.MIGRATION_DB_CONNECT_MAX_ATTEMPTS || 8),
    connectionTimeoutMs: Number(process.env.MIGRATION_DB_CONNECTION_TIMEOUT_MS || 45000),
    requestTimeoutMs: Number(process.env.MIGRATION_DB_REQUEST_TIMEOUT_MS || 45000),
    poolAcquireTimeoutMs: Number(process.env.MIGRATION_DB_POOL_ACQUIRE_TIMEOUT_MS || 60000),
    poolCreateTimeoutMs: Number(process.env.MIGRATION_DB_POOL_CREATE_TIMEOUT_MS || 60000),
  });

  try {
    await ensureMigrationsTable(pool);

    const dir = path.join(__dirname, "..", "migrations");
    const files = fs
      .readdirSync(dir)
      .filter((f) => /^\d+_.+\.sql$/i.test(f))
      .sort();

    const applied = await pool.request().query(`SELECT filename FROM dbo.__migrations`);
    const appliedSet = new Set(applied.recordset.map((r) => r.filename));

    for (const file of files) {
      if (appliedSet.has(file)) continue;

      const text = fs.readFileSync(path.join(dir, file), "utf8");
      const batches = splitOnGo(text);

      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const batch of batches) {
          await new sql.Request(tx).query(batch);
        }

        await new sql.Request(tx)
          .input("filename", sql.NVarChar(255), file)
          .query(`INSERT INTO dbo.__migrations(filename) VALUES (@filename)`);

        await tx.commit();
        console.log(`Applied migration: ${file}`);
      } catch (e) {
        await tx.rollback();
        console.error(`Failed migration: ${file}`);
        throw e;
      }
    }

    console.log("Migrations complete.");
  } finally {
    try {
      await pool.close();
    } catch (err) {
      console.warn("Error closing migration SQL pool:", err?.message || err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
