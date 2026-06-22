# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Contexto del proyecto

App web interna de **Project Reset SA/LLC** para gestionar la asignación de horas
de Brand Partners (BPs) y el análisis financiero del equipo. Reemplaza el viejo
Excel de P&L ("Pianel"). Equipo chico: Franco (manager), Victoria (CEO),
Candelaria (Head of Ops). Bautista es admin/owner y único desarrollador.

## Stack & commands

React 18 + Vite + TypeScript + Tailwind 3 + Supabase. Auth via Supabase Auth, persistence via `@supabase/supabase-js`. Charts via `recharts`. Toast via `sonner`. Dialogs via `@radix-ui/react-dialog`.

```
npm run dev      # vite dev server on http://localhost:5173
npm run build    # tsc -b && vite build (full typecheck + production bundle)
npm run preview  # serve dist/
npm run lint     # eslint . --ext ts,tsx --max-warnings 0
```

`.env.local` must define `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. `.env.example` has the shape. The Supabase client (`src/lib/supabase.ts`) throws on import if either is missing.

`_design/01-midnight.html` is the visual ground truth for the dashboard ("Midnight Blue" design system). When tweaking visuals, diff against it.

## Architecture

### Routing & providers

`src/App.tsx` is the only place that wires routes and global providers. The order matters:

```
BrowserRouter → AuthProvider → SearchProvider → Routes + Toaster
```

`SearchProvider` lives at App level (not inside `AppLayout`) because pages call `useSearch()` *before* they render `AppLayout` as a child. Putting the provider in the layout would mean the hook runs above its provider.

Routes use literal accented Spanish paths (`/gestión/asignaciones`, `/gestión/sueldos`). Browsers display them URL-encoded (`%C3%B3n`); React Router matches the decoded form so `<NavLink to="/gestión/...">` works as expected.

### Auth model

Two tables on the Supabase side:
- `auth.users` (Supabase Auth) — stores credentials + email.
- `usuarios` (custom) — profile data: `id, email, nombre, created_at`.

`AuthContext` (`src/contexts/AuthContext.tsx`) authenticates via `supabase.auth.signInWithPassword`, then fetches the `usuarios` row by **email** (NOT by id; we don't assume `usuarios.id` is FK-tied to `auth.users.id`). The Supabase session is the source of truth; we mirror `user.id` into `bp-userId` localStorage as a convenience cache. `bp-supabase-auth` is the storage key for the session itself.

`ProtectedRoute` redirects to `/login` when no user, preserving the destination in `location.state.from`. The login page reads it back to redirect after a successful login.

### Theming

CSS variables drive everything. `:root` is the light palette, `:root.dark` is dark. Default = dark. The toggle persists in `bp-theme` localStorage, and `index.html` has an inline script that reads it and applies `.dark` to `<html>` *before* React mounts to avoid FOUC.

Tailwind tokens map directly to CSS vars **without the HSL wrap pattern**. Don't use `hsl(var(--token) / <alpha-value>)` — the source vars are hex/rgba, that pattern emits invalid CSS. The mapping is `colors: { surface: 'var(--bg-surface)', accent: { DEFAULT: 'var(--accent)', soft: 'var(--accent-soft)' }, … }`. So `bg-surface`, `text-primary`, `border-border`, `bg-accent-soft`, `text-success` etc. all work.

The Sonner `Toaster` (`src/components/ui/toaster.tsx`) watches `<html>` class via `MutationObserver` so toasts re-theme on toggle.

### Data layer

Two files, sharply separated:

**`src/lib/queries.ts`** — every Supabase call lives here. Conventions:
- Row types: `Proyecto`, `BrandPartner`, `Asignacion`, `Sueldo`, `ProyectoHonorarioMensual`. IDs are `string | number` (`type Id`); always compare via `String(a) === String(b)` because tables may use uuid or bigint.
- All read helpers log via `logQueryError` and return `[]` / `null` on error. They **never throw**. Pages call these freely without try/catch.
- Mutations return a discriminated union `CreateResult<T> = {success: true, data} | {success: false, error}` (and `DeleteResult` for deletes). Pages surface `error` in a toast.
- `getDashboardSnapshot(mes)` and `getAnnualSnapshot()` parallelize the 4 base fetches. Pages prefer these over composing individual helpers.
- Bulk upserts depend on UNIQUE constraints — if a constraint is missing, the call returns `{success: false}` with a clear Postgres message. See "Schema invariants" below.

**`src/lib/calculations.ts`** — pure functions over the row types. No DB calls. Imports types from queries.ts (one-way). `HOURS_PER_MONTH = 160` is the canonical constant. Key shapes: `ProjectMonthSummary`, `ProjectAnnualSummary`, `BPMonthSummary`, `BPAnnualSummary`, `ProjectBPBreakdown` (per-BP-on-project with margin fields), `BPProjectBreakdown` (per-project-for-BP).

Two private helpers used everywhere: `same(a, b) = String(a) === String(b)` and `num(v)` (coerce-or-zero, never NaN).

### Pages & layout

Each page returns `<AppLayout breadcrumb={…} topbarActions={…}>{...}</AppLayout>`. `AppLayout` renders `<Sidebar />` (sticky 100vh) + `<Topbar />` + a `<main>` slot. Don't pass `activeNav` — `<Sidebar>` derives the active nav item from `useLocation()` via `<NavLink>`.

`topbarActions` is the slot for page-specific controls (`MonthPicker`, `ViewToggle`, `Select` for filters, project selector, etc.). The topbar's own search input is wired into `SearchContext` — pages call `useSearch()` and `matchesQuery()` from `@/hooks/useSearch` to filter their tables.

Layout is full-width: `AppLayout` has no `max-w` cap on the content area. Tables get `w-full` + horizontal scroll for wide grids (e.g. annual views with 12 month columns + actions = ~18 columns).

### Component conventions

- **`DataTable<T>`** (`src/components/ui/data-table.tsx`) — `column.key` is the React key (any unique string within the columns array). `column.accessor: keyof T` is the optional value reader. If `render` is provided, you can omit `accessor` — handy for derived/computed cells. Don't reuse `key` across columns; the previous "use field name as key" pattern caused duplicate-key warnings.
- **`Section`** wraps card-style content with optional title/tabs/actions header. `flush` removes the inner padding (use it when the child is itself a table or list).
- **`KpiCard`**, **`StatusBadge`**, **`UtilizationBar`**, **`MonthPicker`**, **`ViewToggle`** are the design-system primitives. Reuse before introducing new ones.
- **Dialogs** (`src/components/dialogs/`) follow a consistent pattern: controlled `open`/`onOpenChange`, prefilled state via `useEffect`, dirty tracking against an `initial*` snapshot, async `onConfirm`/save with a Loader2 + disabled-while-submitting. `ConfirmDialog` is generic with a `destructive` prop for delete flows.
- **Loading states**: `KpiSkeletonGrid`, `TableSkeleton`, `ListSkeleton`, `EmptyState`, `ErrorBanner` are in `src/components/ui/loading-states.tsx`. Don't roll your own.

## Schema invariants & gotchas

**The DB schema is real — not all of it matches the type definitions cleanly.** Verified facts (probe via `curl https://$PROJECT.supabase.co/rest/v1/<table>?select=*&limit=1` with the anon key):

