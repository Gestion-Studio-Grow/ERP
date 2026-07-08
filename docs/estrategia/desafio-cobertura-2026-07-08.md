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
trabajo real estuvo en **2 reclasificaciones hacia arriba** (subir prioridad/segmento) y **5 hacia abajo**
(bajar de backlog a reserva o cortar). Detalle completo con justificación fila-por-fila está en el mapa
actualizado; acá el resumen de lo que cambia el terreno.

---

## 2. Los recortes/reclasificaciones más relevantes

### 🔼 Sube: **2F3 (fiado) y BMC (stock) pasan de "solo pyme" a "ambos, con versión light para micro"**

Este es el hallazgo más importante del desafío. El mapa original leía "cuentas a cobrar" (2F3) como un
proceso de empresa formal — vencimiento, recordatorio, saldo contable. Correcto para la versión **completa**
(J60), pero se le escapó la versión **informal**: **el fiado es cultura de comercio de barrio argentino**
(kiosco, almacén, carnicería de esquina) — un cuaderno con nombre/monto/fecha es, en la práctica, uno de
los procesos MÁS usados por el micro comerciante, no un lujo de pyme. Lo mismo con **BMC** (stock): el
overselling (vender algo que ya no hay) es un dolor diario tanto del carnicero de barrio como del
distribuidor — y ya hay evidencia concreta en el propio repo (bug de doble descuento de stock detectado en
QA, `docs/ESTADO-ACTUAL.md` §6, worktree `calidad`, sin mergear). **Recomendación:** el set self-serve del
micro (M2 del roadmap) debería incluir una versión mínima de "anotar fiado" y "stock básico anti-oversell",
no solo diferirlos a M3 (`enterprise`).

**Impacto en el roadmap:** el piso del micro sube de ~5 a ~6 piezas (`roadmap-dos-modelos.md` §2 M2). No
es scope creep — es corregir un sesgo de "SAP piensa en empresa, no en kiosco" que el mapa original
heredó sin querer.

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

No es un proceso, es un dato. Se absorbe como campo de configuración (probablemente del módulo
`localizacion` ya existente en el ERP — mostrar CBU/alias en la factura o el perfil del tenant), no
amerita un `ScopeItem`/módulo de catálogo propio. Es la única decisión de este desafío que no es
"reserva" sino "esto nunca debió ser una fila propia".

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

1. **Confirmar la subida de 2F3-lite/BMC-lite al piso del micro (M2)** — es una expansión de scope del
   circuito self-serve mínimo (`roadmap-dos-modelos.md` M2), aunque acotada. No es §C (no toca DB/deploy/
   secretos) pero sí cambia lo que "M2 terminado" significa — el PO del Catálogo/Plugins y el Arquitecto
   de Solución deberían confirmar antes de que backoffice-ingeniería lo tome como criterio de aceptación.
2. **El gap de "legajo de personal básico" (§3)** queda como pregunta sin resolver — no lo sumo al set
   default por falta de evidencia, pero tampoco lo descarto. Pide juicio del PO del Catálogo.

Ninguna de las dos requiere OK del dueño en el sentido de §C (irreversible/Gate) — son decisiones de
alcance de producto que el PMO/PO del Catálogo pueden resolver con criterio propio siguiendo el flujo RACI.

---

## 5. Cómo queda el mapa

`docs/estrategia/mapa-cobertura-scope-items.md` queda **VALIDADO** con este desafío incorporado
(columnas Decisión + Segmento en las 3 tablas, §4 y §6 actualizados). Listo para que el PO del Catálogo lo
tome como base de backlog priorizado para M2/M3 del roadmap. No se mergea a `main` — pasa por el Gate de
Excelencia (Opus) al cierre del sprint, como el resto de los entregables de esta rama.

— Elaborado por GSG (Analista de mercado local — célula Consultores), 2026-07-08
