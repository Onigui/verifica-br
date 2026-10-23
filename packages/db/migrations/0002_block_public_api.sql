-- Bloqueia o acesso às tabelas pela API automática do Supabase (PostgREST, papéis anon/authenticated).
-- O VerificaBR acessa o banco só pelo servidor (conexão direta), nunca pelo navegador.
--   * RLS ligado em todas as tabelas, sem políticas = nenhuma linha visível via API;
--   * privilégios dos papéis da API revogados (defesa em profundidade).
-- Em Postgres sem esses papéis (local, CI), a parte de REVOKE é ignorada.

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM authenticated;
  END IF;
END $$;

-- Funções com search_path fixo (recomendação de segurança do Supabase).
ALTER FUNCTION forbid_mutation() SET search_path = public, pg_temp;
ALTER FUNCTION current_actor_type() SET search_path = public, pg_temp;
ALTER FUNCTION current_actor_id() SET search_path = public, pg_temp;
ALTER FUNCTION claims_guard() SET search_path = public, pg_temp;
ALTER FUNCTION claims_audit() SET search_path = public, pg_temp;
