async function routes(fastify) {
  fastify.get("/health", async () => ({ status: "ok" }));
}

module.exports = routes;
