# Pase de seguridad acotado — 2026-07-05

**Squad:** Calidad & Confiabilidad (SDET/reliability) · rama `frente/calidad`
**Alcance:** código agregado en los últimos ~10 commits (`git log --oneline -20`, ventana `d395fc5..HEAD` + revisión de `external-orders.ts`/`order-core.ts` tocados por el descuento de stock del POS).
**Ejes revisados:** scoping por tenant en queries (multi-tenant), validación de input, secretos hardcodeados, manejo de errores que filtre datos.

> Restricciones de propiedad respetadas: NO se tocó `src/plugins/arca/afip/*` ni el módulo de caja del POS (no existe módulo de caja aún). Fixes aplicados solo sobre archivos propios y de bajo riesgo.

---

## Resumen

La superficie nueva está, en general, **limpia y bien scopeada por tenant**. `getReportData` (ADR-023 F3)
quedó correctamente acotado (agrega `tenantId` + rango obligatorio + `select` acotado) y valida el input
`?dias=` contra una allowlist. La API pública de pedidos externos valida el body de forma estricta en el
borde y resuelve el tenant fail-closed vía api-key. La retención de AuditLog es platform-wide por diseño.

Se encontró **un (1) hallazgo real de severidad ALTA**: un descuento de stock duplicado y sin guarda
anti-oversell en la ingesta de pedidos externos, introducido como regresión por el commit `d48cc79`.
**Se corrigió** (bajo riesgo, archivo propio). El resto son observaciones menores/defensivas.

---

## Tabla de hallazgos

| # | Sev | Archivo | Hallazgo | Recomendación | ¿Arreglado? |
|---|-----|---------|----------|---------------|-------------|
| 1 | **Alta** | `src/lib/external-orders.ts` (`decrementStock`, `createExternalOrder`) | **Doble descuento de stock + oversell.** `insertOrder` ya descuenta stock de los productos `trackStock` con guarda atómica `stock >= qty` (commit d48cc79). `createExternalOrder` volvía a descontar vía `decrementStock`: (a) baja el stock **dos veces** en pedidos externos; (b) usa `decrement` **sin** guarda `gte` → puede dejar **stock negativo** (oversell), justo lo que d48cc79 cerró; (c) el `update` filtra **solo por `id`, sin `tenantId`** en el WHERE (con RLS OFF en prod, no scopeado a nivel DB — no explotable hoy porque el id ya viene de una query tenant-scopeada, pero rompe defensa en profundidad). | Eliminar el descuento redundante: `insertOrder` es la única fuente de verdad del stock. | **Sí** — se eliminó `decrementStock` y su llamada; la ingesta externa hereda el descuento correcto (con guarda) de `insertOrder`. Test de regresión indirecto vía `order-core.test.ts` (`canDecrementStock`, `stockDecrementLines`). |
| 2 | Baja | `src/lib/order-core.ts` (`insertOrder`, `tx.product.updateMany`) | El `updateMany` del descuento de stock **sí** incluye `tenantId` en el WHERE (correcto). Observación defensiva: la creación de la orden y sus `items` escriben `tenantId` explícito en cada fila — consistente. Sin acción. | Ninguna. Patrón correcto; se documenta como referencia. | N/A (limpio) |
| 3 | Info | `src/app/api/public/v1/orders/route.ts` (`errorResponse`) | El discriminado de errores del Core al cliente usa un regex sobre `err.message` (`/producto\|dirección\|item\|precio/i`) para decidir 400 vs 500. Los mensajes del Core son de negocio (no filtran secretos ni stack), y los errores inesperados caen a `"Error interno."` con el detalle solo en `console.error`. No filtra datos sensibles. | Aceptable. A futuro, migrar a errores tipados (clase de error de dominio) en vez de matchear por texto, para no acoplar el código de estado a la redacción del mensaje. | No (no es un defecto de seguridad; nota de robustez) |
| 4 | Info | `src/lib/actions.ts` (`getReportData`) | Query correctamente scopeada: `tenantId` + `status:"APPROVED"` + `createdAt` en rango obligatorio + `select` acotado (no `include` completo). Cierra el escaneo del histórico y no sobre-trae columnas. | Ninguna. | N/A (limpio) |
| 5 | Info | `src/lib/audit-retention.ts` + `scripts/purge-audit-logs.ts` | La purga es **platform-wide** (sin `tenantId`) **por diseño** (mantenimiento de plataforma, documentado). Default dry-run; el borrado real exige `--apply`. `--months` validado (`> 0`). No corre desde el runtime. Sin secretos. | Ninguna. | N/A (limpio) |
| 6 | Info | `src/lib/external-orders.ts` (`parseExternalOrder`) | Validación de input estricta en el borde no confiable: `customer.name/phone` obligatorios, `items` no vacío, `quantity` finita `> 0`, `method` contra allowlist, trims + normalización. Buen patrón fail-closed. | Ninguna. | N/A (limpio) |

**Secretos hardcodeados:** no se encontraron. Las claves/URLs se leen de `process.env` (`DATABASE_URL`, adapter PG). La auth de la API pública es por api-key resuelta en `public-api-auth` (fuera del alcance modificado).

**Manejo de errores que filtre datos:** no se encontró filtración. Los `console.error` del server (best-effort de facturación, error inesperado del endpoint) loguean detalle server-side; al cliente solo va mensaje genérico o de negocio.

---

## Bug real encontrado por el pase (detalle del #1)

- **Origen:** `decrementStock` se agregó en `ebba8b5` (ingesta externa). Después, `d48cc79` agregó el
  descuento de stock **dentro** de `insertOrder` (con la guarda anti-oversell). Como `createExternalOrder`
  llama a `insertOrder` **y además** a `decrementStock`, el commit `d48cc79` convirtió al segundo en una
  regresión: doble baja de stock para todo pedido externo y una vía de oversell (stock negativo).
- **Impacto:** stock incorrecto (descontado el doble) y posibilidad de stock negativo en productos vendidos
  por la API externa. Afecta la confiabilidad del inventario del vertical retail (carnicería/verdulería/etc.).
- **Fix aplicado (bajo riesgo, archivo propio, no pisa a otro squad):** se eliminó `decrementStock` y su
  invocación. La ingesta externa ahora hereda el descuento único y correcto de `insertOrder` (solo productos
  `trackStock`, con guarda `stock >= qty`). Commit aparte: `fix(pos): ...`.
- **Verificación:** `npx tsc --noEmit` OK · `npm test` 63/63 OK.
