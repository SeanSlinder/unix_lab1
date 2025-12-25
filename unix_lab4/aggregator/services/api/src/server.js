const Fastify = require("fastify");

const healthRoutes = require("./routes/health");
const jobRoutes = require("./routes/jobs");

function buildServer({ env, loggerOptions, db, kafkaProducer }) {
  const app = Fastify({
    logger: loggerOptions,
  });

  app.decorate("env", env);
  app.decorate("db", db);
  app.decorate("kafkaProducer", kafkaProducer);

  app.register(healthRoutes);
  app.register(jobRoutes);

  app.setErrorHandler((err, req, reply) => {
    req.log.error({ err }, "unhandled error");
    reply.code(500).send({ error: "internal_error" });
  });

  return app;
}

module.exports = { buildServer };
