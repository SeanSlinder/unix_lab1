const robotsParser = require("robots-parser");
const { request } = require("undici");

class RobotsCache {
  constructor({ userAgent = "*" } = {}) {
    this.userAgent = userAgent;
    this.cache = new Map(); // origin -> robots instance (или null)
  }

  async allowed(urlObj, timeoutMs = 4000) {
    const origin = urlObj.origin;
    let robots = this.cache.get(origin);
    if (robots === undefined) {
      robots = await this._fetchRobots(origin, timeoutMs);
      this.cache.set(origin, robots);
    }
    if (!robots) return true;
    return robots.isAllowed(urlObj.href, this.userAgent);
  }

  async _fetchRobots(origin, timeoutMs) {
    const robotsUrl = `${origin}/robots.txt`;
    const ac = new AbortController();
    const t = setTimeout(
      () => ac.abort(new Error("robots_timeout")),
      timeoutMs
    );

    try {
      const res = await request(robotsUrl, {
        method: "GET",
        signal: ac.signal,
        maxRedirections: 3,
        headers: { "user-agent": "news-aggregator-worker/1.0" },
      });

      if (res.statusCode >= 400) return null;

      let text = "";
      for await (const chunk of res.body) text += chunk.toString("utf8");
      return robotsParser(robotsUrl, text);
    } catch {
      return null; // fail-open
    } finally {
      clearTimeout(t);
    }
  }
}

module.exports = { RobotsCache };
