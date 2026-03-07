const sql = require("mssql");

let pool;

/**
 * Azure SQL serverless can auto-pause. First call may throw transient errors.
 * This helper retries a few times for transient conditions.
 */
async function connectWithRetry(maxAttempts = 5) {
  const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    server: process.env.DB_SERVER,
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      encrypt: true,
      trustServerCertificate: false,
    },
  };

  let lastErr;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const p = await sql.connect(config);
      return p;
    } catch (e) {
      lastErr = e;
      const msg = String(e?.message || "");
      const num = e?.number;
      const code = e?.code;
      const transient =
        num === 40613 ||
        code === "ETIMEDOUT" ||
        /not currently available/i.test(msg) ||
        /timeout/i.test(msg) ||
        /ECONNRESET/i.test(msg);

      if (!transient || i === maxAttempts) break;
      const delay = 500 * (2 ** (i - 1));
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

async function getPool() {
  if (pool) return pool;

  if (!process.env.DB_SERVER || !process.env.DB_NAME || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    throw new Error("Missing Azure SQL env vars: DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD");
  }

  pool = await connectWithRetry();
  return pool;
}

module.exports = { sql, getPool };
