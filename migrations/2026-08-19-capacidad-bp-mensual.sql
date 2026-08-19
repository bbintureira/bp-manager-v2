-- =====================================================================
-- Migration: capacidad (horas contratadas) por BP y por mes (2026-08-19)
-- Run in Supabase SQL editor (one block).
--
-- ESTADO: APLICADO el 2026-08-19 sobre el proyecto de producción, antes de
--   pushear el código que lo lee. Se corrió el paso 4 (backfill, 168 filas =
--   14 BPs x 12 meses) vía PostgREST. Los pasos 1-3 resultaron innecesarios:
--   el UNIQUE(bp_id, mes) YA existía y no había duplicados ni meses inválidos.
--   Queda acá completo e idempotente para poder reproducirlo o correrlo en
--   otro entorno.
--
-- ⚠ ORDEN OBLIGATORIO: correr ESTE SQL **ANTES** de deployar el código
--   que lo lee. La tabla `horas_contratadas` ya existía con filas viejas
--   y parciales (cargadas el 2026-04-28) que NO coinciden con el escalar
--   `brand_partners.capacidad_horas_mensual`:
--
--     Micaela Bianchi     escalar 40  → filas viejas 80 en los 12 meses
--     Bernardita Roggiero escalar 160 → fila vieja 80 en el mes 2
--
--   Si el código nuevo sale a producción antes de este SQL, esas filas
--   pasan a ser la fuente de verdad y la capacidad de Micaela se duplica
--   de un día para el otro. El paso 3 las pisa con el escalar, que es lo
--   que la app muestra hoy.
-- =====================================================================

-- 1) La tabla es por-BP: (id, bp_id, mes, horas). Nos aseguramos de que
--    `mes` sea válido antes de indexar.
delete from horas_contratadas
where mes is null or mes < 1 or mes > 12;

-- 2) Deduplicar (bp_id, mes) antes de crear el UNIQUE: nos quedamos con
--    la fila más reciente de cada par.
delete from horas_contratadas a
using horas_contratadas b
where a.bp_id = b.bp_id
  and a.mes = b.mes
  and (a.created_at, a.id) < (b.created_at, b.id);

-- 3) UNIQUE(bp_id, mes) — requisito de los upserts
--    (`updateBPCapacidadFullYear` usa onConflict: 'bp_id,mes').
--    Condicional: en producción ya existía con otro nombre, y un
--    `drop if exists` por nombre fijo no lo habría encontrado — el `add`
--    posterior habría creado un segundo índice único redundante.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'horas_contratadas'
      and c.contype = 'u'
      and (
        select array_agg(a.attname order by a.attname)
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
      ) = array['bp_id', 'mes']
  ) then
    alter table horas_contratadas
      add constraint horas_contratadas_bp_id_mes_key unique (bp_id, mes);
  end if;
end $$;

-- 4) Backfill: 12 filas por BP con el valor escalar de hoy. Pisa las
--    filas viejas a propósito (ver la advertencia de arriba) para que el
--    comportamiento post-deploy sea IDÉNTICO al actual hasta que alguien
--    edite un mes puntual desde la UI.
insert into horas_contratadas (bp_id, mes, horas)
select
  bp.id,
  m.mes,
  coalesce(nullif(bp.capacidad_horas_mensual, 0), 160)
from brand_partners bp
cross join generate_series(1, 12) as m(mes)
on conflict (bp_id, mes) do update
  set horas = excluded.horas;

-- 5) Verificación: 12 filas por BP y ningún desvío contra el escalar.
--    Ambas queries tienen que volver vacías.
select bp.nombre, count(hc.*) as filas
from brand_partners bp
left join horas_contratadas hc on hc.bp_id = bp.id
group by bp.nombre
having count(hc.*) <> 12;

select bp.nombre, hc.mes, hc.horas, bp.capacidad_horas_mensual
from horas_contratadas hc
join brand_partners bp on bp.id = hc.bp_id
where hc.horas <> coalesce(nullif(bp.capacidad_horas_mensual, 0), 160);
