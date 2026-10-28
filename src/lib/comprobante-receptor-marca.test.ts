import { test } from "node:test";
import assert from "node:assert/strict";
import { ENTIDAD_RECEPTOR_DEL_COMPROBANTE } from "./comprobante-receptor-marca";
import { PURGE_EXEMPT_ENTITIES } from "./audit-retention";
import { ENTIDADES_FUERA_DE_LA_AUDITORIA } from "@/app/admin/(dashboard)/auditoria/filtros";

// La copia del comprador vive en AuditLog como almacén (SEC-5): ni la purga de 18 meses la borra
// (el PDF de una factura vieja saldría sin comprador) ni el panel de Auditoría la muestra.
test("la copia del comprador no se purga ni sale en la Auditoría del panel", () => {
  assert.ok(PURGE_EXEMPT_ENTITIES.includes(ENTIDAD_RECEPTOR_DEL_COMPROBANTE));
  assert.ok(ENTIDADES_FUERA_DE_LA_AUDITORIA.includes(ENTIDAD_RECEPTOR_DEL_COMPROBANTE));
  assert.notEqual(ENTIDAD_RECEPTOR_DEL_COMPROBANTE, "Invoice", "entidad propia: no se mezcla con el rastro de las facturas");
});
