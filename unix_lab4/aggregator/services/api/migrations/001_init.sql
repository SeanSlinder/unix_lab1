CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  job_id UUID PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total INT NOT NULL,
  done INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  state TEXT NOT NULL CHECK (state IN ('queued','running','done'))
);

CREATE TABLE IF NOT EXISTS articles (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  canonical_url TEXT,
  title TEXT,
  published_at TIMESTAMPTZ,
  author TEXT,
  language TEXT,
  text TEXT,
  tags JSONB,
  fetched_at TIMESTAMPTZ NOT NULL,
  http_status INT
);

CREATE TABLE IF NOT EXISTS errors (
  id BIGSERIAL PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(job_id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL,
  http_status INT,
  error TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_articles_job_url ON articles(job_id, url);
CREATE UNIQUE INDEX IF NOT EXISTS uq_errors_job_url ON errors(job_id, url);
CREATE INDEX IF NOT EXISTS idx_articles_job_id ON articles(job_id);
CREATE INDEX IF NOT EXISTS idx_errors_job_id ON errors(job_id);
