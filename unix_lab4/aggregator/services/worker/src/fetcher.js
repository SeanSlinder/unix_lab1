const { request } = require("undici");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryableStatus(code) {
  return code === 429 || (code >= 500 && code <= 599);
}

function classifyError(e) {
  const msg = e && e.message ? String(e.message) : "unknown";
  if (
    msg.includes("timeout") ||
    msg.includes("ETIMEDOUT") ||
    msg.includes("UND_ERR_CONNECT_TIMEOUT")
  ) {
    return "timeout";
  }
  if (msg.includes("max_bytes_exceeded")) return "max_bytes_exceeded";
  if (msg.includes("robots_disallowed")) return "robots_disallowed";
  return "download_failed";
}

async function downloadHtml(url, { timeoutMs, maxBytes, userAgent }) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(new Error("timeout")), timeoutMs);

  try {
    const res = await request(url, {
      method: "GET",
      signal: ac.signal,
      maxRedirections: 5,
      headers: {
        "user-agent": userAgent || "news-aggregator-worker/1.0",
        accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    const statusCode = res.statusCode;
    const headers = res.headers || {};
    let bytes = 0;
    const chunks = [];

    for await (const chunk of res.body) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        ac.abort(new Error("max_bytes_exceeded"));
        throw new Error("max_bytes_exceeded");
      }
      chunks.push(chunk);
    }

    const html = Buffer.concat(chunks).toString("utf8");
    return { statusCode, headers, html };
  } finally {
    clearTimeout(t);
  }
}

async function fetchWithRetries(url, opts, maxAttempts, logger) {
  let lastErr = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await downloadHtml(url, opts);
      if (isRetryableStatus(res.statusCode) && attempt < maxAttempts - 1) {
        const backoff =
          300 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        logger.warn(
          { url, statusCode: res.statusCode, attempt, backoff },
          "retryable http status"
        );
        await sleep(backoff);
        continue;
      }
      return { ok: true, ...res };
    } catch (e) {
      lastErr = e;
      const kind = classifyError(e);
      const canRetry =
        (kind === "timeout" || kind === "download_failed") &&
        attempt < maxAttempts - 1;

      if (canRetry) {
        const backoff =
          300 * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
        logger.warn(
          { url, attempt, backoff, err: String(e) },
          "retrying fetch"
        );
        await sleep(backoff);
        continue;
      }
      return { ok: false, error: kind, exception: e };
    }
  }

  return { ok: false, error: classifyError(lastErr), exception: lastErr };
}

module.exports = { fetchWithRetries, classifyError };
