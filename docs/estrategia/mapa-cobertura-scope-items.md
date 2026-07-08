# 🗺️ Mapa de cobertura — scope items SAP → qué necesita la pyme / el micro argentino

> **Qué es:** la respuesta a *"¿podemos generar el backoffice desde los scope items?"* y *"¿cómo aseguramos
> abarcar lo que una pyme (o un micro) necesita?"*. Toma la lista de scope items de SAP S/4HANA y la **cura a
> la realidad argentina**, mapeando cada uno a nuestro modelo GROW-AR (perfil `lite`/`enterprise`, ADR-058).
> **El mapa ES la garantía de cobertura:** nada que la pyme necesita se escapa, y —tan importante— el ~70%
> corporativo se deja **afuera a propósito**.
>
> **Autor:** PMO (síntesis) · **Desafiado por:** Analista de mercado local (2026-07-08, ver
> `docs/estrategia/desafio-cobertura-2026-07-08.md`) — columnas **Decisión** y **Segmento validado**
> agregadas a cada tabla. **Fecha:** 2026-07-08 ·
> **Base:** ADR-058 (GROW-AR) · ADR-044 (argentinizar) · ADR-054/055 (módulos) · lista de scope items del dueño.

---

## 1. ¿Podemos "generar el backoffice" desde la lista? Sí — y así es exactamente

**La lista de scope items ES el catálogo.** Es literalmente el modelo GROW-AR (ADR-058 P1: *activar, no
programar*): cada scope item de SAP = **un `ScopeItem`/módulo nuestro** (ADR-054), con sus **dos perfiles**
`lite`/`enterprise`, que se **enciende** por tenant. Pero hay que ser preciso con qué significa "generar":

- **NO es autogeneración de código** desde una tabla. Cada módulo es ingeniería real (descriptor + UI +
  server actions + Gate). Lo que la lista **sí** genera es el **mapa completo del catálogo** = el backlog y
  la cobertura. Es el plano, no la casa.
- **La lista es la brújula anti-olvido Y anti-exceso.** Con ella no te olvidás de ningún proceso que la pyme
  necesita, **y** ves clarito qué es corporativo (tesorería, consolidación, hedge…) que **no** hay que
  construir. Sin el mapa, adivinás; con el mapa, curás.

## 2. Cómo aseguramos abarcar lo que la pyme (o el micro) necesita — 3 filtros

1. **El mapa mismo (cobertura).** Cada scope item se clasifica: ¿lo usa el **micro**? ¿la **pyme**? ¿es
   **corporativo (fuera)**? → nuestro **perfil** (lite/enterprise) → **estado** (existe / falta / N-A). Nada
   queda sin decidir. La tabla del §3 es esa clasificación.
2. **El Analista de mercado local desafía cada uno (argentinizar, ADR-044).** La pregunta dura por fila:
   *"¿una pyme argentina de verdad usa esto, o es peso muerto de SAP?"*. El 70% de la lista SAP es para
   **corporaciones** — una pyme AR usa una **fracción**. Copiar la lista entera sería el error que el
   Challenger ya marcó (over-scope). Se **cura**, no se copia.
3. **El circuito mínimo vendible como piso (micro self-serve).** El micro tiene que operar de punta a punta
   **vender → cobrar → facturar** sin que un humano lo configure (`costos §2`). Ese circuito es el piso de
   cobertura del `lite`; todo lo demás del micro es opcional.

**Leyenda de estado:** ✅ ya existe (nuestro) · 🔧 falta y **sí** lo usa la pyme AR (backlog) · ◻️ opcional/nicho
· ⛔ **fuera del set por defecto** → **🗄️ RESERVA** (no se descarta: se guarda, se despierta si un cliente lo
pide — ver §6). **Perfil:** 🟠 lite (micro) · 🔵 enterprise (pyme) · — (reserva).

**Leyenda de Decisión (Analista de mercado local, 2026-07-08):** **KEEP** = se queda en el set vendible
default de su(s) segmento(s), con evidencia de mercado AR real · **CUT** = no amerita ser módulo propio
(se absorbe en otro módulo/config existente) · **RESERVA** = se documenta pero no se prioriza en backlog
default — despierta por demanda puntual de un cliente/rubro (mismo mecanismo del §6, aplicado también
**dentro** del set curado, no solo a lo ⛔ corporativo). El detalle de cada cambio de clasificación está en
`docs/estrategia/desafio-cobertura-2026-07-08.md`.

---

## 3. La lista curada (scope items → segmento AR)

