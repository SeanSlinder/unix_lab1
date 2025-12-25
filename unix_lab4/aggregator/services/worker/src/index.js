const { URL } = require("node:url");

const env = require("./env");
const createLogger = require("./logger");
const { createKafka } = require("./kafka");
const { Semaphore, DomainLimiter } = require("./limiter");
const { RobotsCache } = require("./robots");
const { fetchWithRetries } = require("./fetcher");
const { extractArticle } = require("./extractor");

function domainKey(u) {
  return new URL(u).hostname;
}

async function main() {
  const logger = createLogger(env.LOG_LEVEL);

  const kafka = createKafka({
    brokers: env.KAFKA_BROKERS,
    clientId: env.KAFKA_CLIENT_ID,
    logger,
  });

  const consumer = kafka.consumer({ groupId: env.WORKER_GROUP_ID });
  const producer = kafka.producer();

  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: env.TOPIC_REQUESTS, fromBeginning: false });

  const globalSem = new Semaphore(env.WORKER_CONCURRENCY);
  const domainLimiter = new DomainLimiter(env.WORKER_DOMAIN_CONCURRENCY);
  const robots = new RobotsCache({ userAgent: "*" });

  logger.info(
    {
      groupId: env.WORKER_GROUP_ID,
      topic: env.TOPIC_REQUESTS,
      concurrency: env.WORKER_CONCURRENCY,
      perDomain: env.WORKER_DOMAIN_CONCURRENCY,
      maxAttempts: env.WORKER_MAX_ATTEMPTS,
    },
    "worker started"
  );

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value ? message.value.toString("utf8") : "";
      let req;
      try {
        req = JSON.parse(raw);
      } catch (e) {
        logger.error({ raw }, "invalid json in crawl_requests");
        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);
        return;
      }

      const jobId = req.job_id;
      const url = req.url;

      const key = domainKey(url);
      const requestedAt = req.requested_at || new Date().toISOString();
      const timeoutMs = Number(req.timeout_ms || 8000);
      const maxBytes = Number(req.max_bytes || 2_000_000);
      const respectRobots = Boolean(req.respect_robots);

      await globalSem.use(async () => {
        await domainLimiter.use(key, async () => {
          const fetchedAtIso = new Date().toISOString();

          let result = null;

          try {
            if (respectRobots) {
              const allowed = await robots.allowed(
                new URL(url),
                Math.min(timeoutMs, 4000)
              );
              if (!allowed) {
                result = {
                  job_id: jobId,
                  url,
                  status: "error",
                  http_status: null,
                  fetched_at: new Date().toISOString(),
                  canonical_url: null,
                  title: null,
                  published_at: null,
                  author: null,
                  language: null,
                  tags: [],
                  text: "",
                  error: "robots_disallowed",
                };
              }
            }

            if (!result) {
              const fetchRes = await fetchWithRetries(
                url,
                {
                  timeoutMs,
                  maxBytes,
                  userAgent: "news-aggregator-worker/1.0",
                },
                env.WORKER_MAX_ATTEMPTS,
                logger
              );

              if (!fetchRes.ok) {
                result = {
                  job_id: jobId,
                  url,
                  status: "error",
                  http_status: null,
                  fetched_at: new Date().toISOString(),
                  canonical_url: null,
                  title: null,
                  published_at: null,
                  author: null,
                  language: null,
                  tags: [],
                  text: "",
                  error: fetchRes.error || "download_failed",
                };
              } else if (
                fetchRes.statusCode < 200 ||
                fetchRes.statusCode >= 300
              ) {
                result = {
                  job_id: jobId,
                  url,
                  status: "error",
                  http_status: fetchRes.statusCode,
                  fetched_at: new Date().toISOString(),
                  canonical_url: null,
                  title: null,
                  published_at: null,
                  author: null,
                  language: null,
                  tags: [],
                  text: "",
                  error: `http_${fetchRes.statusCode}`,
                };
              } else {
                let extracted;
                try {
                  extracted = await extractArticle(url, fetchRes.html);
                } catch (e) {
                  logger.warn(
                    { jobId, url, err: String(e) },
                    "extraction failed"
                  );
                  result = {
                    job_id: jobId,
                    url,
                    status: "error",
                    http_status: fetchRes.statusCode,
                    fetched_at: new Date().toISOString(),
                    canonical_url: null,
                    title: null,
                    published_at: null,
                    author: null,
                    language: null,
                    tags: [],
                    text: "",
                    error: "extraction_failed",
                  };
                }

                if (!result) {
                  result = {
                    job_id: jobId,
                    url,
                    status: "ok",
                    http_status: fetchRes.statusCode,
                    fetched_at: new Date().toISOString(),
                    canonical_url: extracted.canonical_url || null,
                    title: extracted.title || null,
                    published_at: null,
                    author: extracted.author || null,
                    language: extracted.language || null,
                    tags: extracted.tags || [],
                    text: extracted.text || "",
                    error: null,
                  };
                }
              }
            }

            // Отправляем результат в crawl_results (даже если error)
            await producer.send({
              topic: env.TOPIC_RESULTS,
              messages: [
                {
                  key,
                  value: JSON.stringify({
                    ...result,
                    requested_at: requestedAt,
                    worker_fetched_at: fetchedAtIso,
                  }),
                },
              ],
            });

            // commit offset only after producing result
            await consumer.commitOffsets([
              {
                topic,
                partition,
                offset: (BigInt(message.offset) + 1n).toString(),
              },
            ]);

            logger.info(
              {
                jobId,
                url,
                status: result.status,
                http_status: result.http_status,
                key,
              },
              "processed"
            );
          } catch (e) {
            // Не коммитим offset -> at-least-once
            logger.error(
              { jobId, url, err: String(e) },
              "processing failed (will retry via Kafka)"
            );
          }
        });
      });
    },
  });

  async function shutdown(sig) {
    logger.info({ sig }, "shutting down...");
    try {
      await consumer.disconnect();
    } catch {}
    try {
      await producer.disconnect();
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
