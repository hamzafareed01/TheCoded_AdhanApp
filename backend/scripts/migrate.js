const fs = require("fs");
const path = require("path");
const { sql, getPool } = require("../db/sql");

async function ensureMigrations(pool) {
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
  const pool = await getPool();
  await ensureMigrations(pool);

  const dir = path.join(__dirname, "..", "migrations");
  const files = fs.readdirSync(dir).filter(f => /^\d+_.+\.sql$/.test(f)).sort();

  const applied = await pool.request().query(`SELECT filename FROM dbo.__migrations`);
  const appliedSet = new Set(applied.recordset.map(r => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) continue;

    const text = fs.readFileSync(path.join(dir, file), "utf8");

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await new sql.Request(tx).batch(text); // supports GO
      await new sql.Request(tx)
        .input("filename", sql.NVarChar(255), file)
        .query(`INSERT INTO dbo.__migrations(filename) VALUES (@filename)`);
      await tx.commit();
      console.log(`✅ Applied: ${file}`);
    } catch (e) {
      await tx.rollback();
      console.error(`❌ Failed: ${file}`);
      throw e;
    }
  }

  console.log("✅ Migrations complete.");
  await pool.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
