# BP Manager — cambios del 19/08/2026

**PR:** https://github.com/bbintureira/bp-manager-v2/pull/1
**Rama:** `feat/export-endpoint-y-vistas` (3 commits, `main` quedó intacta)

> Este archivo está sin trackear y no entra en el PR. Movelo o borralo cuando
> no te sirva más. **A propósito no contiene el `EXPORT_TOKEN`**: si quedara
> acá, un `git add -A` distraído lo commitea. El token te lo pasé por chat.

---

## Lo que se hizo

### 0. `GET /api/export` — endpoint de solo lectura en JSON

Lo nuevo de verdad. Hasta ahora toda lectura de datos era manual: entrar con el
código, navegar la UI, bajar el Excel. Esto es la puerta para máquinas.

**Archivo:** `api/export.ts` (función serverless de Vercel)

- **Auth:** `Authorization: Bearer <EXPORT_TOKEN>`, comparación en tiempo
  constante. Nunca por query param — quedaría en los logs de acceso.
  Sin token válido → 401. Método distinto de GET → 405.
- **No reimplementa fórmulas.** Importa `bpHorasMonthRow`,
  `bpRentabilidadMonthRow` y `summarizeAllProjects` de
  `src/lib/calculations.ts`, o sea las mismas funciones que usan las páginas.
  La fidelidad con la UI es estructural, no copiada a mano.
- **Lee Supabase por REST con fetch paginado de a 1000 filas.** PostgREST capa
  los selects planos en 1000 y `asignaciones` ya pasa ese número: sin paginar
  el export vendría incompleto y sin avisar.
- **Devuelve los 12 meses.**
  - Por BP: `nombre, activo, desde, contratadas, asignadas, libres, sueldo,
    ingreso_cotizado, sueldo_ocupado, sueldo_ocioso, margen, margen_pct,
    cobertura_salarial, dif_comercial_horas, dif_comercial_pesos,
    asignaciones[{proyecto, horas}]`
  - Por proyecto: `horas_contratadas, horas_asignadas, diferencia_horas,
    diferencia_pesos, ingresos, costos, margen, margen_pct, bps`
  - Más un bloque `totales` por mes.
- Entran los BPs con horas asignadas **o** con sueldo cargado en el mes,
  inactivos incluidos, con el flag `activo`. El bloque `totales` suma sólo los
  que tienen asignaciones, para que dé igual que los KPIs de la pestaña
  Rentabilidad con filtro "Todos".

### 1. Vista "Diferencia comercial" a nivel proyecto

La diferencia comercial estaba modelada como algo del BP, pero conceptualmente
es del **proyecto**: si se venden 100h y se asignan 80 entre dos BPs, esas 20h
no son de nadie. Pestaña nueva en Proyectos: proyecto, horas contratadas, horas
asignadas, dif. en horas, dif. en $, totales al pie. La columna por BP quedó
como referencia secundaria.

### 2. Rentabilidad: 6 filas estandarizadas por BP

En el orden que pidió Vicky: sueldo → sueldo cubierto comercialmente → sueldo
ocupado → dif. cubierto vs ocupado → sueldo ocioso → cobertura, con totales
abajo. Las fórmulas de margen y cobertura **no se tocaron**; `sueldoOcioso`
(sueldo − costo de las horas asignadas) es lo único nuevo.

### 3. Agregados por trimestre

El selector de mes ahora suma Q1 (ene–mar), Q2, Q3 y Q4, vía `PeriodPicker`.
Aplica a Horas, Rentabilidad y a la vista nueva del punto 1. Un Q equivale
exactamente a la suma de sus tres vistas mensuales.

### 4. Fix: columna LIBRES capeada en 0

Cuando un BP estaba sobreasignado la columna mostraba `0h` en vez del negativo.
Ahora `horasLibres` es con signo y el negativo va en rojo — que un BP esté
sobrevendido es información. La ociosidad (`horasOciosas`) sigue clampeada:
sobreasignar no genera horas libres negativas.

---

## Verificación

Contra la UI en **julio 2026, filtro "Todos"**:

