const pino = require("pino");

module.exports = function createLogger(level) {
  return pino({
    level: level || "info",
  });
};
