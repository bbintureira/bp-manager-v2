# Midnight Blue — Design System

Sistema de diseño completo de **BP Manager**. Copiar este documento es suficiente para reproducir la apariencia y el comportamiento visual de la app en HTML estático (Tailwind 3) sin necesidad de leer el código fuente.

---

## 1. Filosofía

- **Light por defecto, dark opt-in.** Tema oscuro se activa con la clase `dark` en `<html>`. Sin FOUC: aplicar la clase con un script inline antes de pintar.
- **Tokens vía CSS variables.** Todos los colores, sombras y radios son CSS vars en `:root` / `:root.dark`. Tailwind solo los expone con nombres legibles.
- **Sin `hsl(var(--token) / <alpha-value>)`.** Los tokens son hex/rgba directos. La sintaxis HSL de shadcn rompe esto.
- **Tipografía Geist + Geist Mono.** Cargadas desde Google Fonts con `display=block` (evita el "pop" de fuente).
- **Densidad media-alta.** Filas de tabla `py-4`, KPI cards `px-5 pt-[18px] pb-5`, no hay padding lujoso.
- **Foco siempre visible.** Anillo accent de 2px + offset de 2px (`:focus-visible`).
- **Transiciones cortas.** 150ms `ease-out` para color/hover; 300ms para barras de progreso.

---

## 2. Tokens (CSS variables)

Declarar exactamente esto en `:root` (y la versión `dark` en `:root.dark`).

### Light (`:root`, default)
```css
:root {
  --bg-base:        #f7f9fc;
  --bg-surface:     #ffffff;
  --bg-elevated:    #ffffff;
  --bg-hover:       #f1f4f9;
  --border:         #e4e8ef;
  --border-strong:  #d0d6e0;
  --text-primary:   #0a0e1a;
  --text-secondary: #4a5273;
  --text-tertiary:  #8089a3;
  --accent:         #2563eb;
  --accent-soft:    rgba(37, 99, 235, 0.08);
  --accent-glow:    rgba(37, 99, 235, 0.15);
  --success:        #059669;
  --success-soft:   rgba(5, 150, 105, 0.08);
  --danger:         #dc2626;
  --danger-soft:    rgba(220, 38, 38, 0.08);
  --warning:        #d97706;
  --warning-soft:   rgba(217, 119, 6, 0.08);
}
```

### Dark (`:root.dark`)
```css
:root.dark {
  --bg-base:        #0a0e1a;
  --bg-surface:     #111726;
  --bg-elevated:    #161e30;
  --bg-hover:       #1c2538;
  --border:         #1f2940;
  --border-strong:  #2a3654;
  --text-primary:   #e8ecf5;
  --text-secondary: #9aa3bd;
  --text-tertiary:  #5d6582;
  --accent:         #3b82f6;
  --accent-soft:    rgba(59, 130, 246, 0.12);
  --accent-glow:    rgba(59, 130, 246, 0.25);
  --success:        #10b981;
  --success-soft:   rgba(16, 185, 129, 0.12);
  --danger:         #ef4444;
  --danger-soft:    rgba(239, 68, 68, 0.12);
  --warning:        #f59e0b;
  --warning-soft:   rgba(245, 158, 11, 0.12);
}
```

### Semántica por superficie

| Token            | Uso                                                                    |
| ---------------- | ---------------------------------------------------------------------- |
| `bg-base`        | Fondo de la app, `<html>`, `<body>`, table head, headers de modales.   |
| `bg-surface`     | Cards, sidebar, topbar, dialog content, KPI cards.                     |
| `bg-elevated`    | Tooltip de chart, `<option>` de selects.                               |
| `bg-hover`       | Estado hover de filas/buttons; track del `UtilizationBar`.             |
| `border`         | Hairlines y bordes default.                                            |
| `border-strong`  | Footer de tablas (totales) y gradiente del top de `KpiCard`.           |
| `text-primary`   | Texto principal (90–95% de los casos).                                 |
| `text-secondary` | Labels de form, descripciones, sub-textos.                             |
| `text-tertiary`  | Placeholders, hints, meta info, breadcrumbs.                           |
| `accent`         | CTA primario, links, foco, valor activo en nav.                        |
| `accent-soft`    | Fondo de nav-link activo, fondo de avatar.                             |
| `success`        | Margen positivo, status "Activo", delta ↑.                             |
| `danger`         | Eliminar, status "Sobreasignado", delta ↓.                             |
| `warning`        | Status "Idle"/"Baja utilización".                                      |

