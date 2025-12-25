const { Kafka, logLevel } = require("kafkajs");

function createKafka({ brokers, clientId, logger }) {
  const kafka = new Kafka({
    clientId,
    brokers: brokers.split(",").map((s) => s.trim()),
    logLevel: logLevel.NOTHING,
    logCreator:
      () =>
      ({ namespace, level, label, log }) => {
        // kafkajs internal logs -> fastify/pino уже ведёт логи
        if (level >= 4)
          logger.error({ namespace, label, ...log }, "kafka error");
      },
  });
  return kafka;
}

module.exports = { createKafka };
