# Reporte QA End-to-End — CH Estética

- **Fecha:** 2026-07-12 · **Rama:** `qa/ch-estetica-e2e` (worktree aislado) · **Base:** `main` `f716b6c`
- **App en vivo auditada:** `https://chestetica-erp.vercel.app` (front, sin escribir en la agenda real)
- **Método:** front renderizado en Chromium real (Playwright, screenshots), recorrido de los 5 pasos
  de reserva + caminos infelices; backend mapeado y verificado por código + tests; caminos de escritura
  y concurrencia probados contra **base efímera PGlite** (NO se tocó Neon prod, ninguna reserva/factura real).
- **Reglas respetadas:** no se completaron reservas de prueba (nunca se hizo click en "Confirmar" contra
  prod), no se borraron datos, no se emitieron facturas, no se aplicaron migraciones, sin merge, sin deploy.

---

## 1. Veredicto honesto

**CH Estética está en muy buen estado y es entregable, PERO no "redondo" todavía.** No hay bloqueantes
críticos: el núcleo transaccional es sólido (invariantes I1–I7, atomicidad, aislamiento por tenant,
anti-overbooking con transacción Serializable —ahora con test—), la vidriera es elegante y funcional, y
prod está estable. Lo que falta para entregar "sin que el cliente encuentre nada" es una **tanda corta de
pulidos medios/bajos**: validación de contacto en la reserva, un link de menú muerto, touch targets de
mobile por debajo del mínimo, y el preview del equipo que representa mal a la dueña. Ninguno bloquea el
go-live; sí conviene cerrarlos antes de la entrega formal.

- **Bugs críticos:** 0
- **Altos:** 1 · **Medios:** 4 · **Bajos:** 4
- **Perf:** 1 N+1 real encontrado y **corregido** (24→8 queries, no-regresión verificada); resto del
  backoffice ya venía batcheado.

---

## 2. Bugs por severidad

### 🔴 CRÍTICO — ninguno

### 🟠 ALTO

**A1 · La reserva no valida formato de email ni de teléfono → datos de contacto basura en la agenda.**
- **Dónde:** wizard de reserva, paso 4 "Tus datos". `src/app/(site)/_ch/BookingModal.tsx` (canNext solo
  exige `name.trim() && tel.trim()`, L171–178) y server `src/lib/actions.ts` `createBookingFromModal`
  (L435–440, solo chequea no-vacío). No hay regex de email ni sanitización de teléfono en ningún lado
  (ni cliente ni server). El `<input type="email">` no valida porque el modal no es un `<form>` nativo.
- **Repro (verificado en vivo):** paso 4 → Nombre "QA", Teléfono `no-es-tel`, Email `esto-no-es-un-email`
  → el botón **Confirmar queda HABILITADO**. (No se confirmó para no ensuciar prod; la habilitación del
  botón es la prueba.)
- **Impacto:** el negocio es **WhatsApp-first** y manda recordatorios por email/WhatsApp. Un teléfono con
  letras o un email malformado = recordatorio que nunca llega y turno que se pierde. Es el dato operativo
  más importante de la reserva.
- **Fix sugerido (behavior-change → pasar por Gate):** validar en `createBookingFromModal` (server, fuente
  de verdad) que el teléfono tenga N dígitos y, si hay email, que matchee un formato básico; espejar en el
  cliente para feedback inmediato. Evidencia: `shots/16-step4-bad-email.png`.

### 🟡 MEDIO

**M1 · Link de menú "Novedades" muerto en la vidriera pública.**
- **Dónde:** `src/app/(site)/_ch/Header.tsx:41` renderiza el link `/#novedades` **siempre**, pero la
  sección `#novedades` (`src/app/(site)/page.tsx:194`) solo se renderiza `{news.length > 0 && …}`. CH no
  tiene novedades publicadas (últimos 30 días) → la sección no existe en el DOM y el click no lleva a nada.
- **Repro (verificado en vivo):** DOM real → link "Novedades" presente, `#novedades` ausente (0 nodos).
- **Fix:** condicionar el link del Header a que haya novedades (pasar un flag `hasNews`), o renderizar
  siempre la sección con estado vacío. Reversible, código.

**M2 · Touch targets de mobile por debajo de 44px en el flujo de reserva.**
- **Dónde:** modal de reserva en 390px. Botón **"Continuar" = 38.5px** de alto; botón **cerrar (×) =
  12×22px**. `BookingModal.tsx` footer (L620) y botón cerrar (L333).
- **Repro (verificado en vivo, viewport 390×844):** medición de bounding boxes. Evidencia:
  `shots/21-modal-mobile.png`.
- **Impacto:** mobile es el canal primario; el CTA principal del funnel y el cierre del modal son difíciles
  de tocar. Estándar SAP Fiori / WCAG = pisos de 44px (ya son regla en el design system, ADR PR-2/M2).

