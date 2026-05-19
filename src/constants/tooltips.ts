// Tooltip definitions for BP Manager
// Each key maps to a field label in the UI

export const TOOLTIPS = {
  // Dashboard BPs — Horas tab (KPIs)
  ocupacionPromedio:
    'Promedio de ocupación de todos los BPs del mes. Se calcula dividiendo las horas asignadas sobre las horas contratadas de cada BP.',
  horasLibresTotales:
    'Suma de horas sin asignar de todos los BPs. Son horas que la agencia está pagando pero que no están generando ingresos en ningún proyecto.',

  // Dashboard BPs — Horas tab (tabla)
  horasLibresColumna:
    'Horas contratadas menos horas asignadas. Capacidad disponible del BP que no está siendo aprovechada este mes.',
  ocupacionColumna:
    'Horas asignadas ÷ horas contratadas × 100. Verde: ≥85%. Naranja: 60–84%. Rojo: <60%.',

  // Dashboard BPs — Rentabilidad tab (KPIs)
  margenTotal:
    'Suma de márgenes de todos los BPs del mes. El margen compara el ingreso cotizado contra el costo real de cada BP (no contra el sueldo). Un margen positivo indica que los proyectos asignados cubren el costo de las horas efectivamente trabajadas, pero no necesariamente el sueldo completo.',
  coberturaSalarialTotal:
    'Diferencia entre lo que los proyectos generaron y lo que la agencia pagó en sueldos. Negativo indica cuánto absorbió la agencia sin recuperar.',
  bpsConCostoMayorSueldo:
    'Porcentaje de BPs cuyos ingresos cotizados cubrieron al menos su sueldo ese mes.',

  // Dashboard BPs — Rentabilidad tab (tabla)
  ingresoCotizado:
    'Lo que el BP generó según la tarifa de cada proyecto asignado. Se calcula como: horas asignadas × (honorario del proyecto ÷ horas requeridas del proyecto).',
  margenColumna:
    'Ingreso cotizado menos costo real del BP. El costo real es lo que efectivamente costaron las horas asignadas, no el sueldo completo. Positivo significa que el proyecto cubre el costo de esas horas.',
  coberturaSalarialColumna:
    'Ingreso cotizado menos sueldo. Indica cuánto del sueldo fue cubierto por los proyectos asignados.',
  costoReal:
    'Costo efectivo del BP según las horas que tuvo asignadas. Se calcula como: horas asignadas × (sueldo ÷ horas contratadas). Refleja lo que realmente costó el BP ese mes, no su sueldo total.',

  // Dashboard Proyectos — Vista mensual (KPIs)
  rentabilidadMes:
    'Ingresos totales menos costo total de BPs en el mes. Indica si la operación del mes fue superavitaria o deficitaria.',
  margenBruto:
    'Rentabilidad expresada como porcentaje de los ingresos. Ejemplo: si los ingresos son $100 y el costo $60, el margen es 40%.',

  // Dashboard Proyectos — ambas vistas (tabla)
  costoColumna:
    'Suma del costo de cada BP asignado al proyecto. Se calcula como: horas asignadas × (sueldo del BP ÷ horas contratadas del BP).',
  resultadoColumna:
    'Ingresos del proyecto menos su costo de BPs. Verde con + es ganancia, rojo con − es pérdida.',

  // Dashboard Proyectos — Vista anual (KPIs)
  rentabilidadAnual:
    'Ingresos menos costos acumulados del año, considerando solo los meses con actividad real.',
  margenAnual:
    'Rentabilidad anual como porcentaje de los ingresos del año.',

  // Dashboard Proyectos — Vista anual (tabla)
  ingresosColumnaAnual:
    'Suma de honorarios del proyecto solo en los meses donde tiene BPs asignados. Los meses sin asignaciones no se contabilizan para evitar inflar los ingresos con meses futuros sin costo asociado.',
} as const

export type TooltipKey = keyof typeof TOOLTIPS
