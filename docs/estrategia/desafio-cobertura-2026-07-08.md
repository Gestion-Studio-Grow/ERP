# 🥊 Desafío del mapa de cobertura — Analista de mercado local (2026-07-08)

**Qué es:** el desafío pedido por el dueño al `docs/estrategia/mapa-cobertura-scope-items.md` (PMO, primer
pase). Rol: **Analista de mercado local**, célula Consultores. Pregunta por cada fila: *¿una pyme o micro
argentina de verdad usa esto, o es peso muerto de SAP?* Objetivo: dejar el mapa **validado antes de
construir módulos** — más barato corregir el mapa ahora que rehacer un módulo después.

**Método:** no re-litigo lo que el PMO ya sacó bien (los ~41 scope items corporativos en RESERVA — de
acuerdo, ninguno individualmente vale la pena desafiar, el patrón es obvio: tesorería/consolidación/HR
corporativo no lo usa una pyme de 6-20 empleados). Foco en las **~15 filas del set curado** (lo que el PMO
ya consideraba "sí, AR pyme") — ahí es donde un sesgo optimista de "esto suena razonable en SAP" se cuela
más fácil. Resultado volcado en el mapa mismo (columnas **Decisión**/**Segmento validado** en cada tabla).

> **🥊 Revisión adversarial S5 (Opus), 2026-07-08 — desafío CONFIRMADO con 2 correcciones de anotación
> (incorporadas):** (1) **2F3 NO va al piso universal del micro** — es transversal a ciertos *rubros*
> (almacén/kiosco/verdulería/carnicería de barrio), no al segmento micro entero; queda KEEP pero **default
> OFF, gateado por rubro, construcción diferida (ADR-030)** hasta que haya un cliente perfil-fiado en el
> pipeline (0 de 4 tenants actuales lo son → meterlo default-ON contradiría mi propio principio "meter lo
> que no usa lo empeora" y violaría ADR-030). (2) **BMC-lite exige** el fix del doble descuento de stock
> (worktree `calidad`) mergeado como **criterio de aceptación de "M2 terminado"**. (3) *(menor)* BFA: el
> hogar del CBU/alias se reconsidera entre `localizacion` vs. config de cobros/fiscal (nota para PO). Las
> tres están reflejadas abajo y en el mapa.

**Rama:** `claude/sprint-startup-generic-rf6x0m` (worktree de sesión, sin tocar `main`). Trabajo 100%
documental — no se tocó código ni Neon.

---

## 1. Resumen numérico

De las **15 filas individuales** del set curado (sin contar los 3 bloques corporativos, ya correctamente
en reserva):

| Decisión | Cantidad | Items |
|---|---|---|
| **KEEP** | 10 | 1J2, BD9, 2F3, J60, J59, J58, 16T, J45/18J, BMC, BMK |
| **RESERVA** (bajado de backlog/opcional) | 4 | J62, 1W0, 3W0, J12 |
| **CUT** (fold a otro módulo) | 1 | BFA |

Más los **3 bloques corporativos** (~41 scope items agregados) confirmados sin cambios en RESERVA.

**Ningún KEEP nuevo fuera de lo ya curado por el PMO** — el desafío no encontró un scope item corporativo
que en realidad sí aplicara a pyme AR (el filtro original del PMO fue correcto en esa dirección). El
trabajo real estuvo en **2 reclasificaciones de eje** (2F3 y BMC pasan de "solo pyme" a **add-ons del
micro gateados por rubro** — corregido por S5/Opus: gateados por rubro, no piso universal) y **5 hacia
abajo** (bajar de backlog a reserva o cortar). Detalle completo con justificación fila-por-fila está en el
mapa actualizado; acá el resumen de lo que cambia el terreno.

---

## 2. Los recortes/reclasificaciones más relevantes

### 🔼 Reclasifica: **2F3 (fiado) y BMC (stock) pasan de "solo pyme" a add-ons del micro gateados por RUBRO** *(corregido por S5/Opus)*

Este es el hallazgo más importante del desafío. El mapa original leía "cuentas a cobrar" (2F3) como un
proceso de empresa formal — vencimiento, recordatorio, saldo contable. Correcto para la versión **completa**
(J60), pero se le escapó la versión **informal**: **el fiado es cultura de comercio de barrio argentino**
(kiosco, almacén, verdulería, carnicería de esquina) — un cuaderno con nombre/monto/fecha es, en la
práctica, uno de los procesos más usados por *ese tipo* de comerciante. Lo mismo con **BMC** (stock): el
overselling (vender algo que ya no hay) es un dolor diario tanto del carnicero de barrio como del
distribuidor — y ya hay evidencia concreta en el propio repo (bug de doble descuento de stock detectado en
QA, `docs/ESTADO-ACTUAL.md` §6, worktree `calidad`, sin mergear).

**⚠️ Corrección de la revisión adversarial S5 (Opus) — importante, corrige un sesgo de mi primer pase:** yo
había subido 2F3 y BMC al **piso universal self-serve del micro**. Eso está mal para 2F3 y matizado para
BMC:

- **2F3 (fiado) NO es piso universal — es transversal a ciertos RUBROS, no al segmento micro entero.** Un
  micro de servicios (peluquería, estudio, taller que cobra al momento) no usa fiado. Meterlo default-ON a
  todo micro **contradice mi propio principio** (*"meter lo que no usa lo empeora"*, §4 del mapa) y **viola
  ADR-030** (no se invierte/construye hasta que haya venta). **0 de los 4 tenants actuales son
  perfil-fiado** (CH/Magra/Shine/ADM son servicios/retail de nicho, no almacén de barrio) → construirlo
  ahora sería especulativo. **Queda:** KEEP como módulo de catálogo, **default OFF, gateado por rubro,
  construcción DIFERIDA hasta un cliente perfil-fiado en el pipeline.**
- **BMC (stock) sí se construye YA, pero también gateado por rubro** (ON para retail/carnicería, OFF para
  servicios puros sin stock). La diferencia con 2F3: **la evidencia en código ya existe** (ledger F1b/F2 en
  `main` + tenants de mostrador reales operando) — no es especulativo, es cablear lo que ya está. **Con una
  condición dura:** el **fix del doble descuento de stock (worktree `calidad`) DEBE estar mergeado** como
  criterio de aceptación de "M2 terminado" — sin eso, BMC-lite embarca un bug de oversell conocido.

**Impacto en el roadmap:** el piso universal del micro **se mantiene en ~5 piezas** (`roadmap-dos-modelos.md`
§2 M2); stock y fiado son **add-ons por rubro**, no piso. BMC-lite entra al alcance inmediato de M2 (con la
dependencia del fix); 2F3-lite es backlog diferido (ADR-030). No es scope creep — es corregir un sesgo de
"SAP piensa en empresa, no en kiosco" **sin caer en el sesgo opuesto** de "todo comercio de barrio es todo
el micro".

### 🔽 Baja: 4 items que "en teoría sí son AR pyme" pero no son el dolor que resuelve la venta hoy

- **J62 (bienes de uso/amortización):** lo resuelve el software del contador externo (Tango/Colppy), no
  el ERP del comercio. Construirlo no le saca trabajo a nadie — el contador ya tiene su herramienta.
- **1W0 (conciliación bancaria por archivo):** la pyme de 6-20 empleados AR concilia a mano o en Excel con
  su contador. Parsear formatos de archivo de bancos argentinos (BNA, Galicia, Santander…) es caro de
  construir para un dolor que hoy nadie está pagando por resolver.
- **3W0 (recepción de depósito):** depende de que exista "depósito separado del local de venta" —
  multi-sucursal/multi-depósito **no existe ni a nivel de schema** hoy (`BusinessSettings` es singleton por
  tenant, señalado ya por el Challenger en `challenger-contrapuntos.md` ronda 1). Construir esto antes de
  tener el modelo de datos que lo soporte sería repetir el error que el Challenger ya marcó para
  multi-sucursal.
- **J12 (registro de horas):** es real, pero **rubro-específico** (consultoras/estudios de servicios
  profesionales) — no universal al segmento pyme como GROW-AR lo define hoy (retail, gastro, estética,
  carnicería). No amerita estar en el backlog default de todos los rubros.

Los cuatro quedan **documentados, no descartados** (mismo mecanismo del §6 del mapa — "definir ≠
construir", ADR-055) — se despiertan si un cliente concreto los pide.

### ✂️ Corta como módulo aparte: **BFA (alta de cuentas bancarias)**

No es un proceso, es un dato. Se absorbe como campo de configuración del tenant (mostrar CBU/alias en la
factura o el perfil), no amerita un `ScopeItem`/módulo de catálogo propio. Es la única decisión de este
desafío que no es "reserva" sino "esto nunca debió ser una fila propia".

**📝 Nota para el PO del Catálogo (revisión S5/Opus):** mi primer pase asumió que el hogar del CBU/alias
es el módulo `localizacion`. Reconsiderarlo — el CBU se usa para **cobrar y facturar**, no es un dato de
*ubicación* del negocio; puede encajar mejor en **config de cobros/fiscal** que en `localizacion`.
Decisión de diseño que queda para el PO, no la fijo yo.

---

## 3. Gap detectado que la lista SAP no cubre (pregunta abierta)

La lista de scope items de SAP asume que RRHH es un dominio aparte (SuccessFactors) — por eso no tiene
ningún ítem intermedio entre "nada" y "HR corporativo completo". Pero una pyme AR de 6-20 empleados sí
tiene un dolor real y liviano: un **legajo de personal básico** (nombre, contacto, turno/horario — **sin**
liquidación de sueldos, que sigue siendo trabajo del gestor/liquidador externo, coincido con el mapa
original en eso). No lo agrego al set default porque no tengo evidencia de demanda concreta hoy — lo dejo
como **pregunta abierta para el PO del Catálogo/Plugins**: ¿vale la pena un módulo mínimo de "quién trabaja
acá" separado de la liquidación, o es scope creep disfrazado de gap?

**Supuesto fuerte que anoto (no verificado con clientes reales):** asumo que "fiado informal" (2F3-lite) es
más transversal en el AR real que lo que el mapa original reflejaba, basado en conocimiento de mercado
general de comercio minorista argentino (cultura del "cuaderno"/"libreta"), **no** en una encuesta a los 4
tenants actuales (CH Estética, Magra, Shine, A Dos Manos). Ninguno de esos 4 es un comercio de fiado
clásico (son servicios/retail de nicho, no almacén de barrio) — el primer cliente real que valide o
refute esta hipótesis debería ser uno de ese perfil (kiosco, almacén, ferretería de barrio).

---

## 4. ⤴️ Para ELEVAR AL DUEÑO

**Nada de este desafío toca §C directamente** (es trabajo 100% doc/mapa, cero código, cero Neon). Pero dos
cosas que salen de acá **sí** tocan decisiones de alcance que no me corresponde tomar sola:

1. **BMC-lite en M2 con dependencia dura** — BMC-lite entra al alcance inmediato de M2 (evidencia en
   código: ledger F1b/F2 en `main`), **gateado por rubro**. **Criterio de aceptación de "M2 terminado": el
   fix del doble descuento de stock (worktree `calidad`, sin mergear) DEBE estar mergeado** — si no, M2
   embarca un bug de oversell conocido. No es §C, pero cambia el criterio de "M2 terminado" y **ata M2 a
   una decisión de destino del oversell fix que hoy está en §C·I6 del ESTADO-ACTUAL** (recuperar vs.
   descartar). El PMO/PO debería resolver ese I6 antes de cerrar M2.
2. **2F3-lite (fiado) NO va a M2 — es backlog diferido (ADR-030)** gateado por rubro, se construye cuando
   haya un cliente perfil-fiado en el pipeline. Confirmar que el roadmap M2 NO lo lista como piso (mi
   primer pase lo había subido por error; corregido por S5/Opus).
3. **El gap de "legajo de personal básico" (§3)** queda como pregunta sin resolver — no lo sumo al set
   default por falta de evidencia, pero tampoco lo descarto. Pide juicio del PO del Catálogo.
4. **Hogar del CBU/alias (BFA):** `localizacion` vs. config de cobros/fiscal — decisión de diseño para el
   PO del Catálogo (nota agregada tras S5/Opus).

Ninguna de las dos requiere OK del dueño en el sentido de §C (irreversible/Gate) — son decisiones de
alcance de producto que el PMO/PO del Catálogo pueden resolver con criterio propio siguiendo el flujo RACI.

---

## 5. Cómo queda el mapa

`docs/estrategia/mapa-cobertura-scope-items.md` queda **VALIDADO** con este desafío incorporado
(columnas Decisión + Segmento en las 3 tablas, §4 y §6 actualizados). Listo para que el PO del Catálogo lo
tome como base de backlog priorizado para M2/M3 del roadmap. No se mergea a `main` — pasa por el Gate de
Excelencia (Opus) al cierre del sprint, como el resto de los entregables de esta rama.

— Elaborado por GSG (Analista de mercado local — célula Consultores), 2026-07-08
