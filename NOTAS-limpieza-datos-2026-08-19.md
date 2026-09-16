# Limpieza de datos — informe previo (2026-08-19)

**No toqué la base.** Esto es sólo el diagnóstico y la propuesta, con las filas
exactas para que decidas. Archivo sin trackear, borralo cuando no sirva más.

---

## Antes que nada: la data cambió durante la sesión

El pedido decía que Agustina Deluca tenía "sueldo cargado todos los meses hasta
diciembre ($5,4 M a $6,2 M por mes)". Eso era cierto en el export de las **19:13**.
A las **20:01** ya no: los meses 8 a 12 están en **$0**.

Las filas siguen existiendo (`created_at` sigue siendo 2026-04-28, un UPDATE no
lo toca), pero el valor pasó a 0. O sea que alguien editó esos sueldos desde la
app mientras yo trabajaba. Todo lo que sigue está medido sobre el estado actual,
no sobre el del pedido.

Queda una sola fila huérfana de Deluca, no seis.

---

## ¿Algún total o KPI de la app suma estos sueldos?

Revisé cada agregado. **Casi todos los excluyen solos**, porque restringen la
suma a los meses en que el BP tiene horas asignadas:

| Vista | Suma sueldos huérfanos |
|---|---|
| Dashboard BPs · Rentabilidad mensual (tabla y KPIs) | No — filtra `byProject.length > 0` |
| Dashboard BPs · Rentabilidad anual | No — `bpRentabilidadAnnualAggregate` usa sólo meses con asignaciones |
| Dashboard BPs · Horas (mensual y anual) | No — filtra `horasAsignadas > 0` |
| `/api/export` → bloque `totales` | No — suma sólo BPs con asignaciones |
| `/api/export` → array `bps` | Sí, pero **a propósito**: los muestra con `activo` y `asignadas: 0` |
| **Asignaciones · vista "Todos" → columna "Sueldo año"** | **Sí** |

**El único lugar que los suma es la columna "Sueldo año"** de la pestaña
Asignaciones, que sale de `summarizeBPsAnnual().totalSueldo` — el único agregado
que suma todas las filas de `sueldos` sin mirar si hubo horas.

Conclusión práctica: el impacto es acotado y no toca márgenes ni cobertura. Pero
esa columna hoy sobre-reporta.

---

## A) Sueldo cargado sin horas — y por qué NO borraría casi ninguna

Ocho filas, $34.418.102 en total. Pero hay que separarlas en dos grupos, porque
**no son la misma cosa**:

### A.1 · Meses futuros de BPs activos — NO borrar

Hoy es 19 de agosto. Los meses 10, 11 y 12 todavía no pasaron.

| BP | activo | mes | sueldo | id |
|---|---|---|---|---|
| Agustina Nieto | sí | 10 | $4.563.190 | `604115c6-3d20-484c-9f63-922a1cd54a9d` |
| Agustina Nieto | sí | 11 | $4.842.494 | `e4f88aa1-3b9f-4d07-9f69-fe78b52c45e5` |
| Agustina Nieto | sí | 12 | $4.842.494 | `6f753ab9-bc67-472f-a6cf-65bab39c60c9` |
| Camila Balut | sí | 11 | $4.777.784 | `963567c8-fb4c-462b-94c9-f04e1c9551c5` |
| Camila Balut | sí | 12 | $5.070.223 | `441f7601-fe14-4d62-8826-7b166f14430d` |
| Lara Blanco | sí | 12 | $4.340.774 | `1c51db88-11c9-4c83-b40f-84a430e5d360` |

Son **$28.436.959 de sueldos proyectados de gente que sigue trabajando**, en
meses cuyas asignaciones todavía no se cargaron. Eso no es residuo: es
planificación, y es la mitad del costo que vas a necesitar para presupuestar el
Q4. Borrarlas te deja sin la base del forecast.

Se van a "arreglar" solas cuando cargues las asignaciones de esos meses.

### A.2 · BPs inactivos — estas sí son candidatas reales

| BP | activo | mes | sueldo | contexto | id |
|---|---|---|---|---|---|
| Agustina Deluca | no | 7 | $5.394.046 | últimas horas en junio (24,5 h) | `f51a1f68-fae5-4aa9-a1be-e596540086cf` |
| Florencia Munnich | no | 5 | $587.097 | únicas horas en abril (30 h) | `d931cad3-f889-48bd-9e5e-ad41cf7f7473` |

Dos filas, $5.981.143. Y ojo, **puede que ninguna sea un error**: un último mes
cobrado sin asignaciones es exactamente lo que pasa cuando alguien sale a mitad
de mes, se le paga el preaviso o cierra pendientes sin proyecto asignado.

**Mi recomendación: no borrar, poner en 0.** Poner en 0 desde el diálogo de
edición del BP deja el mismo efecto en los números y conserva la fila y su
historia. Borrar no te devuelve nada a cambio del riesgo de tirar un dato real.

Si igual querés borrarlas, decime y te paso el SQL — pero necesito tu confirmación
explícita de que esos dos meses no se pagaron.

---

## B) Horas sin sueldo — este es el problema que sí duele

Cinco filas, y son **más graves que las huérfanas**: no sobre-reportan un total
menor, inflan el margen al 100 %.

| BP | mes | horas | estado de la fila | id |
|---|---|---|---|---|
| Catalina Folino | 9 | 60 h | existe, en $0 | `3464841d-7c9f-460e-aef3-1bb1f9523866` |
| Catalina Folino | 10 | 120 h | existe, en $0 | `753810ed-21f2-4513-ac46-c47225955e42` |
| Catalina Folino | 11 | 120 h | existe, en $0 | `ab69de52-1823-4093-b2fe-b14f86f8b0e8` |
| Catalina Folino | 12 | 120 h | existe, en $0 | `60401f11-8822-4149-ac26-62f0e9e09955` |
| Sabrina cornstein | 12 | 30 h | existe, en $0 | `345310b8-1cef-46db-b306-0198a5d33b21` |

Con sueldo 0 el costo/hora del BP da 0, entonces el costo de esas horas da 0 y el
margen sale 100 %. En el export de hoy:

```
Catalina Folino  mes 10: asignadas=120  sueldo=0  ocupado=0  margen_pct=100
Catalina Folino  mes 12: asignadas=120  sueldo=0  ocupado=0  margen_pct=100
Sabrina          mes 12: asignadas= 30  sueldo=0  ocupado=0  margen_pct=100
```

Catalina son 420 horas vendidas que hoy figuran con costo cero. Eso ensucia el
margen de todos los proyectos donde está asignada, no sólo su fila.

**Acá no hay nada que borrar: falta cargar el dato.** Las filas existen con
valor 0, así que alcanza con abrir Editar BP y completar los meses 9–12 de
Catalina y el 12 de Sabrina. Con la grilla nueva podés cargar horas y sueldo de
cada mes en la misma pantalla.

Es lo primero que haría de todo este informe: es el que mueve los números que
mirás.

---

## Resumen de lo que propongo

| Prioridad | Qué | Cómo |
|---|---|---|
| 1 | Cargar los sueldos faltantes de Catalina (9–12) y Sabrina (12) | Editar BP → grilla mensual |
| 2 | Poner en 0 los 2 meses de BPs inactivos (Deluca 7, Munnich 5) — **si confirmás que no se pagaron** | Editar BP → sueldo del mes en 0 |
| 3 | Nada con los 6 meses futuros de BPs activos | Se resuelven al cargar las asignaciones |
| 4 | Si te molesta la columna "Sueldo año" de Asignaciones | Es un cambio de código de una línea; decime y lo hago |