**M3 · El preview del Equipo representa mal a la dueña (coletazo DX-6).**
- **Dónde:** home, sección Equipo. Se muestran los primeros 4 servicios por id (`p.services…slice(0,4)`).
- **Repro (verificado en vivo):** **Carolina Haponiuk** (dueña, especialista en faciales/estética) aparece
  con "Radiofrecuencia piernas · Exfoliación de espalda y glúteos · Exfoliación de espalda · Exfoliación
  de espalda + glúteos + piernas" — 4 servicios **corporales**, ninguno de su especialidad. Macarena
  (masajes) y Romina (spa de pies) sí se ven coherentes. Evidencia: `shots/30-equipo.png`.
- **Impacto:** la cara del negocio queda mal-especializada en su propio sitio. Es capa de presentación/dato
  (DX-6 quedó "aproximación, no mapeo exacto"): el slice por id no prioriza la especialidad.
- **Fix:** ordenar el preview por categoría/relevancia o curar los servicios destacados por profesional.

**M4 · Sin censo de performance por pantalla de `/admin` (cobertura parcial declarada).**
- No se corrió el timing + conteo de queries render-a-render de cada pantalla de `/admin` (requiere sesión
  autenticada + render de cada página). Se hizo, en cambio, **análisis estático de N+1 de todos los
  loaders** (ver §3): están mayormente batcheados. Queda como recomendación instrumentar el conteo
  (receta en §3) — no es un bug, es una brecha de cobertura que se declara para no mentir "todo medido".

### 🟢 BAJO

**B1 · Formato de hora en 12h "a. m./p. m." en vez de 24h argentino.** Los horarios del paso 3 se
muestran "09:00 a. m. … 01:00 p. m. … 06:30 p. m." (`fmtTime`, `src/lib/datetime.ts:100`, `es-AR` sin
`hourCycle`). En Argentina se usa 24h ("13:00", "18:30"). Argentinización (ADR-044/046). Evidencia:
`shots/14-step3-slot-selected.png`. Fix: `hour12: false` / `hourCycle: 'h23'`.

**B2 · Refrescar en el paso 4 pierde todo el progreso.** El wizard vive en memoria; F5 cierra el modal y
reinicia desde cero (sin deep-link/persistencia). Verificado en vivo. UX menor; aceptable pero mejorable.

**B3 · Posible Cliente duplicado por doble-submit concurrente.** `createBookingFromModal` hace
`client.findFirst({where:{phone}})`→create **fuera** de la transacción de reserva. Dos requests
simultáneos del mismo teléfono nuevo pueden crear 2 filas `Client` (la 2ª reserva igual falla por slot,
pero el cliente queda duplicado). Higiene de datos. Fix: upsert idempotente por `(tenantId, phone)`.

**B4 · N+1 menor de escritura en ajuste de stock.** `src/lib/stock/adjustment-insert.ts:65` hace
`tx.product.findUnique` por línea del recuento. Es submit (no page-load) y acotado a las líneas. Batcheable
con un `findMany({ where: { id: { in } } })`. Baja prioridad.

---

## 3. Performance

### ✅ CORREGIDO — N+1 en `findSlotsForWaitlistEntry` (lista de espera)
- **Antes:** buscar huecos para un anotado "sin profesional fijo" llamaba `getAvailableSlots` **por
  profesional** → ~8 queries × N. Misma anti-pattern que el fix de la agenda (98→7), en la dimensión
  profesional. `src/lib/waitlist-actions.ts:157`.
- **Después:** nuevo `getAvailableSlotsForProfessionals` (`src/lib/actions.ts`) lee los datos compartidos
  (servicio + recursos) una vez y trae turnos/bloqueos/horarios de TODOS los profesionales con un predicado
  `IN`, repartiendo por profesional en memoria con **los mismos predicados**.
- **Medición (PGlite, 3 profesionales / 1 servicio, escenario real):**

  | | Queries al motor | Escala |
  |---|---|---|
  | Viejo (`getAvailableSlots` × N) | **24** | 8·N |
  | Nuevo (batch) | **8** | constante |

  **3× menos con 3 profesionales; O(1) en cantidad de profesionales.** Franjas por profesional
  **IDÉNTICAS** (no-regresión verificada contra el motor real, no simulada).
- **Riesgo:** cero cambio de comportamiento del funnel de reserva (el batch reusa la lógica pura
  `generateSlotsForDays` ya testeada). tsc + 976 tests verdes.

