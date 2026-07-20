-- Project categorization (Victoria, "BPs Hs. Ociosas" notes 2026-07-17).
--
-- Splits the overloaded `proyectos.tipo` concept into THREE additive
-- dimensions. `tipo` itself is left untouched (kept as internal logic to
-- know why a project ended). The existing unused `categoria_bp` column is
-- NOT what this is — do not touch it.
--
-- All three columns are nullable, no default: existing projects stay NULL
-- and are backfilled by hand (Vicky / Flor). No data migration here.
--
-- Allowed values (enforced in the app, not the DB, to keep this reversible):
--   tipo_cliente   : 'Nuevo cliente' | 'Upselling'
--   tipo_proyecto  : 'Brand Boost' | 'Brand Building' | 'Brand Growth'
--                    | 'Brand Reset' | 'Producciones'
--   tipo_contrato  : 'Fee mensual' | 'Fee total'
--
-- Run this in the Supabase SQL editor BEFORE loading the updated app.

ALTER TABLE proyectos
  ADD COLUMN tipo_cliente  text,
  ADD COLUMN tipo_proyecto text,
  ADD COLUMN tipo_contrato text;