- **No `año` column anywhere.** `mes` is `int 1-12` only. "Vista anual" means "all months on file aggregated", not "year X". `previousMonth(mes)` wraps `1 → 12`. When wiring year support, add a column and thread it through queries.
- **`proyectos`** real columns: `id, nombre, tipo, honorarios_cotizador, fecha_inicio, fecha_renovacion, status, descripcion, categoria_bp, created_at`. The `Proyecto` type uses `description` (mismatch — the column is `descripcion`); reads silently return undefined. Forms don't currently write description.
- **`horas_contratadas`** real columns: `(id, bp_id, mes, horas, created_at)` — **per-BP, NOT per-project**. There is NO `proyecto_id`, NO `honorarios_cotizador`. Earlier code that tried to seed it from `createProyecto` with `proyecto_id` was always failing silently. Don't reintroduce that pattern.
- **`proyecto_honorarios_mensuales`** is the table for per-month project honorarios: `(id, proyecto_id, mes, honorarios, created_at)`. `createProyecto` seeds 12 rows on insert (defaulting all months to the project's scalar `honorarios_cotizador`). The scalar is left untouched after subsequent edits — keep this in mind if a future view needs to read "current honorarios": prefer `proyecto_honorarios_mensuales` over `proyectos.honorarios_cotizador` when per-month accuracy matters.

**Required UNIQUE constraints (for `upsert(... { onConflict })` calls)**:
- `sueldos (bp_id, mes)` — used by `updateBPSueldosFullYear`, `createSueldo` w/ allMonths.
- `asignaciones (proyecto_id, bp_id, mes)` — used by `updateAsignacionFullYear`.
- `proyecto_honorarios_mensuales (proyecto_id, mes)` — used by `updateProjectHonorarioFullYear`.

If any is missing, the first upsert returns a clear Postgres error in the toast (`there is no unique or exclusion constraint matching the ON CONFLICT specification`). Add the constraint; don't change to fetch-then-decide patterns unless there's a structural reason.

**Cascade deletes**: `deleteProyecto` and `deleteBrandPartner` rely on `ON DELETE CASCADE` foreign keys to clean up dependents. If they're missing, the delete returns an FK violation in the toast.

## Margin math

Two interpretations of "project margin" coexist intentionally. Both build on two
per-hour rates that use the new capacity fields, falling back to the legacy `160`
(`HOURS_PER_MONTH`) **only when the field is `null`**:

- `rate_proyecto = honorarios[mes] / proyecto.horas_requeridas_mensual` — the
  per-month variant (`valorHoraProyectoForMonth`) prefers the
  `proyecto_honorarios_mensuales` / `horas_proyecto` rows, then the scalar, then `160`.
- `rate_bp = sueldo[mes] / bp.capacidad_horas_mensual` (`valorHoraBPForMonth`).

1. **Per-hour margin** (used in monthly project rows): `(rate_proyecto - rate_bp_avg) / rate_proyecto × 100`, where `rate_bp_avg` is the mean of `rate_bp` over the BPs assigned that month. Quick to scan, ties cleanly to the `$/h proyecto` and `$/h BP prom.` columns.
2. **Absolute margin** (used in BP-on-project breakdown): `(ingresos - costos) / ingresos × 100`, where ingresos = `Σ horas[mes] × rate_proyecto[mes]` and costos = `Σ horas[mes] × rate_bp[mes]`. Captures month-by-month sueldo variation.

`calculateProjectMargin` computes cost **per-asignación** (`Σ horas[mes] × rate_bp[mes]`) — only the cost of the hours actually worked on the project, not the BP's full sueldo. A BP split across projects is therefore **not** double-counted: summing a BP's `cost` across its projects stays ≤ its full sueldo (= it when total hours = capacity).

## Other notes

- IDs in row keys: always `String(row.id)` to handle uuid + bigint uniformly.
- `AsignacionesPage` is project-centric: a topbar `<Select>` picks the project; the body shows a 12-month editable grid for its BPs. Adding a BP locally just appends to in-memory state with 12 zeros — only on Save does it upsert (and all-zero new BPs are skipped to avoid noise rows).
- The `ProjectHonorarioFullYearModal` (reachable via the "coins" icon in annual view) and the honorarios section inside `EditProjectDialog` are functionally overlapping. Both write to `proyecto_honorarios_mensuales`. Keep them in sync if you change one.
- Search query persists across navigation (provider sits at App level). If you need per-page reset, watch `useLocation().pathname` and clear inside `SearchProvider`.

## Reglas de lógica de negocio (NO romper)

- **Vista anual:** solo sumar/mostrar meses donde hay al menos un BP asignado.
  Nunca proyectar hacia meses futuros vacíos, nunca anualizar los 12 meses si el
  BP arrancó a mitad de año.
- **`fecha_ingreso` del BP:** los cálculos anuales solo cuentan desde el mes de
  ingreso en adelante. BPs inactivos se capean al último mes con sueldo cargado.
- **Filtro de mes:** las listas de proyectos y BPs en vista mensual solo muestran
  entries con datos para ESE mes específico.

## Workflow de deploy

1. Verificar en localhost: `npm run dev` + ⌘+Shift+R
2. `git add . && git commit -m "..." && git push`
3. Vercel auto-deploya desde GitHub en ~30s → `bp-manager-v2.vercel.app`
   (repo `bbintureira/bp-manager-v2`).

## Convenciones de trabajo

- **Código comentado en inglés**, siempre (aunque el pedido venga en español).
- Comunicación con el usuario: español rioplatense (voseo), directa y concisa.
- **MVP-first** para features. EXCEPCIÓN: la seguridad de datos sensibles del
  equipo no es MVP-first — ahí se va con cuidado.

## Estado actual — Seguridad (EN PAUSA DELIBERADA)

Trabajo de seguridad pausado a propósito. Retomar solo con foco, nunca cansado.

- **RLS (Row Level Security):** el Security Advisor de Supabase marcó todas las
  tablas con RLS deshabilitado. Hoy la app usa la anon key sin sesión
  autenticada → si se habilita RLS ahora, la app se ve vacía.
- **Camino elegido (Opción A):** reactivar Google OAuth + políticas
  authenticated-only. Es la única opción arquitectónicamente correcta.
- **Orden estricto y obligatorio:**
  1. Reactivar y testear el login end-to-end completo.
  2. Recién después aplicar políticas RLS, una vez confirmado que las sesiones
     autenticadas funcionan.
- **Blocker crítico:** la tabla `allowed_emails` (allowlist) devuelve 404.
  Investigar esto ANTES de reactivar OAuth, o el login se puede romper entero.
- **Nota clave:** RLS nunca borra datos, solo controla acceso. El estado actual
  (sin RLS, anon key expuesta en el frontend) ES el riesgo real.
- **Contexto OAuth:** dos proyectos de Google Cloud — "Horas BPs"
  (`admin@projectreset.co`) y "bp-manager". Redirect URI de Supabase:
  `https://wkannvjtzycyyquhnncv.supabase.co/auth/v1/callback`. Email de admin
  vía `VITE_ADMIN_EMAIL`.

## En el horizonte

- Completar RLS después de que OAuth esté estable y testeado.
- Campo `horas_reales` junto a `horas_cotizadas` en Asignaciones, con métrica de
  "desvío de horas".
- Riesgo de pausa del free tier de Supabase tras inactividad: mantener actividad
  o considerar upgrade.

---
> Nota: no metas claves/secrets reales en este archivo (se commitea al repo).
> Los valores sensibles van en `.env` / variables de entorno de Vercel.
