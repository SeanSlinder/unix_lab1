const { z } = require("zod");
const { URL } = require("node:url");

function domainKey(u) {
  const url = new URL(u);
  return url.hostname;
}

const JobCreateSchema = z.object({
  urls: z.array(z.string().url()).min(1).max(5000),
  timeout_ms: z.number().int().min(1000).max(60000).default(8000),
  respect_robots: z.boolean().default(false),
  max_bytes: z.number().int().min(10000).max(10_000_000).default(2_000_000),
});

async function routes(fastify) {
  const { db, kafkaProducer, env } = fastify;

  fastify.get("/jobs", async (req, reply) => {
    const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset || 0) || 0, 0);

    const res = await db.query(
      `
    SELECT *
    FROM jobs
    ORDER BY created_at DESC
    LIMIT $1 OFFSET $2
    `,
      [limit, offset]
    );

    return res.rows;
  });

  fastify.post("/jobs", async (req, reply) => {
    const parsed = JobCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ error: "validation_error", details: parsed.error.issues });
    }

    const { urls, timeout_ms, respect_robots, max_bytes } = parsed.data;
    const jobId = crypto.randomUUID();
    const now = new Date().toISOString();

    await db.query(
      `INSERT INTO jobs(job_id, total, done, failed, state) VALUES($1,$2,0,0,'queued')`,
      [jobId, urls.length]
    );

    // Kafka: кладём задачи в crawl_requests, key = domain(url)
    const messages = urls.map((url) => ({
      key: domainKey(url),
      value: JSON.stringify({
        job_id: jobId,
        url,
        attempt: 0,
        timeout_ms,
        max_bytes,
        respect_robots,
        requested_at: now,
      }),
    }));

    // kafkajs producer.send() ограничение на размер батча — разобьём на чанки
    const chunkSize = 200;
    for (let i = 0; i < messages.length; i += chunkSize) {
      const chunk = messages.slice(i, i + chunkSize);
      await kafkaProducer.send({
        topic: env.TOPIC_REQUESTS,
        messages: chunk,
      });
    }

    return reply.code(200).send({ job_id: jobId, queued: urls.length });
  });

  fastify.get("/jobs/:job_id", async (req, reply) => {
    const jobId = req.params.job_id;

    const res = await db.query(
      `SELECT job_id, state, total, done, failed, created_at, updated_at FROM jobs WHERE job_id=$1`,
      [jobId]
    );
    if (res.rowCount === 0) return reply.code(404).send({ error: "not_found" });
    return res.rows[0];
  });

  fastify.get("/jobs/:job_id/articles", async (req, reply) => {
    const jobId = req.params.job_id;
    const limit = Math.min(Number(req.query.limit || 50) || 50, 200);
    const offset = Math.max(Number(req.query.offset || 0) || 0, 0);

    const job = await db.query(`SELECT 1 FROM jobs WHERE job_id=$1`, [jobId]);
    if (job.rowCount === 0) return reply.code(404).send({ error: "not_found" });

    const res = await db.query(
      `
      SELECT
        id, job_id, url, canonical_url, title, published_at, author,
        language, text, tags, fetched_at, http_status
      FROM articles
      WHERE job_id=$1
      ORDER BY id ASC
      LIMIT $2 OFFSET $3
      `,
      [jobId, limit, offset]
    );

    return res.rows;
  });
}

module.exports = routes;
