# Motor de liquidación de nómina — diseño

> 2026-11-06 · Líder de producto de la consola del contador. Revisado por el arquitecto de soluciones
> (aprobado con cambios, incorporados en §3, §4 y §6). Insumos: `referencia-publica.md` (comportamiento
> de un liquidador según documentación pública de ARCA/LCT), `casos-comercio-130-75.md` (casos a mano),
> `brechas-consola-contador.md` (dónde encaja la nómina en el servicio contable).

## 1. Alcance por fases

| Fase | Entrega | Estado |
|---|---|---|
| 1 | Núcleo de conceptos + recibo mensual de un mensualizado CCT 130/75 (puro, sin base) | **Construida** (`src/lib/nomina/`) |
| 2 | Persistencia: empleador, legajo, período, novedades, liquidación (snapshot) con RLS | SQL a escribir en `prisma/pending-gate2/` (Gate 2) |
| 3 | Pantallas en la consola del contador: legajos, novedades, liquidar, recibo imprimible (art. 140 LCT) | — |
| 4 | Exportaciones: Libro de Sueldos Digital (txt) y datos del F.931/SICOSS | — |
| 5 | SAC, vacaciones (art. 155 LCT), liquidación final, retroactivos de paritaria, jornada parcial | — |
| 6 | Ganancias 4.ª categoría (SIRADIG, F.1357) y más convenios | — |

## 2. Conceptos

Cada línea del recibo es un `LineaRecibo` (`src/lib/nomina/tipos.ts`): código interno estable, descripción,
tipo, base, porcentaje, cantidad, importe y `conceptoArca` (asociación al concepto de ARCA del LSD; hoy
`null` hasta verificar la tabla oficial).

- **R** remunerativo (suma a la base de aportes; los descuentos por ausencia van negativos acá).
- **N** no remunerativo (sumas de acuerdos).
- **A** aporte o descuento del empleado (positivo; se resta para el neto).
- **C** contribución patronal (no toca el neto; alimenta el F.931).

Códigos de fase 1: `BASICO`, `ANTIGUEDAD`, `AUSENCIAS`, `PRESENTISMO`, `HE50`, `HE100`, `NR_*`,
`AP_JUBILACION`, `AP_LEY19032`, `AP_OS`, `AP_OS_NR`, `AP_SINDICAL`, `AP_FAECYS`, `CO_814`, `CO_OS`,
`CO_OS_NR`, `CO_ART_VAR`, `CO_ART_FIJA`, `CO_SVO`.

## 3. Fórmulas versionadas por convenio

- Un módulo por convenio (`convenios/comercio-130-75.ts`) con **reglas versionadas** (`REGLAS_COMERCIO_V1`,
  `version: "comercio-v1"`) y **escalas con vigencia** (`desde`/`hasta` por período). Cambiar una regla =
  versión nueva; nunca se edita una versión con liquidaciones guardadas.
- Parámetros de ley (tope ANSES, 11/3/3, OS 6 %) en `parametros-ley.ts`, también con vigencia.
- **Período sin tabla cargada = error.** Nunca se liquida con la última escala conocida.
- Orden fijo: básico → antigüedad → ausencias → presentismo → horas extra → no rem. → bases → aportes →
  contribuciones → neto.
- Aportes y contribuciones sobre **bases acumuladas** (no línea por línea), para que el F.931 cuadre con
  el recibo. Aportes SIPA/INSSJP/OS con tope; contribuciones sin tope.
- Plata: `number` con los helpers de `src/lib/dinero/redondeo.ts` (centavos enteros, medio centavo hacia
  arriba, una vez por línea; totales = suma de líneas). Porcentajes con más de dos decimales se rechazan.
- Fase 2: las tablas pasan a una tabla **global** de parámetros (no por tenant), con vigencia, cargada por
  GSG; lo propio de cada empleador (alícuota 814/01 18 / 20,4 %, ART, seguro de vida, afiliación) va en
  el empleador y el legajo.

## 4. Períodos y liquidaciones

- `Periodo` «AAAA-MM» con estado abierto → liquidado → cerrado; reabrir genera **rectificativa**, no pisa.
- `tipoLiquidacion`: mensual | sac | final | complementaria (prevista desde fase 1 en el snapshot: los
  aumentos del CCT 130 llegan retroactivos todos los años).
