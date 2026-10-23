-- VerificaBR — schema inicial do MVP. Ver docs/ARCHITECTURE.md#modelo-de-dados-mvp.
-- Princípios aplicados no banco (não só na aplicação):
--   * vereditos, revisões, correções e logs são somente-inserção;
--   * o texto original de uma alegação nunca muda;
--   * toda mudança de status de alegação gera audit_log, com o ator da transação.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE claim_status AS ENUM ('draft','investigating','auditing','awaiting_review','returned','rejected','approved','published','suspended');
CREATE TYPE verdict AS ENUM ('true','false','partly_true','misleading','out_of_context','unverifiable');
CREATE TYPE robustness AS ENUM ('high','intermediate','insufficient');
CREATE TYPE risk_level AS ENUM ('low','intermediate','high');
CREATE TYPE stance AS ENUM ('supports','contradicts','context');
CREATE TYPE citation_check AS ENUM ('pending','ok','failed','unsupported');
CREATE TYPE actor_type AS ENUM ('human','agent','system');
CREATE TYPE review_decision AS ENUM ('approve','return','reject');
CREATE TYPE job_status AS ENUM ('queued','running','succeeded','failed');

-- Impede UPDATE/DELETE em tabelas somente-inserção.
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% é somente-inserção (% bloqueado)', TG_TABLE_NAME, TG_OP USING ERRCODE = 'insufficient_privilege';
END $$;

-- Ator corrente da transação, definido pela aplicação com set_config('app.actor_type'/'app.actor_id', ..., true).
CREATE FUNCTION current_actor_type() RETURNS actor_type LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system')::actor_type
$$;
CREATE FUNCTION current_actor_id() RETURNS text LANGUAGE sql STABLE AS $$
  SELECT COALESCE(NULLIF(current_setting('app.actor_id', true), ''), 'unknown')
$$;

CREATE TABLE audit_logs (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_type  actor_type NOT NULL,
  actor_id    text NOT NULL,
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   uuid,
  metadata    jsonb NOT NULL DEFAULT '{}',
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id, created_at);
CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE settings (
  id                                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  kill_switch                        boolean NOT NULL DEFAULT false,
  auto_publish_enabled               boolean NOT NULL DEFAULT false,
  max_cost_per_investigation_usd     numeric(10,4) NOT NULL DEFAULT 0 CHECK (max_cost_per_investigation_usd >= 0),
  monthly_budget_usd                 numeric(10,2) NOT NULL DEFAULT 0 CHECK (monthly_budget_usd >= 0),
  max_agent_rounds_per_investigation smallint NOT NULL DEFAULT 2 CHECK (max_agent_rounds_per_investigation BETWEEN 1 AND 5),
  updated_at                         timestamptz NOT NULL DEFAULT now()
);
INSERT INTO settings DEFAULT VALUES;