---

## 3. Tailwind config (mapping)

Sin el wrap `hsl(var(...))`. Directo a la variable.

```ts
// tailwind.config.ts (extracto relevante)
{
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Geist', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
        mono: ['"Geist Mono"', 'ui-monospace', '"Cascadia Code"', '"Source Code Pro"', 'Menlo', 'Consolas', 'monospace'],
      },
      colors: {
        base: 'var(--bg-base)',
        surface: 'var(--bg-surface)',
        elevated: 'var(--bg-elevated)',
        hover: 'var(--bg-hover)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        primary: 'var(--text-primary)',
        secondary: 'var(--text-secondary)',
        tertiary: 'var(--text-tertiary)',
        accent:  { DEFAULT: 'var(--accent)',  soft: 'var(--accent-soft)',  glow: 'var(--accent-glow)' },
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        danger:  { DEFAULT: 'var(--danger)',  soft: 'var(--danger-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
      },
      fontSize: {
        '2xs': ['11px', '14px'],   // labels uppercase + meta info
        md:    ['16px', '24px'],   // slot intermedio que Tailwind no trae
      },
      letterSpacing: {
        title:  '-0.02em',   // headings h1-h4
        snug:   '-0.01em',   // títulos de section/dialog
        tight:  '-0.025em',  // números grandes de KPI
        wider:  '0.04em',    // labels uppercase (Field, KPI label)
        widest: '0.08em',    // section labels del sidebar
      },
      borderRadius: {
        sm:      '5px',
        DEFAULT: '7px',
        md:      '7px',
        lg:      '10px',
        xl:      '12px',
      },
      boxShadow: {
        'btn-primary': '0 1px 0 rgba(255,255,255,0.1) inset, 0 0 0 1px var(--accent), 0 4px 14px var(--accent-glow)',
        'glow-accent': '0 0 20px var(--accent-glow)',
      },
    },
  },
}
```

---

## 4. CSS base

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  *, *::before, *::after { box-sizing: border-box; }

  html {
    font-size: 16px;                /* lock root rem unit */
    background: var(--bg-base);
    color: var(--text-primary);
  }

  body {
    @apply font-sans bg-base text-primary;
    font-size: 16px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    transition: background-color 0.15s ease, color 0.15s ease;
  }

  /* Tabular-nums automáticos en cualquier número */
  .mono, .font-mono, .tabular-nums, table, input[type='number'] {
    font-feature-settings: 'tnum';
  }

  h1, h2, h3, h4 { letter-spacing: -0.02em; }

  /* Foco visible solo con teclado */
  :focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
    border-radius: 4px;
  }
}
```

---

## 5. `index.html` (Geist + bootstrap de tema)

```html
<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BP Manager</title>

    <!-- Geist -->
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=block"
      rel="stylesheet"
    />

    <!-- Tema antes de pintar (anti-FOUC). Light por default. -->
    <script>
      (function () {
        try {
          var saved = localStorage.getItem('bp-theme');
          var theme = saved === 'dark' ? 'dark' : 'light';
          if (theme === 'dark') document.documentElement.classList.add('dark');
        } catch (e) {}
      })();
    </script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

---

## 6. Tipografía

| Slot                       | Clases Tailwind                                                | Notas                                  |
| -------------------------- | -------------------------------------------------------------- | -------------------------------------- |
| Page title (h1)            | `text-3xl font-semibold tracking-title`                        | 30px, line-height 36px.                |
| Section title              | `text-lg font-semibold tracking-snug`                          | 18px.                                  |
| Dialog title               | `text-lg font-semibold tracking-snug`                          | Idem.                                  |
| Body                       | `text-sm` (default) o `text-base`                              | 14 / 16px.                             |
| Labels de form/KPI         | `text-2xs font-medium uppercase tracking-wider text-secondary` | 11px. Spread 0.04em.                   |
| Meta info / hints          | `text-2xs text-tertiary`                                       | 11px gris claro.                       |
| Números grandes (KPI)      | `font-semibold leading-[1.1] tracking-tight tabular-nums`      | Tamaño fluido `clamp(20px,1.6vw+6px,36px)`. |
| Números en celdas          | `font-mono tabular-nums text-right`                            | Geist Mono.                            |
| Section labels del sidebar | `text-2xs font-medium uppercase text-tertiary tracking-widest` | Spread 0.08em.                         |

