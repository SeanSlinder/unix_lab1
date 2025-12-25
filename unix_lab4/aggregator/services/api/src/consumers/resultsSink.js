function toInt(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function startResultsSink({ kafka, db, env, logger }) {
  const consumer = kafka.consumer({ groupId: env.RESULTS_GROUP_ID });
  await consumer.connect();
  await consumer.subscribe({ topic: env.TOPIC_RESULTS, fromBeginning: false });

  logger.info(
    { topic: env.TOPIC_RESULTS, groupId: env.RESULTS_GROUP_ID },
    "results sink consumer started"
  );

  await consumer.run({
    autoCommit: false,
    eachMessage: async ({ topic, partition, message }) => {
      const raw = message.value ? message.value.toString("utf8") : "";
      let evt;
      try {
        evt = JSON.parse(raw);
      } catch (e) {
        logger.error({ raw }, "invalid json in crawl_results");
        // коммитим, чтобы не зациклиться на мусоре
        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);
        return;
      }

      const jobId = evt.job_id;
      const url = evt.url;
      const fetchedAt = evt.fetched_at ? new Date(evt.fetched_at) : new Date();
      const httpStatus = toInt(evt.http_status);

      // Идемпотентность: unique(job_id,url) + ON CONFLICT DO NOTHING.
      // Обновление counters делаем только если insert реально произошёл (RETURNING).
      const client = await db.connect();
      try {
        await client.query("BEGIN");

        const existsJob = await client.query(
          "SELECT job_id FROM jobs WHERE job_id=$1 FOR UPDATE",
          [jobId]
        );
        if (existsJob.rowCount === 0) {
          // job мог быть удалён — коммитим offset и выходим
          await client.query("ROLLBACK");
          await consumer.commitOffsets([
            {
              topic,
              partition,
              offset: (BigInt(message.offset) + 1n).toString(),
            },
          ]);
          return;
        }

        let doneInc = 0;
        let failedInc = 0;

        if (evt.status === "ok") {
          const ins = await client.query(
            `
            INSERT INTO articles(
              job_id, url, canonical_url, title, published_at, author,
              language, text, tags, fetched_at, http_status
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
            ON CONFLICT (job_id, url) DO NOTHING
            RETURNING id
            `,
            [
              jobId,
              url,
              evt.canonical_url || null,
              evt.title || null,
              evt.published_at ? new Date(evt.published_at) : null,
              evt.author || null,
              evt.language || null,
              evt.text || null,
              evt.tags ? JSON.stringify(evt.tags) : null,
              fetchedAt,
              httpStatus,
            ]
          );
          if (ins.rowCount > 0) doneInc = 1;
        } else {
          const ins = await client.query(
            `
            INSERT INTO errors(job_id, url, fetched_at, http_status, error)
            VALUES($1,$2,$3,$4,$5)
            ON CONFLICT (job_id, url) DO NOTHING
            RETURNING id
            `,
            [jobId, url, fetchedAt, httpStatus, evt.error || "unknown_error"]
          );
          if (ins.rowCount > 0) failedInc = 1;
        }

        if (doneInc + failedInc > 0) {
          await client.query(
            `
            UPDATE jobs
            SET
              done = done + $2,
              failed = failed + $3,
              state = CASE
                WHEN (done + $2 + failed + $3) >= total THEN 'done'
                WHEN state = 'queued' AND ($2 + $3) > 0 THEN 'running'
                ELSE state
              END,
              updated_at = now()
            WHERE job_id = $1
            `,
            [jobId, doneInc, failedInc]
          );
        }

        await client.query("COMMIT");

        await consumer.commitOffsets([
          {
            topic,
            partition,
            offset: (BigInt(message.offset) + 1n).toString(),
          },
        ]);
      } catch (e) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error(
          { err: e, jobId, url },
          "sink processing failed (will retry via Kafka)"
        );
        // offset НЕ коммитим -> at-least-once
      } finally {
        client.release();
      }
    },
  });

  return consumer;
}

module.exports = { startResultsSink };
