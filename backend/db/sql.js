// Azure SQL connection pool management with retry logic

// db/sql.js - Azure SQL connection pool management with retry logic

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

  if (!Number.isFinite(port) || port <= 0) {
    throw new Error("DB_PORT must be a valid number");
  }

  return {
    user,
    password,
    server,
    database,
    port,
    pool: {
      max: 5,
      min: 0,
      idleTimeoutMillis: 30000,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 60000,
      createRetryIntervalMillis: 500,
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    connectionTimeout: 45000,
    requestTimeout: 45000,
  };
}

function isTransientSqlError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  const num = Number(err?.number);

  return (
    num === 40613 || // database unavailable / serverless resume
    num === 40197 || // service encountered an error
    num === 40501 || // service busy / throttling
    num === 49918 ||
    num === 49919 ||
    num === 49920 ||
    code === "ETIMEDOUT" ||
    code === "ESOCKET" ||
    code === "ECONNRESET" ||
    code === "ECONNCLOSED" ||
    code === "EINSTLOOKUP" ||
    /not currently available/.test(msg) ||
    /timeout/.test(msg) ||
    /connection is closed/.test(msg) ||
    /socket/.test(msg) ||
    /server was not found/.test(msg) ||
    /connection error/.test(msg)
  );
}

function isPermanentConfigError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  const num = Number(err?.number);

  return (
    code === "ELOGIN" ||
    /login failed/.test(msg) ||
    /client with ip address .* is not allowed to access the server/.test(msg) ||
    /firewall/.test(msg) ||
    /cannot open server/.test(msg) ||
    /failed to connect to .*1433/.test(msg) ||
    num === 18456
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(maxAttempts = 8) {
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let connectionPool = null;

    try {
      const config = getConfig();
      connectionPool = new sql.ConnectionPool(config);
      const connectedPool = await connectionPool.connect();

      connectedPool.on("error", (err) => {
        console.error("Azure SQL pool error:", err);
        pool = null;
        poolPromise = null;
      });

      return connectedPool;
    } catch (err) {
      lastErr = err;

      if (connectionPool) {
        try {
          await connectionPool.close();
        } catch {
          // ignore close failure
        }
      }

      if (isPermanentConfigError(err)) {
        break;
      }

      if (!isTransientSqlError(err) || attempt === maxAttempts) {
        break;
      }

      const delayMs = Math.min(6000, 750 * Math.pow(2, attempt - 1));
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
  if (pool && pool.connected) {
    return pool;
  }

  if (poolPromise) {
    return poolPromise;
  }

  poolPromise = connectWithRetry()
    .then((connectedPool) => {
      pool = connectedPool;
      return connectedPool;
    })
    .catch((err) => {
      pool = null;
      poolPromise = null;
      throw err;
    });

  return poolPromise;
}

async function closePool() {
  const currentPool = pool;
  pool = null;
  poolPromise = null;

  if (currentPool) {
    try {
      await currentPool.close();
    } catch (err) {
      console.warn("Error while closing Azure SQL pool:", err?.message || err);
    }
  }
}

module.exports = {
  sql,
  getPool,
  closePool,
};