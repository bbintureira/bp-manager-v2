# BP Manager — Implementación del Design System "Midnight Blue"

## Contexto del proyecto

Estoy construyendo **BP Manager**, una webapp interna para una agencia que gestiona Brand Partners (BPs). Reemplaza una planilla de Excel ("Excel Pianel"). La usan 4 personas: admin, CEO, y 2 managers.

**Stack ya definido:**
- React + Vite
- Supabase (auth user/password + Postgres)
- Tailwind CSS
- shadcn/ui
- Recharts (con el wrapper oficial de shadcn: https://ui.shadcn.com/charts)
- TypeScript

**Modelo de datos:**
- Células → BPs → Proyectos → Horas mensuales
- Cada **Proyecto** tiene: precio/mes + horas requeridas/mes → calcula `$/hora proyecto`
- Cada **BP** tiene: sueldo/mes (según seniority) → calcula `$/hora BP`
- Cada **Asignación** compara `$/h proyecto` vs `$/h BP` → calcula si gana o pierde
- Vistas: rentabilidad por proyecto y por BP

**Arquitectura de navegación:**
- Dashboards (Proyectos, BPs) — aparecen primero
- Gestión (BPs, Proyectos, Asignaciones, Sueldos)

---

## Lo que necesito en este prompt

Implementar **el design system completo** y los **componentes UI base** del diseño "Midnight Blue" que ya validé. NO implementes lógica de negocio ni queries a Supabase todavía — eso viene después. El objetivo es que cuando arranque a construir features, ya tenga el sistema visual y los building blocks listos.

---

## Design System: tokens y configuración

### 1. Tailwind config + CSS variables

Configurar Tailwind para usar CSS variables (como hace shadcn). Soportar **dark mode con clase `.dark` en el `<html>`** y theme toggle persistente en `localStorage`.

**Paleta dark (default):**
```css
:root.dark {
  --bg-base: #0a0e1a;
  --bg-surface: #111726;
  --bg-elevated: #161e30;
  --bg-hover: #1c2538;
  --border: #1f2940;
  --border-strong: #2a3654;
  --text-primary: #e8ecf5;
  --text-secondary: #9aa3bd;
  --text-tertiary: #5d6582;
  --accent: #3b82f6;
  --accent-soft: rgba(59, 130, 246, 0.12);
  --accent-glow: rgba(59, 130, 246, 0.25);
  --success: #10b981;
  --success-soft: rgba(16, 185, 129, 0.12);
  --danger: #ef4444;
  --danger-soft: rgba(239, 68, 68, 0.12);
  --warning: #f59e0b;
  --warning-soft: rgba(245, 158, 11, 0.12);
}
```

**Paleta light:**
```css
:root {
  --bg-base: #f7f9fc;
  --bg-surface: #ffffff;
  --bg-elevated: #ffffff;
  --bg-hover: #f1f4f9;
  --border: #e4e8ef;
  --border-strong: #d0d6e0;
  --text-primary: #0a0e1a;
  --text-secondary: #4a5273;
  --text-tertiary: #8089a3;
  --accent: #2563eb;
  --accent-soft: rgba(37, 99, 235, 0.08);
  --accent-glow: rgba(37, 99, 235, 0.15);
  --success: #059669;
  --success-soft: rgba(5, 150, 105, 0.08);
  --danger: #dc2626;
  --danger-soft: rgba(220, 38, 38, 0.08);
  --warning: #d97706;
  --warning-soft: rgba(217, 119, 6, 0.08);
}
```

### 2. Tipografía

- **Sans (UI):** Geist
- **Mono (números, código, labels técnicos):** Geist Mono
- Cargar desde Google Fonts en `index.html`
- Configurar como `font-sans` y `font-mono` en `tailwind.config`
- Antialiasing activado globalmente

### 3. Tailwind theme tokens

Mapear las CSS variables a colores semánticos en Tailwind para que se puedan usar como `bg-surface`, `text-primary`, `border-border`, etc. Seguir el patrón de shadcn (https://ui.shadcn.com/docs/theming).

### 4. Reglas tipográficas globales

- Body: 14px / 1.5
- Números siempre con `font-feature-settings: "tnum"` (tabular nums) para que las columnas no bailen
- Titles: tracking ajustado (`-0.02em` aprox)

---

## Componentes a implementar

Crear en `src/components/ui/` (siguiendo convención shadcn). Si shadcn ya tiene el componente base, instalar via `npx shadcn add` y customizarlo para que matchee el diseño Midnight.

### Componentes shadcn a instalar
- `button`, `input`, `dialog`, `dropdown-menu`, `select`, `table`, `tabs`, `tooltip`, `toast`, `card`, `badge`, `skeleton`, `chart` (el wrapper de Recharts)

### Componentes custom

**1. `<KpiCard>`**
Card grande para métricas clave del dashboard.
- Props: `label` (string), `value` (string | number), `delta` (opcional: `{ value: string, direction: 'up' | 'down' }`), `meta` (opcional: string secundario)
- Visual: 
  - Padding 18px 20px, border-radius 10px
  - `bg-surface`, `border-border`
  - Label uppercase, 12px, `text-secondary`, letter-spacing 0.04em
  - Value 30px, font-weight 600, tracking -0.025em, mono variant disponible
  - Delta como badge inline (verde para up, rojo para down) con bg soft
  - Línea sutil arriba: `linear-gradient(90deg, transparent, var(--border-strong), transparent)`

**2. `<DataTable>`**
Tabla densa para listas (proyectos, BPs, asignaciones).
- Wrapper sobre `<Table>` de shadcn
- Header: 11px uppercase, tracking 0.05em, `text-tertiary`, fondo `bg-base`
- Filas: 12px padding, hover `bg-hover`, border-bottom `border`
- Soporte para columnas numéricas (alineadas derecha, font-mono, tnum)
- Soporte para celdas con badge, progress bar inline, color condicional (verde/rojo según signo)
- Filas clicables (cursor pointer)

**3. `<StatusBadge>`**
Badge con dot de color.
- Variantes: `active` (verde), `idle` (amarillo), `over` (rojo), `neutral` (gris)
- Dot circular 5px de currentColor, padding 2px 8px, font 11px

**4. `<UtilizationBar>`**
Barra de progreso inline con número.
- Props: `value` (0-110+), variant auto (verde si < 90, amarillo 90-100, rojo > 100)
- Track 5px, fill animado, número mono a la derecha 11px

**5. `<Sidebar>`**
Sidebar fijo izquierdo con navegación.
- Width 240px, `bg-surface`, border-right
- Logo arriba (mark cuadrado con gradient + texto)
- Secciones con label uppercase 11px (`Dashboards`, `Gestión`)
- Nav items: 8px 12px, border-radius 7px, icon 16px + label
- Active state: `bg-accent-soft` + `text-accent`
- Theme toggle abajo del todo

**6. `<Topbar>`**
Header sticky 56px.
- Breadcrumb a la izquierda
- Search inline (260px, con kbd `⌘K`)
- Icon buttons a la derecha (notificaciones, perfil)

**7. `<Section>`**
Container para grupos de contenido (chart, lista, tabla).
- `bg-surface`, `border-border`, border-radius 10px
- Header con título 14px font-semibold + tabs/actions a la derecha, padding 14px 20px, border-bottom

**8. `<ChartCard>`**
Wrapper para charts de Recharts usando `<ChartContainer>` de shadcn.
- Configurar para que use las CSS variables (`var(--accent)`, `var(--text-secondary)`, etc.)
- Defaults: gradient fill bajo la línea con `--accent` y opacidad 0.3 → 0
- Glow sutil en la línea principal: `filter: drop-shadow(0 0 8px var(--accent-glow))`
- Tooltips estilados con `bg-elevated` y `border-border`

**9. `<ThemeToggle>`**
Botón que alterna entre dark y light.
- Persistir en `localStorage` con key `bp-theme`
- Default: dark
- Aplicar la clase al `<html>` (no al body)
- Icono sol/luna que cambia

---

## Layout principal

Crear un `<AppLayout>` con:
```
┌─────────┬──────────────────────────────────┐
│         │  Topbar                          │
│ Sidebar ├──────────────────────────────────┤
│  240px  │                                  │
│         │  <main> con max-width 1400px     │
│         │  padding 32px                    │
└─────────┴──────────────────────────────────┘
```

Grid: `grid-cols-[240px_1fr] min-h-screen`.

---

## Página demo

Crear una página `src/pages/DashboardProyectos.tsx` que use TODOS los componentes anteriores con data **mockeada hardcoded** (no Supabase todavía). Debe replicar exactamente el dashboard de Proyectos del mockup que armé:

- Page header con título "Rentabilidad de proyectos" + subtítulo "Vista mensual · [mes actual]" + botón primary "Nuevo proyecto"
- Grid de 4 KpiCards: Ingresos, Costo BPs, Margen bruto, Horas idle
- Layout 2 columnas: a la izquierda chart de margen mensual (LineChart con area gradient), a la derecha lista "Top BPs por rentabilidad"
- DataTable abajo con proyectos activos: columnas Proyecto, BPs, Utilización (con bar), $/h proyecto, $/h BP, Margen, Estado

Esto sirve de "smoke test" del design system.

---

## Estructura de archivos esperada

```
src/
├── components/
│   ├── ui/              # shadcn + componentes custom
│   │   ├── button.tsx
│   │   ├── kpi-card.tsx
│   │   ├── data-table.tsx
│   │   ├── status-badge.tsx
│   │   ├── utilization-bar.tsx
│   │   ├── section.tsx
│   │   ├── chart-card.tsx
│   │   ├── theme-toggle.tsx
│   │   └── ...
│   └── layout/
│       ├── app-layout.tsx
│       ├── sidebar.tsx
│       └── topbar.tsx
├── pages/
│   └── DashboardProyectos.tsx
├── lib/
│   ├── utils.ts         # cn helper de shadcn
│   └── format.ts        # formatters $, %, h con locale es-AR
├── styles/
│   └── globals.css      # CSS variables + base styles
├── App.tsx
└── main.tsx
```

---

## Reglas de código

- **TypeScript estricto.** Tipar todos los props y data shapes.
- **Comentarios en inglés** (incluso si el contenido visible está en español).
- **Formatters en `lib/format.ts`:** `formatCurrency()` con locale `es-AR` (separador miles `.`, decimales `,`), `formatPercent()`, `formatHours()`. Usar `Intl.NumberFormat`.
- **No hardcodear colores** en componentes — siempre via Tailwind tokens que mapean a CSS variables.
- **Accesibilidad básica:** roles ARIA en sidebar nav, focus rings visibles, labels en inputs.
- **Responsive:** asumir desktop primero (uso interno), pero que no se rompa en pantallas chicas.

---

## Lo que NO hace falta hacer ahora

- Conexión con Supabase (viene en el siguiente prompt)
- Auth / login
- Routing con react-router (mockear con un solo Layout + DashboardProyectos por ahora)
- CRUD real de proyectos/BPs

---

## Output esperado

Al final debería poder correr `npm run dev` y ver el dashboard de Proyectos exactamente como en el mockup HTML, con toggle dark/light funcionando. Esto es el cimiento sobre el que voy a ir agregando features.
