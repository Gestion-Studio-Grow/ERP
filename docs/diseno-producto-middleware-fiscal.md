# Diseño de producto — Middleware fiscal (cliente del contador ↔ contador)

**Estado:** documento vivo (v1, 2026-07-04) — se completa a lo largo de la sesión y
con lo que vuelva de la reunión con el contador. **Uso interno.**
**Qué resuelve:** el hueco del mercado identificado en
`docs/decision-facturador-cual-construir.md` — nadie es dueño del camino completo
*el negocio opera → factura → el contador recibe la info ordenada*. Este documento
diseña esa pieza.

> **No es un sistema nuevo.** Es **una ventana y unos adaptadores** sobre el Core
> multi-tenant que ya tenemos. El "libro" es la misma tabla de comprobantes del
> Core, mostrada con dos lentes: operativa (cliente) y fiscal (contador).

---

## 1. Idea en una frase

Un **libro fiscal único, ordenado y validado** por cada cliente del contador, que
se llena solo (desde ARCA y desde la operación del negocio) y se entrega al contador
en el formato de **su** sistema. El middleware es lo que convierte la realidad
desordenada del cliente en un dato que el contador consume sin re-cargar nada.

## 2. Actores

| Actor | Qué hace | Qué gana |
|---|---|---|
| **Cliente del contador** (el negocio) | Opera y factura en nuestro sistema; carga lo que ARCA no tiene (foto/WhatsApp) | Facturación sin fricción + no le rebota el contador |
| **Contador / estudio** | Recibe todo ordenado y exportado a su sistema; revisa y confirma | Menos horas de carga; clientes más ordenados |
| **Nosotros** | Dueños del libro normalizado + los conectores (ARCA in/out) + los adaptadores de salida | Producto pegajoso + canal de distribución (el contador) |

## 3. Arquitectura funcional — tres planos

### Plano A — Ingesta (cómo entra la info), por orden de esfuerzo
1. **Facturas emitidas por el cliente** → ya salen de nuestro Core vía **Plugin ARCA**
   (emisión + CAE). Estructurado desde el origen, cero fricción.
2. **"Mis Comprobantes" de ARCA** → bajamos por API todo lo que el CUIT emitió y
   recibió (servicio Mis Comprobantes, vía AfipSDK/TusFacturas). **El cliente no sube
   nada.** Cubre ~70-80% del volumen. *Verificado: la API existe y filtra emitidos/
   recibidos por rango de fechas.*
3. **Última milla** (tickets, gastos sin factura electrónica) → el cliente saca foto /
   manda por WhatsApp → OCR + IA extrae los datos. Solo para lo que ARCA no tiene.

### Plano B — Normalización (el corazón, lo único difícil de verdad)
Todo lo que entra cae a **un modelo canónico único** y pasa por cuatro pasos:
- **Formato único** — ver §4 (el comprobante normalizado).
- **Deduplicación** — la foto del cliente y lo bajado de ARCA pueden ser el mismo
  comprobante → regla de identidad (ver §6, decisión abierta) para no contar doble.
- **Validación** — CAE válido, CUIT existente (contra padrón ARCA), totales
  consistentes.
- **Clasificación** — la IA sugiere categoría contable; el contador confirma/corrige.
  Estado de cada comprobante: `pendiente` → `validado` → `observado`.

### Plano C — Entrega (cómo lo recibe el contador)
- **Panel multi-cliente**: el contador ve todos sus clientes de un vistazo — quién
  está completo, a quién le falta, qué está observado.
- **Exportación a su sistema**: adaptador por destino (Xubio, SOS-Contador, Bejerman)
  o Excel/CSV del libro IVA. *Integrar, no reemplazar.*
- **Cierre de período**: el mes se marca cerrado y el contador lo baja/empuja.

