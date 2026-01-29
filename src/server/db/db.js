import pg from "pg";
import dotenv from "dotenv";
dotenv.config();

const { Pool } = pg;

const poolOptions = {
  connectionString: process.env.DATABASE_URL,
  // Parametry poola — kontroluj przez env
  max: Number(process.env.PG_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.PG_IDLE_MS) || 30000,
  connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT_MS) || 2000,
};

// Jeśli potrzebujesz SSL w środowisku produkcyjnym (np. Heroku)
if (process.env.DB_REQUIRE_SSL === "true") {
  poolOptions.ssl = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false",
  };
}

const pool = new Pool(poolOptions);

// Przydatne logi (tylko w dev)
if (process.env.NODE_ENV !== "production") {
  pool.on("connect", () => console.log("🟢 Połączono z bazą PostgreSQL (pool)"));
  pool.on("remove", () => console.log("🟡 Połączenie z puli usunięte"));
} else {
  pool.on("connect", () => console.log("🟢 Połączono z bazą PostgreSQL"));
}

pool.on("error", (err) => {
  console.error("🔴 Błąd połączenia z bazą:", err);
});

// Graceful shutdown (kontenery, Heroku)
async function shutdown() {
  try {
    console.log("Zamykanie poola PostgreSQL...");
    await pool.end();
    console.log("Pool zamknięty.");
  } catch (err) {
    console.error("Błąd przy zamykaniu poola:", err);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

// Opcjonalny wrapper — ułatwia logowanie i testy
async function query(text, params = []) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.NODE_ENV !== "production") {
      const ms = Date.now() - start;
      if (ms > 200) console.warn(`Wolne zapytanie: ${ms}ms — ${text}`);
    }
    return res;
  } catch (err) {
    // Możesz tu dodać centralne mapowanie błędów/telemetrię
    throw err;
  }
}

export { pool, query };
export default pool;