---

## 7. Spacing / sizing canónicos

| Elemento                         | Tamaño                                                |
| -------------------------------- | ----------------------------------------------------- |
| Sidebar (colapsado)              | `w-12` (48px)                                         |
| Sidebar (expandido)              | `w-60` (240px). Transición `transition-[width] 150ms ease-out`. |
| Topbar                           | `h-16 px-6` (64px alto), `sticky top-0 z-10`          |
| Page padding (main content)      | `p-8` (32px)                                          |
| PageHeader bottom margin         | `mb-7`                                                |
| Card / Section interior          | `p-5` (header `px-5 py-3.5`)                          |
| KPI card interior                | `px-5 pt-[18px] pb-5`                                 |
| Dialog content                   | `max-w-[480px]`, header `px-6 pt-6 pr-12`, body `px-6 py-5`, footer `px-6 pb-6 pt-2` |
| Input / Select / Button (md)     | `h-10` (40px)                                         |
| Button sm                        | `h-9` (36px)                                          |
| Button lg                        | `h-12` (48px)                                         |
| Filas de tabla                   | `px-5 py-4`                                           |
| Cabezal de tabla                 | `px-5 py-2.5`                                         |

---

## 8. Componentes

### 8.1 Button

5 variantes × 4 tamaños. Implementadas con CVA, pero el resultado HTML es directo:

```html
<!-- Primary (md) -->
<button class="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium transition-colors h-10 px-4 bg-accent text-white shadow-btn-primary hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-base disabled:pointer-events-none disabled:opacity-50">
  Guardar
</button>

<!-- Secondary -->
<button class="... h-10 px-4 bg-surface border border-border text-primary hover:bg-hover">Cancelar</button>

<!-- Ghost -->
<button class="... h-10 px-4 text-secondary hover:text-primary hover:bg-hover">Más opciones</button>

<!-- Outline -->
<button class="... h-10 px-4 border border-border bg-transparent text-primary hover:bg-hover">Filtrar</button>

<!-- Danger -->
<button class="... h-10 px-4 bg-danger text-white hover:brightness-110 active:brightness-95">Eliminar</button>
```

Tamaños:
- `sm`: `h-9 px-3 text-xs`
- `md`: `h-10 px-4 text-sm` (default)
- `lg`: `h-12 px-5 text-base`
- `icon`: `h-10 w-10 p-0`

Notas:
- Primary lleva `shadow-btn-primary` — un ring accent + glow. **No** usar `border` en primary.
- Iconos dentro del button: `w-3.5 h-3.5` (14px). Gap automático del `gap-1.5` del wrapper.

### 8.2 Input

```html
<input
  type="text"
  class="flex h-10 w-full rounded-md border border-border bg-base px-3 py-2 text-sm text-primary placeholder:text-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
/>
```

- `bg-base` (no surface) — los inputs son más oscuros que la card que los contiene en dark, y más claros en light.
- Foco: ring `accent/50` (50% alpha) + border accent.
- `type="number"`: hace `select()` en focus en la app (al implementar en JS si replicás).

### 8.3 Select (nativo estilado)

```html
<div class="relative inline-flex items-center rounded-md border border-border bg-base text-sm text-primary hover:bg-hover transition-colors focus-within:ring-2 focus-within:ring-accent/50 focus-within:border-accent">
  <select class="appearance-none bg-transparent pl-3 pr-8 py-1.5 text-sm text-primary outline-none cursor-pointer font-medium">
    <option class="bg-elevated text-primary">Enero</option>
    ...
  </select>
  <!-- Chevron overlay -->
  <svg aria-hidden class="absolute right-2 w-3.5 h-3.5 text-tertiary pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
</div>
```

### 8.4 Field (label + input)

```html
<div class="flex flex-col gap-1.5">
  <label for="x" class="text-2xs font-medium uppercase tracking-wider text-secondary">
    Honorarios <span class="text-danger ml-1">*</span>
  </label>
  <input id="x" class="..." />
  <span class="text-2xs text-tertiary">Sin IVA, en USD.</span>
  <!-- o, si hay error: -->
  <!-- <span class="text-2xs text-danger">Requerido</span> -->
</div>
```