- **Liquidación = snapshot inmutable**: líneas, totales, `versionReglas`, `versionParametros` y los
  **valores** de todos los parámetros usados (`Recibo.parametros`), para reimprimir y auditar un recibo de
  2026 en 2029 sin depender del código desplegado.

## 5. Datos por tenant con RLS (fase 2)

Modelos (SQL aditivo e idempotente en `prisma/pending-gate2/`, con `tenant_isolation` como en `N2_pagos.sql`):

- `NominaEmpleador` (tenantId, clienteCarteraId, CUIT, alícuota 814/01, ART, seguro de vida, actividad).
- `NominaEmpleado` (legajo: CUIL, ingreso, categoría, convenio, afiliación, obra social, **situación de
  revista, modalidad de contratación, zona, adherentes, código de actividad**: el LSD y el F.931 los exigen).
- `NominaNovedad` (empleado, período, tipo, cantidad).
- `NominaLiquidacion` (empleador, período, tipo, estado, snapshot JSON, hash del snapshot).

Aislamiento: RLS por `tenantId` aísla **estudios** entre sí, pero NO clientes de un mismo estudio. Toda
query de nómina filtra además por `empleadorId` y verifica que el cliente pertenezca a la cartera del
usuario (autorización por cliente de cartera, con test de aislamiento cliente A ≠ cliente B).

## 6. Recibo y exportaciones

- Recibo (art. 140 LCT): se renderiza desde el snapshot (datos del empleador y del empleado, período, fecha
  y lugar de pago, último depósito de aportes, líneas, neto en letras, firma). Nunca se recalcula.
- LSD (ARCA): conceptos propios asociados a conceptos ARCA (`conceptoArca`), archivo de liquidación por
  período, generado **desde las líneas guardadas**.
- F.931/SICOSS: bases y aportes/contribuciones por CUIL desde el snapshot + datos del legajo.

## 7. Decisiones tomadas (no críticas, recomendación del experto)

1. Escala nov-2026 cargada **provisional a confirmar** (homologación no verificada); el recibo lo advierte.
2. Presentismo 8,33 % sobre básico + antigüedad − ausencias; se pierde entero con ≥ 1 ausencia injustificada.
3. Valor hora = (básico + antigüedad + presentismo) / 200; no se redondea el valor hora, sí la línea.
4. Sumas no remunerativas: montos llenos, sin adicionales, sin prorrateo; aportan OS 3 % y contribuyen 6 %
   sin tope; integran la base de cuota sindical y FAECYS 0,5 %.
5. Antigüedad sobre el básico liquidado (incluido el sobre escala del caso 5).
6. Sin ART ni seguro de vida configurados no se inventan valores: no se liquidan y queda advertencia.
7. Fase 1 sin tabla nueva (núcleo puro); el SQL llega en fase 2.
8. `conceptoArca` en `null` hasta verificar la tabla oficial de conceptos del LSD (los sitios de ARCA no
   fueron accesibles desde la sesión).
9. Horas extra: máximo 30 h por mes (dto. 484/00) se **rechaza** en vez de liquidarse; el tope anual de
   200 h se controla con el acumulado en fase 2.
10. Certificación adversarial (2026-11-06): rechazada en primera vuelta por una categoría heredada del
    prototipo (`toString`) que daba neto `NaN`; corregida junto con tope de importe, afiliación booleana,
    `−0`, novedades y fuentes explícitas en el snapshot. Tests de regresión en `motor-core.test.ts`.

## 8. Decisiones del dueño

1. **De quién es el dato**: tenantId = estudio con empleador como hijo, o el empleador como tenant propio
   (si los clientes de cartera pueden pasar a autoservicio, conviene decidirlo antes de fase 2).
2. Secuencia: nómina primero o en paralelo con vencimientos + IVA compras + papel de trabajo de IVA
   (el contador los pone antes por costo-beneficio).
3. Presentar ante ARCA por web service o sólo generar archivos (responsabilidad y clave fiscal delegada).
4. Con el contador del cliente: escala homologada, si las sumas no rem. llevan adicionales o se prorratean,
   18 % o 20,4 % y detracción, ART y seguros reales, afiliación de cada empleado, encuadre de los sobre
   escala (caso 5).
