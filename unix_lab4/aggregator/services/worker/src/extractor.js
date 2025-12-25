const { JSDOM } = require("jsdom");
const { Readability } = require("@mozilla/readability");

function pickMeta(doc, names) {
  for (const n of names) {
    const el =
      doc.querySelector(`meta[property="${n}"]`) ||
      doc.querySelector(`meta[name="${n}"]`);
    if (el && el.getAttribute("content"))
      return el.getAttribute("content").trim();
  }
  return null;
}

function pickCanonical(doc) {
  const link = doc.querySelector('link[rel="canonical"]');
  const href = link && link.getAttribute("href");
  return href ? href.trim() : null;
}

function parseKeywords(doc) {
  const kw = pickMeta(doc, ["keywords", "news_keywords"]);
  if (!kw) return [];
  return kw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 30);
}

function parsePublishedAt(doc) {
  const cand = pickMeta(doc, [
    "article:published_time",
    "og:published_time",
    "pubdate",
    "publishdate",
    "timestamp",
    "date",
    "dc.date",
    "dc.date.issued",
  ]);
  if (!cand) return null;
  const d = new Date(cand);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}

function parseLanguage(doc) {
  const htmlLang =
    doc.documentElement && doc.documentElement.getAttribute("lang");
  if (htmlLang) return htmlLang.trim();
  const og = pickMeta(doc, ["og:locale", "content-language"]);
  return og ? og.trim() : null;
}

function stripWhitespace(s) {
  return String(s || "")
    .replace(/\s+/g, " ")
    .trim();
}

let extractusMod = null;
async function tryExtractus(url, html) {
  try {
    if (!extractusMod) {
      extractusMod = await import("@extractus/article-extractor");
    }
    const extract =
      extractusMod.extract ||
      extractusMod.default?.extract ||
      extractusMod.default;
    if (typeof extract !== "function") return null;

    // Многие версии поддерживают html как опцию. Если нет — упадёт в catch.
    const article = await extract(url, { html });
    if (!article) return null;

    return {
      title: article.title || null,
      author: article.author || null,
      text: article.content
        ? stripWhitespace(article.content)
        : article.text || null,
      published_at: article.published
        ? new Date(article.published).toISOString()
        : null,
      language: article.lang || null,
      tags: Array.isArray(article.tags) ? article.tags : [],
    };
  } catch {
    return null;
  }
}

async function extractArticle(url, html) {
  // 1) extractus (best-effort)
  const ext = await tryExtractus(url, html);

  // 2) fallback Readability
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;

  const readability = new Readability(doc);
  const parsed = readability.parse();

  const canonical = pickCanonical(doc);
  const metaAuthor = pickMeta(doc, ["author", "article:author", "dc.creator"]);
  const metaTitle = pickMeta(doc, ["og:title", "twitter:title"]);
  const metaLang = parseLanguage(doc);
  const metaPublished = parsePublishedAt(doc);
  const metaTags = parseKeywords(doc);

  const title = ext?.title || parsed?.title || metaTitle || null;
  const author = ext?.author || parsed?.byline || metaAuthor || null;
  const language = ext?.language || parsed?.lang || metaLang || null;

  const text =
    ext?.text ||
    (parsed?.textContent ? stripWhitespace(parsed.textContent) : null) ||
    null;

  const published_at = ext?.published_at || metaPublished || null;
  const tags = (ext?.tags && ext.tags.length ? ext.tags : metaTags) || [];

  return {
    title,
    author,
    language,
    text,
    tags,
    canonical_url: canonical,
  };
}

module.exports = { extractArticle };
