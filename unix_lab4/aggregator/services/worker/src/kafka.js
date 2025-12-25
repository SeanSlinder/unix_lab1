const { Kafka, logLevel } = require("kafkajs");

function createKafka({ brokers, clientId, logger }) {
  return new Kafka({
    clientId,
    brokers: brokers.split(",").map((s) => s.trim()),
    logLevel: logLevel.NOTHING,
    logCreator:
      () =>
      ({ namespace, level, label, log }) => {
        if (level >= 4)
          logger.error({ namespace, label, ...log }, "kafka error");
      },
  });
}

module.exports = { createKafka };