### Finanzas
| Scope | Nombre | ¿AR pyme? | Perfil | Estado | Nota criolla | **Decisión** | **Segmento validado** |
|---|---|---|---|---|---|---|---|
| **1J2** | Advance Compliance Reporting | **Sí — el más importante** | 🔵/🟠 | ✅ parcial (plugin ARCA) | = **ARCA/AFIP**: factura electrónica, IVA, percepciones. Ancla del ángulo argentino. | **KEEP** | ambos — no negociable, es el diferencial de marca |
| **BD9** | Sell from Stock *(SD)* | Sí | 🟠🔵 | ✅ existe | = **POS/mostrador** (blueprint retail/carnicería). El micro ya vende con esto. | **KEEP** | ambos |
| **2F3** | Receivables Mgmt & Payment Handling | Sí | 🟠🔵 | 🔧 parcial | Cobros MP ✅; **cuentas a cobrar (fiado)** falta → módulo `cuentas-a-cobrar`. | **KEEP** | **ambos** (reclasificado — el "fiado" es cultura de comercio de barrio AR, no solo pyme; ver desafío §1) |
| **J60** | Accounts Receivable | Sí (pyme) | 🔵 | 🔧 falta | Fiado **formal** (saldo/vencimiento/recordatorio automático). El micro cobra al contado/fiado informal → no necesita la versión formal. | **KEEP** | pyme (la versión informal la cubre 2F3-lite) |
| **J59** | Accounts Payable | Sí (pyme) | 🔵 | 🔧 falta | Cuentas a pagar a proveedores. Va con Compras. **Sin manejo de cheque diferido (fecha, banco, endoso) no sirve en AR** — no es opcional del diseño. | **KEEP** | pyme |
| **J58** | Accounting & Financial Close | Sí (simple) | 🔵 | 🔧 falta | Libro mayor **simple/exportable** al contador. No un ERP contable completo. | **KEEP** | pyme (micro = **CUT** explícito: monotributista no lleva libro mayor) |
| **J62** | Asset Accounting | Sí (básico) | — | 🔧 baja → reserva | Bienes de uso + amortización. Lo hace el software del contador (Tango/Colppy), no el ERP del comercio. | **RESERVA** | — (baja de backlog; se despierta si un cliente puntual con contador propio lo pide) |
| **16T** | Profitability & Cost Analysis | Sí (simple) | 🟠🔵 | 🔧 parcial | = **Reportes** (rentabilidad por producto). Reportes ✅; profundizar. | **KEEP** | **ambos** (reclasificado — saber qué producto deja margen importa también al micro) |
| **1W0** | Bank Integration (File) | Sí (pyme) | — | 🔧 baja → reserva | Conciliación con extracto del banco. La pyme de 6-20 empleados AR concilia a mano/Excel con su contador; parsear formatos bancarios AR es caro para poco valor de venta hoy. | **RESERVA** | — (se despierta si un cliente con tesorería más pesada lo exige) |
| **BFA** | Basic Bank Account Mgmt | Sí (pyme) | — | 🔧 baja → cut | Alta de cuentas bancarias (CBU/alias). No amerita módulo propio — es un dato de configuración. | **CUT** | — (se absorbe como campo del módulo `localizacion`/config de tenant, no como scope item aparte) |
| 1V5 · J54 · 1XA · 2V7 · 1MN · 19W · 41G · 19M · 19O · 19P · 33Q · BEI · 3F0 · 3K3 · 1S2 · 1X1 · 28A · 3L5 · 49P · 2U3 · 42K · 5XU · 34P · 1Q0 | Lease · Intercompany · Predictive · Cash/Liquidity avanzado · ML cash · Credit/Collections/Dispute avanzado · Costeo industrial · Revenue recognition NIIF · Tesorería/Hedge/Garantías · Consolidación de grupo · Cierre corporativo · Plan financiero · OpenText | **No** | — | ⛔ fuera | **Corporativo.** Tesorería, hedge, consolidación de grupos, costeo industrial, ML, OCR: ninguna pyme AR los usa. Peso muerto de SAP. | **RESERVA** (confirmado sin cambios) | — |

