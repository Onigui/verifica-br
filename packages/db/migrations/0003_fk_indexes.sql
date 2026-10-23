-- Índices para chaves estrangeiras usadas nas consultas do painel e do worker
-- (sugestão do verificador de performance do Supabase).
CREATE INDEX IF NOT EXISTS agent_runs_investigation_idx ON agent_runs (investigation_id);
CREATE INDEX IF NOT EXISTS corrections_claim_idx ON corrections (claim_id);
CREATE INDEX IF NOT EXISTS evidence_source_idx ON evidence (source_id);
CREATE INDEX IF NOT EXISTS evidence_run_idx ON evidence (added_by_run_id);
CREATE INDEX IF NOT EXISTS posts_claim_idx ON posts (claim_id);
CREATE INDEX IF NOT EXISTS posts_version_idx ON posts (verdict_version_id);
CREATE INDEX IF NOT EXISTS reviews_claim_idx ON reviews (claim_id);
CREATE INDEX IF NOT EXISTS verdict_versions_investigation_idx ON verdict_versions (investigation_id);
CREATE INDEX IF NOT EXISTS corrections_previous_version_idx ON corrections (previous_version_id);
CREATE INDEX IF NOT EXISTS corrections_new_version_idx ON corrections (new_version_id);