```
  INGESTA                     NORMALIZACIÓN                 ENTREGA
  Emitidas (Core+ARCA) ─┐     ┌─────────────────┐          ┌─ Panel multi-cliente
  Mis Comprobantes ─────┼────▶│ Libro canónico  │─────────▶┼─ Export a SU sistema
  (ARCA, gratis)        │     │ dedup+valida+IA │          └─ Cierre de mes
  Foto/WhatsApp ────────┘     └─────────────────┘
```

## 4. El comprobante normalizado (modelo conceptual)

El dato que unifica todo. Campos mínimos:
- Identidad fiscal: tipo (A/B/C/M/E, NC/ND), punto de venta, número, fecha, CAE.
- Partes: CUIT emisor, CUIT receptor.
- Montos: neto gravado, IVA **discriminado por alícuota** (21/10,5/27…), percepciones,
  no gravado, total.
- Clasificación: categoría contable (sugerida por IA, confirmada por contador).
- Origen: `emitido-core` / `arca-mis-comprobantes` / `captura-cliente`.
- Estado: `pendiente` / `validado` / `observado`.

**Decisión de diseño:** esto **reusa la tabla de comprobantes del Core**, con un
read-model fiscal encima — no una base de datos nueva (ver §6).

## 5. Encaje con nuestra arquitectura (por qué nos calza)

- **Contador = organización; cada cliente = un tenant.** Es literalmente ADR-001
  (multi-tenant con aislamiento) + una jerarquía org→tenants. Sube la prioridad de
  **provisioning en lote** (hoy inexistente).
- **ARCA sirve en dos direcciones** con el mismo conector: destino (emitir → CAE,
  Plugin ARCA de Fase 2) y fuente (bajar Mis Comprobantes). Un solo proveedor
  (AfipSDK/TusFacturas) resuelve ambas.
- El middleware es **read-model + adaptadores** sobre el Core: no reescribimos nada.

## 6. Decisiones abiertas (van al ADR de la sesión de arquitectura)

1. **Conector ARCA:** alquilar AfipSDK/TusFacturas para MVP (recomendado) vs WS
   propios. Cierra también la Fase 2 del piloto.
2. **Formato de exportación #1:** lo define la reunión con el contador (su sistema).
3. **Libro canónico:** read-model sobre la tabla del Core (recomendado) vs tabla
   nueva.
4. **Regla de deduplicación:** identidad = ¿CUIT emisor + tipo + PDV + número? ¿+
   monto/fecha como respaldo? Es la regla más delicada — define que no se cuente doble.
5. **Jerarquía de tenants + provisioning en lote:** cómo se modela org-de-contador →
   N tenants-cliente y cómo se dan de alta en masa.

## 7. MVP (el slice más fino que prueba el valor)

1. Un contador, 3-4 clientes suyos (los del piloto de la reunión).
2. Conectar sus CUIT → **bajar Mis Comprobantes de ARCA** (emitidos + recibidos).
3. Normalizar → entregar **ordenado en el formato de su sistema** (Excel del libro IVA
   como piso).
4. Métrica de éxito: *"esto me ahorra X horas / lo pagaría"*.
5. **Sin OCR/foto todavía** — esa capa se agrega recién si el MVP valida.

## 8. Riesgos

- **Foco:** es un 2º modelo de negocio sobre un piloto que aún no cerró Fase 2 —
  gate de validación (reunión) antes de construir.
- **Confianza del contador:** si la info llega con errores, no la usa. La validación
  contra ARCA (§3.B) es lo que sostiene la confianza.
- **Dependencia del proveedor ARCA:** mitigable porque el conector es una pieza
  reemplazable detrás del contrato del Plugin.
- **Normativa cambiante:** por eso alquilamos el conector (el proveedor mantiene los
  cambios), no lo construimos al inicio.

## 9. Pendiente de completar (próximas iteraciones de este doc)

- [ ] Bosquejo del panel del contador (qué ve en la primera pantalla).
- [ ] Formato exacto del libro IVA de exportación (tras saber el sistema del contador).
- [ ] Flujo de la captura por WhatsApp/foto (cuando se active esa capa).
- [ ] Modelo de precios / cómo se cobra (al cliente, al estudio, comisión).
