-- =====================================================================
-- Migration: add fecha_ingreso to brand_partners (2026-05-12)
-- Run in Supabase SQL editor.
-- =====================================================================

-- Annual aggregations need to know when each BP joined the team so a BP
-- that started in March doesn't get charged Jan + Feb capacity.
alter table brand_partners
  add column if not exists fecha_ingreso date default '2026-01-01';

-- Existing rows pick up the default automatically. NULLs are treated as
-- Jan 2026 in app code, but for consistency backfill anything that came
-- in as NULL on older rows.
update brand_partners
   set fecha_ingreso = '2026-01-01'
 where fecha_ingreso is null;
