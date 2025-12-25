const path = require("node:path");

const { createPool } = require("./db");
const { runMigrations } = require("./migrate");
const { createKafka } = require("./kafka");
const buildLogger = require("./logger");
const { buildServer } = require("./server");
const { startResultsSink } = require("./consumers/resultsSink");
const env = require("./env");

async function main() {
  const loggerOptions = buildLogger(env.LOG_LEVEL);

  const pool = createPool(env.DATABASE_URL);

  // DB readiness
  await pool.query("SELECT 1");

  // Migrations
  await runMigrations(pool, path.join(__dirname, "..", "migrations"));

  // Kafka
  const kafka = createKafka({
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
    logger: console,
  });
  const producer = kafka.producer();
  await producer.connect();

  // Results sink
  const sinkConsumer = await startResultsSink({
    kafka,
    db: pool,
    env,
    logger: console,
  });

  // API server
  const app = buildServer({
    env,
    loggerOptions,
    db: pool,
    kafkaProducer: producer,
  });

  await app.listen({ host: "0.0.0.0", port: env.PORT });
  app.log.info({ port: env.PORT }, "api listening");

  async function shutdown(sig) {
    app.log.info({ sig }, "shutting down...");
    try {
      await sinkConsumer.disconnect();
    } catch {}
    try {
      await producer.disconnect();
    } catch {}
    try {
      await app.close();
    } catch {}
    try {
      await pool.end();
    } catch {}
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
