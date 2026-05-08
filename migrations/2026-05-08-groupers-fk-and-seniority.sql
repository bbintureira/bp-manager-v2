-- =====================================================================
-- Migration: groupers FK + seniority backfill (2026-05-08)
-- Run in Supabase SQL editor (one block).
-- =====================================================================

-- 1) Groupers: switch from free-text `brand_partners.grouper` to a
--    real FK on `brand_partners.grouper_id` -> `groupers.id`. This way
--    renaming a grouper propagates to every BP that references it.

-- 1.a Add the column (nullable; deleting a grouper unsets it).
alter table brand_partners
  add column if not exists grouper_id uuid
  references groupers(id) on delete set null;

-- 1.b Backfill: for every distinct legacy `grouper` string on a BP,
--     find or create a row in `groupers` and link the BP to it.
do $$
declare
  r record;
  gid uuid;
begin
  for r in
    select distinct grouper
    from brand_partners
    where grouper is not null
      and length(trim(grouper)) > 0
  loop
    select id into gid from groupers where nombre = r.grouper;
    if gid is null then
      insert into groupers (nombre) values (r.grouper) returning id into gid;
    end if;
    update brand_partners
      set grouper_id = gid
      where grouper = r.grouper;
  end loop;
end$$;

-- 1.c Drop the old free-text column.
alter table brand_partners drop column if exists grouper;

-- =====================================================================

-- 2) Seniority backfill: rewrite `brand_partners.seniority` so legacy
--    rows match the new Junior / Semi Sr / Sr / Super Sr ranges. Uses
--    the BP's scalar `sueldo_mensual` (which app code keeps mirrored
--    to the avg of the 12-month grid). Rows without a sueldo are left
--    untouched and will display "—" until a sueldo is loaded.

update brand_partners
   set seniority = case
     when sueldo_mensual is null or sueldo_mensual <= 0 then seniority
     when sueldo_mensual >= 4600000 then 'Super Sr'
     when sueldo_mensual >= 3900000 then 'Sr'
     when sueldo_mensual >= 2700000 then 'Semi Sr'
     else 'Junior'
   end;
