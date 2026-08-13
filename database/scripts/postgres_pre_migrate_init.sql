-- PostgreSQL pre-migration initialization
-- Safe to run multiple times (idempotent).

-- Requires psql variables:
--   db_name
--   db_user
--   db_user_password

-- 1) Create database owner role if they do not exist
SELECT format('CREATE ROLE %I LOGIN', :'db_user')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_roles WHERE rolname = :'db_user'
)\gexec

-- 2) Always set provided passwords on each run
ALTER ROLE :"db_user" PASSWORD :'db_user_password';

-- 3) Create database if missing
SELECT format('CREATE DATABASE %I OWNER %I', :'db_name', :'db_user')
WHERE NOT EXISTS (
  SELECT 1 FROM pg_database WHERE datname = :'db_name'
)\gexec

-- 4) Ensure expected owner even if DB already existed
ALTER DATABASE :"db_name" OWNER TO :"db_user";

\c :"db_name"

-- 5) Lock down defaults
REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;

-- 6) Allow roles to connect/use schema
GRANT CONNECT ON DATABASE :"db_name" TO :"db_user";
GRANT USAGE ON SCHEMA public TO :"db_user";