CREATE TABLE claims (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_text       text NOT NULL CHECK (length(original_text) BETWEEN 5 AND 5000),
  normalized_text     text,
  attributed_to       text NOT NULL,
  original_source_url text NOT NULL CHECK (original_source_url ~ '^https?://'),
  source_platform     text,
  stated_at           timestamptz,
  topic               text,
  claim_type          text,
  risk_level          risk_level NOT NULL DEFAULT 'low',
  risk_flags          text[] NOT NULL DEFAULT '{}',
  status              claim_status NOT NULL DEFAULT 'draft',
  created_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX claims_status_idx ON claims (status, updated_at DESC);

CREATE FUNCTION claims_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'alegações não são apagadas; use o status rejected' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.original_text IS DISTINCT FROM OLD.original_text THEN
    RAISE EXCEPTION 'original_text é imutável' USING ERRCODE = 'insufficient_privilege';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER claims_guard BEFORE UPDATE OR DELETE ON claims FOR EACH ROW EXECUTE FUNCTION claims_guard();

CREATE FUNCTION claims_audit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES (current_actor_type(), current_actor_id(), 'claim.created', 'claim', NEW.id, jsonb_build_object('status', NEW.status));
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES (current_actor_type(), current_actor_id(), 'claim.status_changed', 'claim', NEW.id,
            jsonb_build_object('from', OLD.status, 'to', NEW.status));
  ELSIF NEW.risk_level IS DISTINCT FROM OLD.risk_level THEN
    INSERT INTO audit_logs (actor_type, actor_id, action, entity_type, entity_id, metadata)
    VALUES (current_actor_type(), current_actor_id(), 'claim.risk_changed', 'claim', NEW.id,
            jsonb_build_object('from', OLD.risk_level, 'to', NEW.risk_level));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER claims_audit AFTER INSERT OR UPDATE ON claims FOR EACH ROW EXECUTE FUNCTION claims_audit();

CREATE TABLE sources (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url               text NOT NULL UNIQUE CHECK (url ~ '^https?://'),
  name              text,
  publisher         text,
  source_type       text,
  reliability_notes text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE investigations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            uuid NOT NULL REFERENCES claims(id),
  status              text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','aborted')),
  methodology_version text NOT NULL,
  summary             jsonb NOT NULL DEFAULT '{}',
  error_details       text,
  started_at          timestamptz NOT NULL DEFAULT now(),
  completed_at        timestamptz
);
CREATE INDEX investigations_claim_idx ON investigations (claim_id, started_at DESC);

CREATE TABLE agent_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  investigation_id  uuid NOT NULL REFERENCES investigations(id),
  role              text NOT NULL CHECK (role IN ('investigator','auditor')),
  provider          text NOT NULL,
  model             text NOT NULL,
  prompt_version    text NOT NULL,
  input             jsonb NOT NULL,
  output            jsonb,
  raw_text          text,
  input_tokens      integer NOT NULL DEFAULT 0,
  output_tokens     integer NOT NULL DEFAULT 0,
  web_searches      integer NOT NULL DEFAULT 0,
  cost_estimate_usd numeric(12,6) NOT NULL DEFAULT 0 CHECK (cost_estimate_usd >= 0),
  status            text NOT NULL CHECK (status IN ('succeeded','invalid_output','provider_error','skipped_budget')),
  error             text,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_runs_created_idx ON agent_runs (created_at);
CREATE TRIGGER agent_runs_immutable BEFORE UPDATE OR DELETE ON agent_runs FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE evidence (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id          uuid NOT NULL REFERENCES claims(id),
  source_id         uuid NOT NULL REFERENCES sources(id),
  excerpt           text NOT NULL,
  stance            stance NOT NULL,
  relevance_notes   text,
  limitations       text,
  publication_date  text,
  data_period       text,
  accessed_at       timestamptz NOT NULL DEFAULT now(),
  citation_check    citation_check NOT NULL DEFAULT 'pending',
  citation_detail   text,
  added_by_type     actor_type NOT NULL,
  added_by_run_id   uuid REFERENCES agent_runs(id),
  added_by          text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CHECK (added_by_type <> 'agent' OR added_by_run_id IS NOT NULL)
);
CREATE INDEX evidence_claim_idx ON evidence (claim_id);

CREATE TABLE verdict_versions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id         uuid NOT NULL REFERENCES claims(id),
  version          integer NOT NULL CHECK (version >= 1),
  investigation_id uuid REFERENCES investigations(id),
  verdict          verdict NOT NULL,
  robustness       robustness NOT NULL,
  summary          text NOT NULL,
  rationale        text NOT NULL,
  limitations      text[] NOT NULL DEFAULT '{}',
  evidence_ids     uuid[] NOT NULL DEFAULT '{}',
  methodology_version text NOT NULL,
  created_by_type  actor_type NOT NULL,
  created_by       text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (claim_id, version)
);
CREATE TRIGGER verdict_versions_immutable BEFORE UPDATE OR DELETE ON verdict_versions FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE reviews (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id           uuid NOT NULL REFERENCES claims(id),
  verdict_version_id uuid NOT NULL REFERENCES verdict_versions(id),
  reviewer_type      actor_type NOT NULL CHECK (reviewer_type = 'human'),
  reviewer           text NOT NULL,
  decision           review_decision NOT NULL,
  comments           text,
  reviewed_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reviews_version_idx ON reviews (verdict_version_id, reviewed_at DESC);
CREATE TRIGGER reviews_immutable BEFORE UPDATE OR DELETE ON reviews FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE posts (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id           uuid NOT NULL REFERENCES claims(id),
  verdict_version_id uuid NOT NULL REFERENCES verdict_versions(id),
  channel            text NOT NULL,
  caption            text,
  status             text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','failed','withdrawn')),
  published_at       timestamptz,
  external_id        text,
  external_url       text,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE corrections (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id            uuid NOT NULL REFERENCES claims(id),
  previous_version_id uuid NOT NULL REFERENCES verdict_versions(id),
  new_version_id      uuid NOT NULL REFERENCES verdict_versions(id),
  reason              text NOT NULL,
  public_explanation  text NOT NULL,
  created_by          text NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_version_id <> new_version_id)
);
CREATE TRIGGER corrections_immutable BEFORE UPDATE OR DELETE ON corrections FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type         text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}',
  status       job_status NOT NULL DEFAULT 'queued',
  attempts     smallint NOT NULL DEFAULT 0,
  max_attempts smallint NOT NULL DEFAULT 2 CHECK (max_attempts BETWEEN 1 AND 5),
  run_after    timestamptz NOT NULL DEFAULT now(),
  locked_at    timestamptz,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
CREATE INDEX jobs_queue_idx ON jobs (status, run_after, created_at);
