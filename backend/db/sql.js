require("dotenv").config();
const sql = require("mssql");

let pool = null;
let poolPromise = null;

function getConfig() {
  const server = process.env.DB_SERVER;
  const database = process.env.DB_NAME;
  const user = process.env.DB_USER;
  const password = process.env.DB_PASSWORD;
  const port = Number(process.env.DB_PORT || 1433);

  if (!server || !database || !user || !password) {
    throw new Error(
      "Missing Azure SQL env vars: DB_SERVER/DB_NAME/DB_USER/DB_PASSWORD"
    );
  }

  return {
    user,
    password,
    server,
    database,
    port,
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000,
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    connectionTimeout: 30000,
    requestTimeout: 30000,
  };
}

function isTransientSqlError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  const num = Number(err?.number);

  return (
    num === 40613 || // database unavailable / serverless resume
    num === 40197 || // service encountered error
    num === 40501 || // service busy / throttling
    num === 49918 ||
    num === 49919 ||
    num === 49920 ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ECONNCLOSED" ||
    code === "ELOGIN" ||
    /not currently available/.test(msg) ||
    /timeout/.test(msg) ||
    /connection is closed/.test(msg) ||
    /socket/.test(msg) ||
    /client with ip address .* is not allowed to access the server/.test(msg)
  );
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(maxAttempts = 6) {
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const cfg = getConfig();
      const connectionPool = new sql.ConnectionPool(cfg);
      const connectedPool = await connectionPool.connect();

      connectedPool.on("error", (err) => {
        console.error("Azure SQL pool error:", err);
        pool = null;
        poolPromise = null;
      });

      return connectedPool;
    } catch (err) {
      lastErr = err;

      if (!isTransientSqlError(err) || attempt === maxAttempts) {
        break;
      }

      const delayMs = 750 * Math.pow(2, attempt - 1);
      console.warn(
        `Azure SQL connect attempt ${attempt}/${maxAttempts} failed. Retrying in ${delayMs}ms...`,
        err?.message || err
      );
      await sleep(delayMs);
    }
  }

  throw lastErr;
}

async function getPool() {
  if (pool?.connected) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  poolPromise = connectWithRetry()
    .then((connectedPool) => {
      pool = connectedPool;
      return pool;
    })
    .catch((err) => {
      pool = null;
      poolPromise = null;
      throw err;
    });

  return poolPromise;
}

async function closePool() {
  if (pool) {
    try {
      await pool.close();
    } catch (err) {
      console.warn("Error while closing Azure SQL pool:", err?.message || err);
    }
  }

  pool = null;
  poolPromise = null;
}

module.exports = {
  sql,
  getPool,
  closePool,
};