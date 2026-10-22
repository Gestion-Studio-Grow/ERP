# Pedidos al motor de facturación — desde la consola del contador

**Quién pide:** frente «Consola del contador» (rama `claude/facturacion-automatica-contador`).
**A quién:** el frente que reescribe el motor (`src/lib/facturacion/**`, `src/lib/invoice-core.ts`,
`src/lib/arca-*.ts`, `src/plugins/arca/**`, `src/lib/fiscal/**`, `prisma/**`).
**Regla:** la consola NO tocó nada de eso. Consume las APIs de hoy y, donde falta algo, usa un
adaptador local en `src/lib/cartera-abonos.ts` / `src/app/contador/`. Cada pedido dice la firma
que necesitamos y qué adaptador se cae cuando exista.

Estado de cada pedido: **abierto** hasta que el motor lo cierre y el adaptador se borre.

---

## 1. Emitir una nota de crédito asociada (abierto · prioridad ALTA)

**Para qué:** Débora anula facturas autorizadas (abono mal cargado, cliente que no pagó un
servicio no prestado). Hoy la decisión fiscal (`decidir-comprobante.ts`) sabe de NC, la lista las
resta y el schema tiene `Invoice.comprobanteAsociadoId`, pero **ningún camino las crea**:
`CreateInvoiceInput` no lleva el comprobante asociado.

**Firma pedida:**

```ts
// src/lib/invoice-core.ts (o el módulo que lo reemplace)
export async function crearNotaDeCreditoInTx(
  tx: InvoiceTx,
  input: {
    tenantId: string;
    facturaId: string;        // la AUTORIZADA que se anula (mismo tenant, por la FK compuesta)
    importe?: number;         // total a anular; sin él, el saldo que queda por anular
    motivo: string;           // queda en la auditoría
    fecha: string;            // AAAAMMDD del día
  },
): Promise<{ ok: true; invoiceId: string } | { ok: false; error: string }>; // error en criollo
```

Que valide con `decidirComprobante` (saldo por anular, misma letra, mismo receptor) y encole el
envío por el outbox como cualquier factura. **Adaptador hoy:** ninguno — la consola explica cómo
anular desde el panel del cliente o desde ARCA (`comprobantes/page.tsx`).

## 2. Origen «abono» con idempotencia en la base (abierto · prioridad MEDIA)

**Para qué:** que (regla, mes) no pueda dar dos facturas aunque alguien llame al motor por otro
camino. Hoy la idempotencia la pone la consola: candado `pg_advisory_xact_lock` + fila de
auditoría `cartera.abono.emitido` en la MISMA transacción del cliente que crea la factura
(`src/lib/cartera-abonos.ts → emitirUna`). Es correcta, pero vive fuera del motor.

**Firma pedida:** un tipo de origen nuevo en `InvoiceOrigin`:

```ts
type InvoiceOrigin = … | { type: "ABONO"; id: `${reglaId}:${mes}` };
// + columna Invoice.abonoClave String? con @@unique([tenantId, abonoClave])  → migración (Gate 2)
```

Con eso `createInvoiceInTx` devuelve la existente y `reabrirSiRechazada` resuelve «volver a
emitir». **Se cae:** `emisionesPreviasEnTx` y las filas `cartera.abono.emitido`.

## 3. Tabla `ReglaFacturacion` (abierto · prioridad MEDIA · migración = Gate 2)

**Para qué:** las reglas de abono hoy se guardan como versiones en `AuditLog` del estudio
(`cartera.abono.guardado` / `cartera.abono.baja`). Funciona y es auditable, pero no se puede
consultar con índices ni la puede leer el cliente desde su panel.

```prisma
model ReglaFacturacion {
  id               String   @id @default(cuid())
  tenantId         String   // el ESTUDIO (RLS por tenantId, como CarteraCliente)
  clienteTenantId  String
  receptorNombre   String
  receptorDocTipo  Int      // 80 / 96 / 99
  receptorDocNro   String?
  receptorCondicionIva String
  descripcion      String
  importe          Decimal  @db.Decimal(14, 2)
  concepto         Int      // 1 productos, 2 servicios
  desde            String   // AAAA-MM
  hasta            String?
  diasVencimiento  Int      @default(10)
  estado           String   @default("activa") // activa | baja
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt
  @@index([tenantId, clienteTenantId])
}
```

**Se cae:** `leerReglasDelEstudio` / `guardarReglaDelEstudio` / `darDeBajaReglaDelEstudio` pasan
a la tabla (la forma `ReglaAbono` de `abonos-core.ts` no cambia).

## 4. Abonos de responsable inscripto (abierto · prioridad MEDIA)

**Para qué:** hoy un RI no puede tener abono: `calcularImpuestos` aplica tasa pareja y el plugin
no deja emitir A/B sin `ivaPorProducto` (ENG-024). La regla podría declarar su alícuota.

**Firma pedida:** que `CreateInvoiceInput` acepte el IVA declarado por renglón para un comprobante
sin productos (por ejemplo, `renglones: { total: number; alicuotaIva: number }[]`) y lo pase por
`calcularImpuestosPorAlicuota`, con `ivaPorProducto: true`. **Adaptador hoy:** el lote muestra
la regla de un RI como «Frenado» con el motivo; nunca la emite.

## 5. Descripción del comprobante (abierto · prioridad BAJA)

El abono tiene «qué se factura» («Honorarios de octubre») pero el comprobante no guarda una
descripción, así que el PDF no la muestra. Pedido: `CreateInvoiceInput.descripcion?: string`
persistida (para el PDF y el CSV). Hoy queda sólo en la auditoría de la emisión.

## 6. Contar pendientes de un negocio (abierto · prioridad BAJA)

`mandarPendientesDelCliente` cuenta los `PENDING` con su propia consulta, igual que
`contarPendientes` (privada de `facturacion-actions.ts`, que es "use server" y usa el tenant de la
sesión). Pedido: exportar `contarPendientesDelNegocio(tenantId)` desde `arca-dispatch.ts` o
`lista.server.ts` para que haya una sola cuenta.

— Elaborado por GSG