### 8.5 KpiCard

```html
<div class="relative overflow-hidden bg-surface border border-border rounded-lg px-5 pt-[18px] pb-5">
  <!-- Hairline gradient en top -->
  <span aria-hidden class="absolute inset-x-0 top-0 h-px"
        style="background: linear-gradient(90deg, transparent, var(--border-strong), transparent);"></span>

  <div class="text-xs font-medium uppercase tracking-wider text-secondary mb-2.5">
    Ingresos del mes
  </div>

  <div title="$252.553.853"
       class="font-semibold leading-[1.1] tracking-tight tabular-nums mb-1.5 text-[clamp(20px,_1.6vw_+_6px,_36px)] truncate">
    $252,5M
  </div>

  <div class="flex items-center gap-2 text-xs">
    <span class="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-sm font-medium tabular-nums bg-success-soft text-success">
      <span aria-hidden>↑</span>12,4%
    </span>
    <span class="text-tertiary">vs mes anterior</span>
  </div>
</div>
```

- Valor compacto + `title` con el valor completo es el patrón canónico.
- Delta down usa `bg-danger-soft text-danger` y `↓`.

### 8.6 StatusBadge

```html
<!-- active -->
<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium bg-success-soft text-success">
  <span aria-hidden class="inline-block w-[5px] h-[5px] rounded-full bg-current"></span>
  Activo
</span>

<!-- idle  -> bg-warning-soft text-warning -->
<!-- over  -> bg-danger-soft  text-danger  -->
<!-- neutral -> bg-hover text-secondary    -->
```

Dot interno de 5px con `bg-current` para heredar el color del foreground.

### 8.7 UtilizationBar

```html
<div class="inline-flex items-center gap-2 align-middle" style="width: 120px;">
  <div class="flex-1 h-[5px] bg-hover rounded-sm overflow-hidden">
    <!-- Color: bg-accent (<90%), bg-warning (90-100%), bg-danger (>100%) -->
    <div class="h-full rounded-sm transition-[width] duration-300 bg-accent" style="width: 78%;"></div>
  </div>
  <span class="font-mono text-2xs text-secondary tabular-nums w-9 text-right">78%</span>
</div>
```

### 8.8 Section (card con header)

```html
<section class="w-full bg-surface border border-border rounded-lg overflow-hidden">
  <header class="flex items-center justify-between px-5 py-3.5 border-b border-border">
    <h2 class="text-lg font-semibold tracking-snug">Proyectos activos</h2>
    <div class="flex items-center gap-2">
      <!-- tabs / actions -->
      <button class="text-xs px-2.5 py-1 rounded bg-hover text-primary">Todos</button>
      <button class="text-xs px-2.5 py-1 rounded text-tertiary hover:text-primary">Mensual</button>
    </div>
  </header>
  <div class="p-5">
    <!-- contenido -->
  </div>
</section>
```

- Variante `flush`: omite el wrapper `<div class="p-5">` cuando el child es una tabla o lista que ya maneja su propio padding.

### 8.9 DataTable

```html
<div class="w-full overflow-x-auto">
  <table class="w-full text-xl table-auto">
    <thead class="bg-base border-b border-border">
      <tr>
        <th class="px-5 py-2.5 text-left text-2xs font-medium uppercase tracking-wider text-tertiary">Proyecto</th>
        <th class="px-5 py-2.5 text-right text-2xs font-medium uppercase tracking-wider text-tertiary">Ingresos</th>
        <!-- ... -->
      </tr>
    </thead>
    <tbody>
      <tr class="border-b border-border hover:bg-hover transition-colors">
        <td class="px-5 py-4 text-sm">Mostly Lit</td>
        <td class="px-5 py-4 text-sm font-mono tabular-nums text-right">$42.500</td>
      </tr>
      <!-- ... -->
    </tbody>
    <tfoot class="border-t-2 border-border-strong font-semibold bg-base">
      <tr>
        <td class="px-5 py-4 text-sm">Total</td>
        <td class="px-5 py-4 text-sm font-mono tabular-nums text-right">$420.000</td>
      </tr>
    </tfoot>
  </table>
</div>
```

