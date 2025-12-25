#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");

async function main() {
  const args = process.argv.slice(2);
  const apiBase = process.env.API_BASE || "http://localhost:8080";

  const nIdx = args.indexOf("--n");
  const n = nIdx >= 0 ? Number(args[nIdx + 1]) : null;

  const file = path.join(__dirname, "seed_urls.json");
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  let urls = data.urls;

  if (n && Number.isFinite(n) && n > 0) {
    // если нужно больше, чем есть — повторяем циклически (для демо нагрузочного теста)
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

  if (!res.ok) {
    const text = await res.text();
    console.error("Request failed:", res.status, text);
    process.exit(1);
  }

  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
