-- =====================================================================
-- Migration: per-month required hours for projects (2026-05-12)
-- Run in Supabase SQL editor BEFORE deploying.
-- =====================================================================

create table if not exists horas_proyecto (
  id uuid primary key default gen_random_uuid(),
  proyecto_id uuid not null references proyectos(id) on delete cascade,
  mes integer not null check (mes between 1 and 12),
  horas numeric(8, 2) not null default 0,
  created_at timestamp with time zone default now(),
  unique(proyecto_id, mes)
);

alter table horas_proyecto enable row level security;

-- App-wide policy: open access (matches the convention for other tables).
drop policy if exists "Allow all on horas_proyecto" on horas_proyecto;
create policy "Allow all on horas_proyecto" on horas_proyecto
  for all using (true) with check (true);