- Columnas numéricas: `font-mono tabular-nums text-right`.
- Filas clicables: agregar `cursor-pointer`. Hover ya está incluido.
- El header NO usa `bg-surface` (el surface es el wrapper Section). Usa `bg-base` para que se diferencie sutilmente.

### 8.10 Dialog (Radix + Tailwind)

Estructura HTML equivalente:

```html
<!-- Overlay -->
<div class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0"></div>

<!-- Content -->
<div class="fixed left-1/2 top-1/2 z-50 -translate-x-1/2 -translate-y-1/2 w-full max-w-[480px] bg-surface border border-border rounded-lg shadow-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95">
  <header class="px-6 pt-6 pr-12 flex flex-col gap-1">
    <h2 class="text-lg font-semibold tracking-snug">Editar proyecto</h2>
    <p class="text-sm text-secondary">Modificá los datos y guardá.</p>
  </header>
  <div class="px-6 py-5 flex flex-col gap-4">
    <!-- Fields -->
  </div>
  <footer class="px-6 pb-6 pt-2 flex items-center justify-end gap-2">
    <button class="...secondary">Cancelar</button>
    <button class="...primary">Guardar</button>
  </footer>
  <!-- Close X -->
  <button aria-label="Cerrar" class="absolute right-4 top-4 w-8 h-8 grid place-items-center rounded-md text-tertiary hover:text-primary hover:bg-hover">×</button>
</div>
```

- `max-w-[480px]` por default. Dialogs anchos (formularios grandes) usan `max-w-[720px]` o `max-w-[920px]`.
- El `<header>` lleva `pr-12` para no chocar con el botón de cerrar.

### 8.11 Loading / empty / error

```html
<!-- KPI skeleton (mismo footprint del KpiCard) -->
<div class="bg-surface border border-border rounded-lg px-5 pt-[18px] pb-5 flex flex-col gap-3">
  <div class="h-3 w-28 bg-hover rounded animate-pulse"></div>
  <div class="h-8 w-32 bg-hover rounded animate-pulse"></div>
  <div class="h-3 w-20 bg-hover rounded animate-pulse"></div>
</div>

<!-- Empty state (inline en Section) -->
<div class="grid place-items-center px-5 py-10 text-sm text-tertiary text-center">
  Sin datos para mostrar.
</div>

<!-- Error banner (encima de la sección) -->
<div role="alert" class="flex items-center gap-2 mb-5 px-4 py-3 rounded-md bg-danger-soft text-danger text-sm">
  <svg class="w-4 h-4 shrink-0"><!-- alert-circle --></svg>
  <span>No se pudo cargar la información.</span>
</div>
```

### 8.12 ViewToggle (pill de 2 botones)

```html
<div role="tablist" class="inline-flex p-0.5 rounded-md border border-border bg-base text-sm">
  <button role="tab" aria-selected="true"
          class="px-3 py-1 rounded text-2xs font-medium uppercase tracking-wider transition-colors bg-surface text-primary shadow-sm">
    Mes
  </button>
  <button role="tab" aria-selected="false"
          class="px-3 py-1 rounded text-2xs font-medium uppercase tracking-wider transition-colors text-tertiary hover:text-primary">
    Anual
  </button>
</div>
```

### 8.13 MonthPicker

Igual que Select, pero opciones fijas (Enero–Diciembre). Ver §8.3.

---

## 9. Layout

### 9.1 AppLayout (esqueleto)

```html
<div class="min-h-screen flex bg-base text-primary">
  <!-- Sidebar -->
  <aside class="sticky top-0 h-screen w-60 transition-[width] duration-150 ease-out bg-surface border-r border-border flex flex-col overflow-hidden">
    <!-- contenido sidebar (§9.2) -->
  </aside>

  <!-- Main column -->
  <div class="flex-1 min-w-0 flex flex-col">
    <!-- Topbar (§9.3) -->
    <header class="sticky top-0 z-10 h-16 px-6 flex items-center gap-4 bg-surface border-b border-border">
      ...
    </header>

    <!-- Content -->
    <main class="flex-1 p-8">
      <!-- PageHeader + contenido -->
    </main>
  </div>
</div>
```

