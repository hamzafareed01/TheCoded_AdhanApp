// db/sql.js - Azure SQL connection pool management with retry logic that can be tuned per call

require("dotenv").config();
const sql = require("mssql");

let pool = null;
let poolPromise = null;

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function getConfig(overrides = {}) {
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

  const connectionTimeout = Number.isFinite(overrides.connectionTimeoutMs)
    ? overrides.connectionTimeoutMs
    : numberFromEnv("DB_CONNECTION_TIMEOUT_MS", 45000);

  const requestTimeout = Number.isFinite(overrides.requestTimeoutMs)
    ? overrides.requestTimeoutMs
    : numberFromEnv("DB_REQUEST_TIMEOUT_MS", 45000);

  const poolAcquireTimeout = Number.isFinite(overrides.poolAcquireTimeoutMs)
    ? overrides.poolAcquireTimeoutMs
    : numberFromEnv("DB_POOL_ACQUIRE_TIMEOUT_MS", 45000);

  const poolCreateTimeout = Number.isFinite(overrides.poolCreateTimeoutMs)
    ? overrides.poolCreateTimeoutMs
    : numberFromEnv("DB_POOL_CREATE_TIMEOUT_MS", 45000);

  return {
    user,
    password,
    server,
    database,
    port,
    pool: {
      max: numberFromEnv("DB_POOL_MAX", 5),
      min: numberFromEnv("DB_POOL_MIN", 0),
      idleTimeoutMillis: numberFromEnv("DB_POOL_IDLE_TIMEOUT_MS", 30000),
      acquireTimeoutMillis: poolAcquireTimeout,
      createTimeoutMillis: poolCreateTimeout,
      createRetryIntervalMillis: numberFromEnv("DB_POOL_CREATE_RETRY_INTERVAL_MS", 500),
    },
    options: {
      encrypt: true,
      trustServerCertificate: false,
      enableArithAbort: true,
    },
    connectionTimeout,
    requestTimeout,
  };
}

function isTransientSqlError(err) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  const num = Number(err?.number);

  return (
    num === 40613 ||
    num === 40197 ||
    num === 40501 ||
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
    /connection error/.test(msg) ||
    /failed to connect to .*1433/.test(msg) ||
    /could not connect/.test(msg)
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
    num === 18456
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function connectWithRetry(options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? options.maxAttempts
    : numberFromEnv("DB_CONNECT_MAX_ATTEMPTS", 6);

  const purpose = options.purpose ? String(options.purpose) : "request";
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let connectionPool = null;

    try {
      const config = getConfig(options);
      connectionPool = new sql.ConnectionPool(config);
      const connectedPool = await connectionPool.connect();

      connectedPool.on("error", async (err) => {
        console.error("Azure SQL pool error:", err);
        pool = null;
        poolPromise = null;
        try {
          await connectedPool.close();
        } catch {
          // ignore close failure
        }
      });

      if (attempt > 1) {
        console.log(`Azure SQL connected on retry ${attempt}/${maxAttempts} for ${purpose}.`);
      }

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
        console.error(
          `Azure SQL permanent configuration error during ${purpose}:`,
          err?.message || err
        );
        break;
      }

      if (!isTransientSqlError(err) || attempt === maxAttempts) {
        break;
      }

      const baseDelay = numberFromEnv("DB_CONNECT_RETRY_BASE_MS", 1000);
      const maxDelay = numberFromEnv("DB_CONNECT_RETRY_MAX_MS", 8000);
      const delayMs = Math.min(maxDelay, baseDelay * Math.pow(2, attempt - 1));

      console.warn(
        `Azure SQL connect attempt ${attempt}/${maxAttempts} failed during ${purpose}. Retrying in ${delayMs}ms...`,
        err?.message || err
      );

      await sleep(delayMs);
    }
  }

  throw lastErr;
}

async function getPool(options = {}) {
  if (!options || Object.keys(options).length === 0) {
    if (pool && pool.connected) {
      return pool;
    }

    if (poolPromise) {
      return poolPromise;
    }

    poolPromise = connectWithRetry({ purpose: "shared-pool" })
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

  return connectWithRetry(options);
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