### Compras / Inventario (MM · SCM)
| Scope | Nombre | ¿AR pyme? | Perfil | Estado | Nota criolla | **Decisión** | **Segmento validado** |
|---|---|---|---|---|---|---|---|
| **J45 / 18J** | Procurement (Direct/Indirect) | Sí (pyme) | 🔵 | 🔧 falta | = **Compras** (proveedores + órdenes). Hoy cuelga de `catalog`. El micro repone a ojo. | **KEEP** | pyme (micro sigue a ojo — un registro mínimo de carga de mercadería ya lo cubre el ledger de inventario existente, no hace falta módulo `compras` aparte para lite) |
| **BMC** | Physical Inventory Count | Sí (pyme) | 🟠🔵 | 🔧 falta (ya con avance real: ledger + ajustes/mermas en `main`) | = **Inventario** (stock + recuento + merma). Clave en carnicería/retail. | **KEEP** | **ambos, prioridad ALTA** (reclasificado — el overselling ya es un bug real detectado en QA; el stock es dolor diario también del micro, no solo de la pyme) |
| **BMK** | Return to Supplier | Sí (pyme) | 🔵 | 🔧 baja | Devolución a proveedor. Parte de Compras, prioridad baja. | **KEEP** | pyme (baja prioridad — ships junto con Compras, no es módulo aparte) |
| **3W0** | Basic Warehouse Inbound | Nicho | — | ◻️ opcional → reserva | Recepción básica de depósito. Multi-depósito/multi-sucursal **no existe ni a nivel de schema** (ver Challenger ronda 1, `challenger-contrapuntos.md`) — construirlo hoy es prematuro. | **RESERVA** | — (despierta con el primer cliente con depósito separado del local de venta, ej. distribuidora) |
| 18J·BNX·BML·2NV·1L2·J13·2ME·1XF·BKL·3BR·3BS·6W2·BMR | Requisitioning · Subcontracting · Consignment · Invoice reduction · Supplier eval · Central/Internal procurement · Returnables · **EWM avanzado** · Transportation · Scheduling agreements | **No** | — | ⛔ fuera | **Corporativo/industrial.** Depósito avanzado, transporte, subcontratación, compras centralizadas multi-empresa: no es pyme AR. | **RESERVA** (confirmado sin cambios) | — |

### RRHH (HR)
| Scope | Nombre | ¿AR pyme? | Perfil | Estado | Nota criolla | **Decisión** | **Segmento validado** |
|---|---|---|---|---|---|---|---|
| **J12** | Time Recording (Project) | Nicho | — | ◻️ opcional → reserva | Registro de horas — solo servicios profesionales (consultoras/estudios). No universal al segmento pyme. | **RESERVA** | — (rubro-específico; se prioriza si un cliente de servicios profesionales lo pide) |
| JB1 · 1NL · 318 · 1P9 | SuccessFactors Core HR · Employee integration · Cross-app time · Contingent workforce | **No** | — | ⛔ fuera | **Corporativo.** SuccessFactors y gestión de nómina corporativa: la pyme AR usa su estudio contable / liquidador — convenios colectivos y cargas sociales son un dominio regulatorio que no conviene reinventar. | **RESERVA** (confirmado sin cambios) | — |

> **🔎 Gap detectado (no es scope item SAP, lo agrega el Analista de mercado local):** un **legajo de
> personal básico** (nombre, contacto, turnos — SIN liquidación de sueldos) es un dolor real de la pyme
> con equipo, y **no aparece en la lista SAP** porque SAP asume que RRHH es un dominio aparte
> (SuccessFactors). No se agrega al set default — **RESERVA**, pregunta abierta para el PO del Catálogo
> (ver `desafio-cobertura-2026-07-08.md` §3).

---

## 4. El resultado — cobertura garantizada, sin humo (post-desafío, 2026-07-08)

- **Set del MICRO (`lite`) — el piso self-serve, ~6 piezas:** vender (**BD9** POS) · catálogo · clientes ·
  cobrar (MP/efectivo/transferencia) · **fiado light** (**2F3**-lite, sin vencimiento/recordatorio) ·
  **stock básico** (**BMC**-lite, anti-oversell) · **facturar** (Factura C, **1J2**/ARCA). **Con esto el
  micro opera de punta a punta.** Todo lo demás de la lista, el micro **no lo necesita** — y meterlo lo
  haría peor. *(2F3 y BMC se suman al piso tras el desafío del Analista — ver §1/§2 de
  `desafio-cobertura-2026-07-08.md`.)*
- **Set de la PYME (`enterprise`) — el lite + ~8 aditivos que SÍ usa:** **cuentas a cobrar formal** (J60) ·
  **cuentas a cobrar/fiado** (2F3 completo) · **compras** (J45/18J + BMK) · **inventario** (BMC completo) ·
  **cuentas a pagar con cheque diferido** (J59) · contabilidad simple exportable (J58) · reportes de
  rentabilidad (16T) · ARCA completo (1J2: A/B, NC, percepciones).
- **Bajados de backlog a RESERVA tras el desafío (dentro del set curado, no solo lo corporativo):** bienes
  de uso (J62), conciliación bancaria por archivo (1W0), depósito/recepción avanzada (3W0), registro de
  horas (J12) — **sí son AR-pyme en teoría, pero no son el dolor que resuelve la venta hoy**; se
  documentan y se despiertan por demanda puntual, igual mecanismo que §6.