Cuando el sidebar colapsa: `w-12` (48px). Persistir el estado en `localStorage` con la key `bp-sidebar-collapsed`.

### 9.2 Sidebar

```html
<aside class="sticky top-0 h-screen w-60 bg-surface border-r border-border flex flex-col overflow-hidden">
  <div class="flex-1 min-h-0 overflow-y-auto px-2 py-3 flex flex-col gap-1">

    <!-- Brand -->
    <div class="flex items-center justify-between mb-2 px-2 py-2">
      <div class="flex items-center gap-2.5 min-w-0">
        <div aria-hidden class="grid place-items-center w-7 h-7 rounded-md text-white font-bold text-sm shadow-glow-accent shrink-0"
             style="background: linear-gradient(135deg, var(--accent), #1e40af);">B</div>
        <span class="font-semibold text-md tracking-snug truncate">BP Manager</span>
      </div>
      <button class="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors">
        <!-- panel-left-close icon -->
      </button>
    </div>

    <!-- Section -->
    <div class="mt-3 first:mt-0">
      <div class="text-2xs font-medium uppercase text-tertiary tracking-widest px-3 pb-1 pt-2">Dashboards</div>
      <ul class="flex flex-col gap-0.5">
        <li>
          <!-- Active -->
          <a class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors bg-accent-soft text-accent">
            <svg class="w-4 h-4"></svg><span class="truncate">Proyectos</span>
          </a>
        </li>
        <li>
          <!-- Inactive -->
          <a class="w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-sm font-medium transition-colors text-secondary hover:text-primary hover:bg-hover">
            <svg class="w-4 h-4"></svg><span class="truncate">Brand Partners</span>
          </a>
        </li>
      </ul>
    </div>
  </div>

  <!-- Footer (theme toggle + user) -->
  <div class="shrink-0 border-t border-border bg-surface flex flex-col gap-1 px-3 py-3">
    <!-- ThemeToggle -->
    <!-- UserCard: avatar accent-soft + nombre + logout icon -->
    <div class="flex items-center gap-2 px-2 pt-1">
      <div aria-hidden class="grid place-items-center w-7 h-7 rounded-full bg-accent-soft text-accent text-2xs font-semibold shrink-0">B</div>
      <div class="flex flex-col min-w-0 flex-1">
        <span class="text-sm font-medium truncate">Bautista</span>
        <span class="text-2xs text-tertiary truncate">bb@example.com</span>
      </div>
      <button class="grid place-items-center w-7 h-7 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors shrink-0">
        <!-- log-out icon w-3.5 h-3.5 -->
      </button>
    </div>
  </div>
</aside>
```

Reglas:
- Nav-link **activo**: `bg-accent-soft text-accent`. Inactivo: `text-secondary hover:text-primary hover:bg-hover`.
- Sección label: `text-2xs uppercase tracking-widest text-tertiary`.
- Logo mark: cuadrado `w-7 h-7` con gradient `linear-gradient(135deg, var(--accent), #1e40af)` y `shadow-glow-accent`.

### 9.3 Topbar

```html
<header class="sticky top-0 z-10 h-16 px-6 flex items-center gap-4 bg-surface border-b border-border">
  <!-- Breadcrumb / título corto -->
  <div class="flex items-center gap-2 text-sm text-tertiary">
    <span>Dashboards</span><span>/</span><span class="text-primary">Proyectos</span>
  </div>

  <!-- Search (~260px) -->
  <div class="relative ml-4 w-[260px]">
    <input class="h-9 w-full rounded-md border border-border bg-base pl-9 pr-12 text-sm placeholder:text-tertiary focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent"
           placeholder="Buscar..." />
    <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tertiary"><!-- search --></svg>
    <kbd class="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-tertiary border border-border rounded px-1.5 py-0.5 bg-base">⌘K</kbd>
  </div>

  <!-- Spacer + topbar actions slot -->
  <div class="flex-1"></div>
  <div class="flex items-center gap-2">
    <!-- MonthPicker, ViewToggle, etc. -->
  </div>

  <!-- Bell -->
  <button class="grid place-items-center w-8 h-8 rounded-md text-tertiary hover:text-primary hover:bg-hover transition-colors">
    <svg class="w-4 h-4"><!-- bell --></svg>
  </button>
</header>
```

