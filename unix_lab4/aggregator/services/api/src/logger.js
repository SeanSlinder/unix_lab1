module.exports = function buildLogger(level) {
  return {
    level: level || "info",
  };
};