- **Cortado como módulo aparte (CUT):** alta de cuentas bancarias (BFA) — se absorbe como campo de
  configuración, no amerita scope item propio.
- **Fuera del set por defecto — ~70% de la lista SAP (🗄️ reserva):** tesorería, hedge, consolidación de
  grupo, costeo industrial, EWM avanzado, transporte, SuccessFactors, ML/predictive, OpenText. **Es
  corporativo → no entra al set vendible por defecto** (no sobre-scopear, lección del Challenger). **Pero NO
  se descarta: queda en RESERVA** (§6).

**En una línea:** *la pyme AR necesita ~15 scope items de los ~60 de SAP; el micro, ~6 (subió uno tras el
desafío: fiado+stock light). El mapa te asegura que están todos los que necesita y ninguno de los que no —
y los demás (corporativos + 4 reclasificados) quedan guardados, no tirados.*

## 6. 🗄️ Reserva de scope items — nada se tira (decisión del dueño, 2026-07-08)

Los scope items marcados ⛔ **no se descartan: se guardan como RESERVA del catálogo** — un backlog conocido
que se **despierta si un cliente puntual lo necesita**. Es coherente con la promesa de marca (*"si tu modelo
no está, lo solucionamos"*, `FUNDAMENTOS §2`) y con su guardrail:

- **Guardados como definición, no construidos** (definir ≠ construir, ADR-055): la taxonomía SAP completa es
  el **mapa de lo posible**; cada reserva es un `ScopeItem` **documentado pero no instanciado** hasta que haya
  demanda real. No cuesta tokens ni mantenimiento tenerlos en reserva.
- **Cuando un cliente lo pide, decide el guardrail de `FUNDAMENTOS §2`:** ¿lo puede **reusar otro tenant**?
  → se **asciende a producto** (nuevo módulo del catálogo, con su perfil). ¿Es **exclusivo de ese cliente**?
  → **proyecto aparte** cotizado y aislado (nunca contamina el Core compartido).
- **Los que "ya existiesen" en otra forma** (código, plugin, prototipo) también se anotan acá con su estado,
  para no reconstruir lo que ya está (lección MP-13).

**Regla:** la reserva es un **almacén de oportunidad**, no una obligación de construir. Se prioriza por
demanda real (venta concreta, ADR-030), lo cura el **PO del Catálogo/Plugins** y lo desafía el **Analista de
mercado local** antes de ascender cualquiera a producto.

**Reserva ampliada tras el desafío (2026-07-08) — ya no solo lo ⛔ corporativo, también 4 items del set
curado que en teoría "sí son AR pyme" pero no son el dolor que resuelve la venta hoy:**

| Scope | Qué era | Por qué baja a reserva | Se despierta cuando |
|---|---|---|---|
| **J62** | Bienes de uso/amortización | Lo resuelve el software del contador (Tango/Colppy), no el ERP del comercio | un cliente con contador propio integrado lo pide explícitamente |
| **1W0** | Conciliación bancaria por archivo | La pyme AR concilia a mano/Excel con su contador; parsers de formatos bancarios AR son caros para poco valor de venta hoy | un cliente con tesorería más pesada (varias cuentas, alto volumen) lo exige |
| **3W0** | Recepción de depósito | Multi-depósito/multi-sucursal no existe ni a nivel de schema (Challenger ronda 1) — prematuro | el primer cliente con depósito separado del local de venta (ej. distribuidora) |
| **J12** | Registro de horas | Rubro-específico (consultoras/estudios), no universal a pyme | un cliente de servicios profesionales lo pide |

Y **1 item se corta como módulo aparte (CUT, no reserva):** **BFA** (alta de cuentas bancarias) — se
absorbe como campo de configuración del tenant (módulo `localizacion`), no amerita `ScopeItem` propio.

## 5. Gate de cobertura (cómo sabemos que "abarcamos")
Un perfil está **cubierto** cuando **todos** sus scope items del set (arriba) están en estado ✅ *o* con
descriptor de módulo definido y en el backlog priorizado — **no** cuando copiamos la lista entera de SAP.
La **validación** la hacen el **PO del Catálogo/Plugins** (madurez por scope item × perfil) y el **Analista
de mercado local** (¿la pyme AR de verdad lo usa?), y cada tabla nueva que traigan es **§C · Gate 2**
(Data/DBA). Este mapa es el **primer pase (PMO)** más el **desafío del Analista (2026-07-08, ver
`docs/estrategia/desafio-cobertura-2026-07-08.md`)** — el mapa queda **VALIDADO** para construir sobre él.

— Elaborado por GSG (PMO — síntesis) · **Desafiado y validado** por el Analista de mercado local (2026-07-08)