### Resto del backoffice — ya batcheado (análisis estático de todos los loaders)
- `getAgendaDay`, `getDashboardData`, `getClients` (usa `_count`), reportes, cuentas a cobrar/pagar
  (`groupBy`), inventario, libro IVA, etc.: todos leen en 1–4 queries batcheadas y reducen en memoria. Varios
  llevan comentarios citando fixes previos (ADR-023 F3/F5). **No se encontró N+1 de page-load** además del
  de waitlist (ya corregido). Candidatos menores de write-loop: B4 (arriba) y emisión por movimiento bancario
  (`bancos-glue.ts:556`, secuencial por idempotencia, baja prioridad).
- **No hay instrumentación de conteo de queries** en el repo. Para el censo por pantalla que pediste:
  instanciar el cliente con `log:[{emit:'event',level:'query'}]` + `$on('query')` por request (AsyncLocalStorage
  ya existe vía `tenant-context.ts`). **Ojo al medir:** con `RLS_ENFORCEMENT=on` cada query suelta se envuelve
  en `BEGIN`+`set_config`+query+`COMMIT` (≈2–4 round-trips por query lógica) → fijá y anotá el estado del flag.

---

## 4. Tests nuevos (verdes)

- **`src/lib/booking-concurrency.test.ts` (6 tests):** cierra el hueco de cobertura del motor de turnos —
  no había test de la carrera de dos reservas del mismo hueco (doble-click / dos clientes). Reusa las guardas
  reales (`withBuffer` + `hasOverlap` + `BUFFER_MIN`) y modela el retry Serializable de `bookingTransaction`.
  Prueba: sin serializable → overbooking; con serializable → una gana y la otra se rechaza (nunca doble
  turno); el buffer separa turnos pegados; con el aire justo de buffer el segundo entra.
- **Harness de no-regresión + medición del N+1** (PGlite, efímero) usado para validar la optimización;
  archivado fuera del repo (scratchpad) por ser one-off. Números en §3.
- **Suite completa:** `tsc` limpio + **976 tests verdes** (+6).

---

## 5. Qué se verificó y quedó SANO (para que conste)

- **Motor de turnos:** solapes (bordes estrictos), buffer de 10 min, box exclusivo (cap 1), recursos
  compartidos con cupo (G17), horarios de trabajo y bloqueos de profesional/box — todo en `assertSlotAvailable`
  (único lugar de la regla de choque). Los **4 caminos de escritura** (alta, reprogramar panel, reprogramar
  cliente, desde lista de espera) envuelven en `bookingTransaction` (Serializable + retry) → **anti-overbooking
  consistente**. Concurrencia de "dos personas, mismo turno": una gana, la otra recibe "ese horario ya no está
  disponible".
- **Invariantes I1–I7 (ADR-064):** I2 (comprobante↔venta 1:1, `@@unique([tenantId, orderId/appointmentId])` +
  `createInvoice` idempotente) e I7 (venta contado atómica, `cash-sale.ts` en la tx del llamador) con
  test-gates propios. Verdes.
- **Caja:** aritmética pura separada (`cash-register.ts`); el arqueo (`reconcileCash`) computa
  `diff = contado − esperado`, la apertura no se doble-cuenta, y el descuadre se **congela y audita** en el
  cierre (no bloquea, queda como hecho auditable). Cuadra.
- **Cuenta corriente (fiado):** saldo = `amount − Σ Collection(RECEIVABLE)`, **fuente de verdad computada, sin
  doble conteo** (lección M1 respetada); cobros concurrentes no sobre-cobran (Serializable + retry).
- **Crons (recordatorios + ARCA outbox):** aislamiento por tenant correcto (barrido cross-tenant con cliente
  operador + `tenantTransaction({tenantId})` explícito por ítem); gate de regresión
  `verify-async-tenant-isolation.mts`. El gap histórico estaba cerrado (`1036b2c`).
- **Front:** vidriera desktop+mobile renderiza on-brand, catálogo real completo por categoría con precios; los
  5 pasos del wizard funcionan; estados de vacío ("No hay horarios disponibles ese día"), carga y error
  presentes; el modal atrapa foco y cierra con Escape; sin errores de consola/red; el paso 3 (prefetch de 14
  días) tarda ~1.3–1.9s la 1ª vez y es instantáneo al cambiar de día (cache). 0 imágenes rotas.

---

## 6. Recomendación de cierre

Entregable **SÍ**, con esta tanda antes de la entrega formal (todos reversibles, ninguno toca prod/DB):
1. A1 — validación de email/teléfono en la reserva (pasa por Gate por ser behavior-change).
2. M1 — link "Novedades" condicional.
3. M2 — touch targets 44px en el modal (mobile).
4. M3 — preview del equipo (que Carolina muestre faciales).
5. B1 — hora 24h.

Lo demás (B2–B4, M4) es mejora incremental post-entrega. El N+1 de waitlist ya quedó corregido y testeado.

— Elaborado por GSG (QA / Probador interactivo)