| | UI | endpoint |
|---|---|---|
| Sueldo total | $25.389.978 | 25389978 |
| Cubierto comercialmente | $22.475.051 | 22475050,54 |
| Sueldo ocupado | $21.816.485 | 21816484,57 |
| **Margen total** | $658.566 | 658565,98 |
| Sueldo ocioso | $3.573.493 | 3573493,44 |
| **Cobertura total** | -$2.914.927 | -2914927,46 |
| Dif. comercial | +50h / +$1.300.042 | 50 / 1300042,46 |
| Proyectos | 15 · 950h vs 900h | 15 · 950 vs 900 |

Coincide fila por fila (Agustina Nieto, Carmela con ocioso negativo, etc.).
`npm run build` pasa.

> `npm run lint` no corre: eslint no está instalado en el proyecto. Es de antes,
> no lo rompió este cambio.

---

## Siguientes pasos

### 1. Cargar `EXPORT_TOKEN` en Vercel — bloqueante

Sin esto el endpoint devuelve 500. Settings → Environment Variables del proyecto
`bp-manager-v2`, los tres entornos (Production, Preview, Development). El valor
es el token que te pasé por chat.

Si lo perdés, generá otro y actualizá la variable:

```bash
openssl rand -hex 32
```

### 2. Mergear el PR y esperar el deploy

Vercel deploya solo desde GitHub en ~30s.

### 3. Probar en producción

Primero cargá el token en la shell (no lo pegues inline, queda en el historial):

```bash
read -rs EXPORT_TOKEN && export EXPORT_TOKEN
```

Después:

```bash
curl -s -H "Authorization: Bearer $EXPORT_TOKEN" "https://bp-manager-v2.vercel.app/api/export?year=2026" | python3 -c "import sys,json; t=json.load(sys.stdin)['months']['7']['totales']; print('margen', t['margen'], '| cobertura', t['cobertura_salarial'])"
```

Tiene que dar `margen 658565.98 | cobertura -2914927.46`.

Chequeo de que el 401 funciona:

```bash
curl -s -o /dev/null -w "%{http_code}\n" "https://bp-manager-v2.vercel.app/api/export"
```

Tiene que dar `401`.

### 4. Apuntar los scripts del P&L al endpoint

Reemplaza al "Descargar horas" como fuente. El campo `asignaciones` por BP es
el que alimenta el reparto de GM, y el bloque `proyectos` la diferencia
comercial.

---

## Pendientes conocidos

### `?year=` no filtra

El esquema no tiene columna de año: `mes` es `int 1-12` y nada más. El param se
acepta y se devuelve, pero la respuesta lo aclara en `meta.year_filtrado: false`.
Para que filtre de verdad hay que agregar la columna a las tablas (`asignaciones`,
`sueldos`, `proyecto_honorarios_mensuales`, `horas_proyecto`) y pasarla por todas
las queries. Es un laburo mediano, no un parche.

Mientras tanto: si en 2027 se cargan datos nuevos encima de los mismos meses,
el export mezcla años. Vale la pena resolverlo antes de fin de año.

### El endpoint usa la anon key con RLS deshabilitado

O sea que lee todo. Es consistente con el estado actual de la app, pero suma una
razón más para retomar el trabajo de RLS que está en pausa (ver CLAUDE.md). Si
en algún momento se activa RLS, el endpoint va a necesitar la service role key
en `SUPABASE_SERVICE_ROLE_KEY` — ya está contemplado en el código, sólo hay que
cargar la variable.

### Tu PAT de GitHub está en texto plano en el remote de git

Apareció al correr `git remote -v`: la URL del remoto tiene embebido un token
`ghp_...`. Cualquiera con acceso al `.git/config` de tu máquina lo lee, y se
filtra en cualquier log o screenshot que muestre el remoto. Conviene sacarlo:

```bash
git remote set-url origin https://github.com/bbintureira/bp-manager-v2.git
```

y guardar las credenciales en el keychain de macOS:

```bash
git config --global credential.helper osxkeychain
```

Si el token ya circuló, revocalo en GitHub → Settings → Developer settings →
Personal access tokens, y generá uno nuevo.

### Fragilidad a tener en cuenta

`api/export.ts` puede importar `calculations.ts` porque ese archivo sólo hace
`import type` de `queries.ts`, y los `import type` se borran al compilar. Si
alguien agrega ahí un import de **valor** desde `queries.ts`, el endpoint se
rompe en runtime: arrastraría `supabase.ts`, que depende de `import.meta.env` y
no existe fuera de Vite. Quedó documentado en CLAUDE.md.
