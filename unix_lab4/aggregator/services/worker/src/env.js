function must(name, v) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = {
  KAFKA_BROKERS: must("KAFKA_BROKERS", process.env.KAFKA_BROKERS),
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || "news-worker",
  TOPIC_REQUESTS: process.env.TOPIC_REQUESTS || "crawl_requests",
  TOPIC_RESULTS: process.env.TOPIC_RESULTS || "crawl_results",
  WORKER_GROUP_ID: process.env.WORKER_GROUP_ID || "crawler-workers",
  WORKER_CONCURRENCY: Number(process.env.WORKER_CONCURRENCY || 10),
  WORKER_DOMAIN_CONCURRENCY: Number(process.env.WORKER_DOMAIN_CONCURRENCY || 2),
  WORKER_MAX_ATTEMPTS: Number(process.env.WORKER_MAX_ATTEMPTS || 3),
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
