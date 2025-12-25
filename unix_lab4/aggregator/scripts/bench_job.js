#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function submitJob(apiBase, n) {
  const file = path.join(__dirname, "seed_urls.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let urls = data.urls;

  if (n && Number.isFinite(n) && n > 0) {
    const out = [];
    for (let i = 0; i < n; i++) out.push(urls[i % urls.length]);
    urls = out;
  }

  const body = {
    urls,
    timeout_ms: 8000,
    respect_robots: false,
    max_bytes: 2000000,
  };

  const res = await fetch(`${apiBase}/jobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok)
    throw new Error(`submit failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function getJob(apiBase, jobId) {
  const res = await fetch(`${apiBase}/jobs/${jobId}`);
  if (!res.ok)
    throw new Error(`get job failed: ${res.status} ${await res.text()}`);
  return res.json();
}

async function main() {
  const apiBase = process.env.API_BASE || "http://localhost:8080";
  const args = process.argv.slice(2);
  const nIdx = args.indexOf("--n");
  const n = nIdx >= 0 ? Number(args[nIdx + 1]) : 250;

  console.log(`[bench] submitting job with n=${n} urls...`);
  const { job_id, queued } = await submitJob(apiBase, n);
  console.log(`[bench] job_id=${job_id} queued=${queued}`);

  const started = Date.now();
  let last = null;

  while (true) {
    const j = await getJob(apiBase, job_id);
    last = j;
    process.stdout.write(
      `\r[bench] state=${j.state} done=${j.done} failed=${j.failed} total=${j.total}      `
    );
    if (j.state === "done") break;
    await sleep(1000);
  }

  const elapsedSec = (Date.now() - started) / 1000;
  const processed = (last.done || 0) + (last.failed || 0);
  const pps = processed / elapsedSec;

  console.log("\n");
  console.log(`[bench] finished in ${elapsedSec.toFixed(2)}s`);
  console.log(`[bench] processed=${processed} pages/sec=${pps.toFixed(2)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
