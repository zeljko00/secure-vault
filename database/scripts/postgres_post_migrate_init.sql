-- PostgreSQL post-migration initialization.
-- Safe to run multiple times (idempotent).

-- Requires psql variables:
--   db_name
--   db_user
--   db_user_password

-- 1) Create runtime role if missing.
SELECT format('CREATE ROLE %I LOGIN', :'db_user')
WHERE NOT EXISTS (
	SELECT 1 FROM pg_roles WHERE rolname = :'db_user'
)\gexec

-- 2) Reset previous grants for this role.
REVOKE ALL PRIVILEGES ON DATABASE :"db_name" FROM :"db_user";
REVOKE ALL PRIVILEGES ON SCHEMA public FROM :"db_user";
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"db_user";
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"db_user";

-- 3) Set/rotate runtime db_user_password every run.
ALTER ROLE :"db_user" PASSWORD :'db_user_password';

-- 4) Base privileges.
GRANT CONNECT ON DATABASE :"db_name" TO :"db_user";
GRANT USAGE ON SCHEMA public TO :"db_user";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"db_user";

-- 5) Grant permissions per table
-- Django metadata tables required at app startup.
SELECT format('GRANT SELECT ON TABLE public.django_migrations TO %I', :'db_user')
WHERE to_regclass('public.django_migrations') IS NOT NULL\gexec

SELECT format('GRANT SELECT ON TABLE public.django_content_type TO %I', :'db_user')
WHERE to_regclass('public.django_content_type') IS NOT NULL\gexec

-- 6) Per-table privileges only when table exists.
SELECT format('GRANT SELECT, INSERT, UPDATE ON TABLE public.users_user TO %I', :'db_user')
WHERE to_regclass('public.users_user') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users_refreshtoken TO %I', :'db_user')
WHERE to_regclass('public.users_refreshtoken') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users_team TO %I', :'db_user')
WHERE to_regclass('public.users_team') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users_user_teams TO %I', :'db_user')
WHERE to_regclass('public.users_user_teams') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_secrets_secret TO %I', :'db_user')
WHERE to_regclass('public.user_secrets_secret') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_secrets_sharedsecret TO %I', :'db_user')
WHERE to_regclass('public.user_secrets_sharedsecret') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT ON TABLE public.users_userdeactivationlog TO %I', :'db_user')
WHERE to_regclass('public.users_userdeactivationlog') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT ON TABLE public.user_secrets_auditlog TO %I', :'db_user')
WHERE to_regclass('public.user_secrets_auditlog') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE ON TABLE public.user_secrets_auditledgerstate TO %I', :'db_user')
WHERE to_regclass('public.user_secrets_auditledgerstate') IS NOT NULL\gexec

SELECT format('GRANT SELECT, INSERT, UPDATE ON TABLE public.settings_setting TO %I', :'db_user')
WHERE to_regclass('public.settings_setting') IS NOT NULL\gexec

INSERT INTO public.settings_setting (key, value)
SELECT seed.key, seed.value
FROM (
	VALUES
		('user_password_min_length', '12'),
		('master_password_length', '16'),
		('secret_rotation_days', '90'),
		('jwt_ttl_minutes', '10'),
		('session_ttl_minutes', '30'),
		('hidden_endpoint_enabled', 'false')
) AS seed(key, value)
WHERE to_regclass('public.settings_setting') IS NOT NULL
ON CONFLICT (key) DO NOTHING;