### 9.4 PageHeader

```html
<header class="mb-7 flex items-end justify-between gap-4">
  <div>
    <h1 class="text-3xl font-semibold tracking-title">Dashboard Proyectos</h1>
    <p class="text-base text-secondary mt-1">Estado financiero de los proyectos activos.</p>
  </div>
  <div class="flex items-center gap-2">
    <!-- Buttons primarios/secundarios -->
  </div>
</header>
```

---

## 10. Patrones de interacción

| Patrón                 | Regla                                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------- |
| Foco con teclado       | `2px solid var(--accent)` + `outline-offset: 2px`. Solo en `:focus-visible`.                  |
| Foco en inputs         | `focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:border-accent`.              |
| Hover en filas         | `hover:bg-hover transition-colors`. Sin scale ni shadow.                                       |
| Hover en nav inactivo  | `hover:text-primary hover:bg-hover`.                                                           |
| Hover en primary btn   | `hover:brightness-110 active:brightness-95`. **No** cambia el background.                      |
| Transición global      | `transition-colors` (≈150ms). Width/height en barras: `transition-[width] duration-300`.       |
| Disabled               | `disabled:opacity-50 disabled:pointer-events-none`.                                            |
| Loading en buttons     | Mantener el button, reemplazar el icono por `Loader2 animate-spin w-3.5 h-3.5`. No cambiar label. |
| Empty state inline     | Usar `EmptyState` (texto centrado `text-tertiary` con `py-10`), no un placeholder grande.       |
| Toast (Sonner)         | Posición top-right. `success` verde, `error` rojo. Re-tematiza con el `<html>.dark` toggle.   |

---

## 11. Charts (Recharts)

- Wrapper: `<div class="p-5 pb-4">` + `<div style="height: 220px; filter: drop-shadow(0 0 8px var(--accent-glow))">`. Glow opcional, default ON.
- Tooltips con este style object:

```js
{
  backgroundColor: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 7,
  fontSize: 12,
  color: 'var(--text-primary)',
  boxShadow: '0 4px 14px rgba(0,0,0,0.15)',
}
```

- Líneas / áreas: usar `stroke="var(--accent)"`, `fill="var(--accent-soft)"`. Cambian con el tema automáticamente.

---

## 12. Iconografía

- Librería: **lucide-react** (o `lucide` para HTML estático).
- Tamaños:
  - Inline en buttons: `w-3.5 h-3.5` (14px).
  - Nav del sidebar: `w-4 h-4` (16px).
  - Acciones de topbar: `w-4 h-4`.
- Stroke-width default (2). No tintar — heredan `currentColor`.

---

## 13. Checklist para replicar un HTML nuevo

1. `<html>` arranca sin clase (light). Inline script lee `bp-theme` y aplica `dark` si corresponde.
2. Cargar Geist + Geist Mono con `display=block`.
3. Declarar las dos paletas de tokens (§2) en CSS.
4. Configurar Tailwind con el mapping de §3 (sin `hsl(var(...))`).
5. Aplicar las reglas `@layer base` de §4 (font-size 16px, antialiased, focus ring).
6. Construir la página con `AppLayout` (§9.1): sidebar `w-60` + main con topbar `h-16` + content `p-8`.
7. Para todo elemento: empezar por la variante de color del token (`bg-surface`, `text-primary`, `border-border`) — **nunca** hex hardcoded.
8. Números siempre con `font-mono tabular-nums`. Labels uppercase con `text-2xs tracking-wider`.
9. Botón primario usa `shadow-btn-primary` y **no** `border`. Botón secundario usa `border-border` y `bg-surface`.
10. Cards = `bg-surface border border-border rounded-lg`. KPI cards extra: hairline gradient en top + `pt-[18px]`.
11. Foco siempre visible: confiar en `:focus-visible` global + `focus-visible:ring-...` en form fields.
12. Toggle de tema: agregar/quitar `dark` en `<html>` y persistir en `localStorage('bp-theme')`. El resto se reactualiza solo via CSS vars.

Si algo se ve "fuera de lugar", el sospechoso más probable es: (a) usaste un hex en vez de un token, (b) pusiste el surface incorrecto (`bg-base` vs `bg-surface`), o (c) te olvidaste de `tabular-nums` en una columna numérica.
