#!/bin/bash
set -euo pipefail

BROKERS="${KAFKA_BROKERS:-kafka:9092}"
TOPIC_REQUESTS="${TOPIC_REQUESTS:-crawl_requests}"
TOPIC_RESULTS="${TOPIC_RESULTS:-crawl_results}"
REQUESTS_PARTITIONS="${REQUESTS_PARTITIONS:-12}"
RESULTS_PARTITIONS="${RESULTS_PARTITIONS:-3}"
REPLICATION_FACTOR="${REPLICATION_FACTOR:-1}"

echo "[kafka-init] Waiting for broker at ${BROKERS}..."
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BROKERS}" --list >/dev/null 2>&1 || true

create_topic () {
  local topic="$1"
  local partitions="$2"
  echo "[kafka-init] Creating topic ${topic} (partitions=${partitions})"
  /opt/kafka/bin/kafka-topics.sh \
    --bootstrap-server "${BROKERS}" \
    --create \
    --if-not-exists \
    --topic "${topic}" \
    --partitions "${partitions}" \
    --replication-factor "${REPLICATION_FACTOR}"
}

create_topic "${TOPIC_REQUESTS}" "${REQUESTS_PARTITIONS}"
create_topic "${TOPIC_RESULTS}" "${RESULTS_PARTITIONS}"

echo "[kafka-init] Topics:"
/opt/kafka/bin/kafka-topics.sh --bootstrap-server "${BROKERS}" --describe
echo "[kafka-init] Done."
