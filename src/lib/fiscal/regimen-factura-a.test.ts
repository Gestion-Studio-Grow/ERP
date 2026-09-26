// Qué Factura A le asignó ARCA (regimen-factura-a.ts) frente a la purga de auditoría de 18 meses.
// Refutador 26/09: con `entity: "Tenant"` la purga borraba la fila y el Responsable Inscripto volvía
// a «sin cargar» sin aviso (toda Factura A a revisión). Se EJECUTA la purga real contra un doble que
// aplica su `where` y se mira qué clase queda vigente.

import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeAuditLogs } from "@/lib/audit-retention";
import { ACCION_REGIMEN_FACTURA_A, ENTIDAD_REGIMEN_FACTURA_A, regimenVigente } from "./regimen-factura-a";

interface FilaDeAuditoria {
  entity: string;
  action: string;
  actor: string;
  changes: unknown;
  createdAt: Date;
}
type WhereDePurga = { createdAt: { lt: Date }; entity: { notIn: string[] } };

/** Un AuditLog en memoria que aplica el `where` de la purga tal como lo arma purgeAuditLogs. */
function auditoriaEnMemoria(filas: FilaDeAuditoria[]) {
  let quedan = [...filas];
  const alcanza = (w: WhereDePurga) => (f: FilaDeAuditoria) => f.createdAt < w.createdAt.lt && !w.entity.notIn.includes(f.entity);
  return {
    quedan: () => quedan,
    cliente: {
      auditLog: {
        count: async ({ where }: { where: WhereDePurga }) => quedan.filter(alcanza(where)).length,
        deleteMany: async ({ where }: { where: WhereDePurga }) => {
          const antes = quedan.length;
          quedan = quedan.filter((f) => !alcanza(where)(f));
          return { count: antes - quedan.length };
        },
      },
    },
  };
}

test("la purga de 18 meses no borra qué Factura A asignó ARCA: el inscripto sigue con su «A común»", async () => {
  const hace19Meses = new Date();
  hace19Meses.setMonth(hace19Meses.getMonth() - 19);
  const base = auditoriaEnMemoria([
    { entity: ENTIDAD_REGIMEN_FACTURA_A, action: ACCION_REGIMEN_FACTURA_A, actor: "operator:soporte", changes: { regimen: "A" }, createdAt: hace19Meses },
    { entity: "Invoice", action: "invoice.create", actor: "user:u1", changes: {}, createdAt: hace19Meses },
  ]);
  assert.equal(regimenVigente(base.quedan()), "A", "antes de la purga");
  const r = await purgeAuditLogs(base.cliente as unknown as Parameters<typeof purgeAuditLogs>[0], { dryRun: false });
  assert.equal(r.affected, 1, "la fila vieja de otra entidad sí se purga");
  assert.equal(regimenVigente(base.quedan()), "A", "después de la purga sigue cargada");
});

test("la entidad del dato es propia: no es «Tenant» (que la purga sí borra)", () => {
  assert.notEqual(ENTIDAD_REGIMEN_FACTURA_A, "Tenant");
});
