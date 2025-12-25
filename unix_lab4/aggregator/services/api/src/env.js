function must(name, v) {
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

module.exports = {
  PORT: Number(process.env.PORT || 8080),
  DATABASE_URL: must("DATABASE_URL", process.env.DATABASE_URL),
  KAFKA_BROKERS: must("KAFKA_BROKERS", process.env.KAFKA_BROKERS),
  KAFKA_CLIENT_ID: process.env.KAFKA_CLIENT_ID || "news-api",
  TOPIC_REQUESTS: process.env.TOPIC_REQUESTS || "crawl_requests",
  TOPIC_RESULTS: process.env.TOPIC_RESULTS || "crawl_results",
  RESULTS_GROUP_ID: process.env.RESULTS_GROUP_ID || "results-sink",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
};
