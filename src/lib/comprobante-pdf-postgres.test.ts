// Comprobante impreso (R3-F1) contra un Postgres real con RLS: sólo el negocio dueño lee su
// comprobante. El de otro negocio da lo mismo que un id que no existe (no se puede inferir que
// existe), aunque el código pida el negocio equivocado. Base efímera: src/test/base-efimera.ts.
import { test } from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import { apuntarLaAppA, baseEfimeraDelArchivo, type BaseEfimera } from "@/test/base-efimera";
import { runInTenantContext } from "@/lib/tenant-context";
import type { DatosComprobanteImpreso } from "@/lib/comprobante-pdf";

const laBase = baseEfimeraDelArchivo();

async function comoDuenio(base: BaseEfimera, sql: string, params: unknown[] = []): Promise<void> {
  const c = new pg.Client({ connectionString: base.urlDuenio });
  await c.connect();
  try {
    await c.query(sql, params);
  } finally {
    await c.end();
  }
}

async function datosFiscales(base: BaseEfimera, tenantId: string, cuit: string, razonSocial: string): Promise<void> {
  await comoDuenio(
    base,
    `UPDATE "Tenant" SET "arcaCuit" = $2, "arcaRazonSocial" = $3, "arcaCondicionIva" = 'RESPONSABLE_INSCRIPTO',
            "arcaDomicilioFiscal" = $4, "arcaInicioActividades" = '20200301', "arcaIibb" = $5, "arcaHomologacion" = false
      WHERE id = $1`,
    [tenantId, cuit, razonSocial, `Domicilio de ${razonSocial}`, `IIBB de ${razonSocial}`],
  );
}

let secuencia = 0;
/** Una factura B autorizada `horasAtras` horas atrás (con CAE ya no se puede editar: se crea así). */
async function facturaAutorizada(base: BaseEfimera, tenantId: string, orderId: string | null, horasAtras = 0): Promise<string> {
  secuencia += 1;
  const id = `fac_r3f1_${secuencia}_${Math.random().toString(16).slice(2, 8)}`;
  await comoDuenio(
    base,
    `INSERT INTO "Invoice" (id, "tenantId", "puntoVenta", "tipoComprobante", concepto, "docTipo", "docNro", fecha,
                            neto, iva, total, "ivaDesglose", status, cae, "caeVencimiento", numero,
                            "updatedAt", "authorizedAt", "orderId", "createdAt")
     VALUES ($1, $2, 1, 6, 1, 99, '0', '20260924', 1000.00, 210.00, 1210.00,
             '[{"alicuotaId":5,"base":1000,"importe":210}]'::jsonb, 'AUTHORIZED', $3, '20261004', $4,
             now(), now() - make_interval(hours => $6::int), $5, now() - make_interval(hours => $6::int))`,
    [id, tenantId, `7654321098765${secuencia}`, 100 + secuencia, orderId, horasAtras],
  );
  return id;
}

test("sólo el negocio dueño lee su comprobante: el de otro negocio no existe para él (RLS + tenantId)", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  Object.assign(process.env, { DB_CONNECTION_LIMIT: "2", DB_CONNECT_TIMEOUT_MS: "3000" });

  await datosFiscales(base, base.a.id, "20123456786", "Negocio A SRL");
  await datosFiscales(base, base.b.id, "30712345671", "Negocio B SA");
  const deA = await facturaAutorizada(base, base.a.id, base.a.pedidos[0]);
  const deB = await facturaAutorizada(base, base.b.id, null);

  const { leerComprobanteImpreso } = await import("@/lib/comprobante-pdf-datos");
  const { generarComprobantePdf } = await import("@/lib/comprobante-pdf");

  // El dueño ve el suyo, con sus datos, y sale el PDF.
  const propio = await runInTenantContext(base.a.id, () => leerComprobanteImpreso(deA, base.a.id));
  assert.ok(propio, "A lee su propio comprobante");
  assert.equal(propio.emisor.razonSocial, "Negocio A SRL");
  assert.equal(propio.emisor.cuit, "20123456786");
  assert.equal(propio.total, 1210);
  assert.equal(propio.cae, "76543210987651");
  const impreso = await generarComprobantePdf(propio);
  assert.ok(impreso.ok, impreso.ok ? "" : impreso.faltantes.map((f) => f.campo).join(", "));

  // El de B, visto desde A: lo mismo que un id que no existe.
  const inexistente = await runInTenantContext(base.a.id, () => leerComprobanteImpreso("fac_que_no_existe", base.a.id));
  const ajeno = await runInTenantContext(base.a.id, () => leerComprobanteImpreso(deB, base.a.id));
  assert.equal(inexistente, null);
  assert.equal(ajeno, null, "A no puede leer ni inferir el comprobante de B");

  // Aunque el código pida el negocio equivocado, con A puesto en la transacción RLS no lo deja ver.
  const confundido = await runInTenantContext(base.a.id, () => leerComprobanteImpreso(deB, base.b.id));
  assert.equal(confundido, null, "el negocio del pedido manda, no el parámetro");

  // B sí ve el suyo, con los datos de B (y nunca los de A).
  const deBVisto = await runInTenantContext(base.b.id, () => leerComprobanteImpreso(deB, base.b.id));
  assert.equal(deBVisto?.emisor.razonSocial, "Negocio B SA");
  assert.equal(await runInTenantContext(base.b.id, () => leerComprobanteImpreso(deA, base.b.id)), null);
});

test("el detalle impreso siempre suma el total autorizado", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  await datosFiscales(base, base.a.id, "20123456786", "Negocio A SRL");
  const sinOrigen = await facturaAutorizada(base, base.a.id, null);
  const conVenta = await facturaAutorizada(base, base.a.id, base.a.pedidos[1]);
  const { leerComprobanteImpreso } = await import("@/lib/comprobante-pdf-datos");
  const { sumarAlCentavo } = await import("@/lib/dinero/redondeo");
  for (const id of [sinOrigen, conVenta]) {
    const leer = (): Promise<DatosComprobanteImpreso | null> => leerComprobanteImpreso(id, base.a.id);
    const d: DatosComprobanteImpreso | null = await runInTenantContext(base.a.id, leer);
    assert.ok(d);
    assert.equal(sumarAlCentavo(d.renglones.map((r) => r.importe)), d.total, `el detalle de ${id} cierra con el total`);
  }
});

/** Lo que deja el pase a real (o la vuelta a pruebas) en AuditLog, `horas` para atrás. */
async function cambioDeAmbiente(base: BaseEfimera, tenantId: string, horas: number, aPrueba: boolean): Promise<void> {
  const changes = { accion: aPrueba ? "volver-a-pruebas" : "pasar-a-real", arcaHomologacion: { antes: !aPrueba, despues: aPrueba } };
  await comoDuenio(
    base,
    `INSERT INTO "AuditLog" (id, "tenantId", actor, action, entity, "entityId", changes, "createdAt")
     VALUES ($1, $2, 'operator:prueba', $3, 'Tenant', $2, $4::jsonb, now() - make_interval(hours => $5::int))`,
    [`aud_r3f1_${Math.random().toString(16).slice(2, 10)}`, tenantId, aPrueba ? "fiscal.vuelta-a-pruebas" : "fiscal.pase-a-real", JSON.stringify(changes), horas],
  );
}

test("la marca de prueba sale del ambiente de ARCA, y lo autorizado antes de que el negocio cambie de ambiente no se imprime", async (t) => {
  const base = await laBase(t);
  if (!base) return;
  apuntarLaAppA(base);
  const modoAntes = process.env.ARCA_MODO;
  t.after(() => {
    if (modoAntes === undefined) delete process.env.ARCA_MODO;
    else process.env.ARCA_MODO = modoAntes;
  });
  await datosFiscales(base, base.a.id, "20123456786", "Negocio A SRL"); // el negocio dice "real"
  await datosFiscales(base, base.b.id, "30712345671", "Negocio B SA");
  const vieja = await facturaAutorizada(base, base.a.id, null, 48);
  const { leerComprobanteImpreso } = await import("@/lib/comprobante-pdf-datos");
  const { generarComprobantePdf } = await import("@/lib/comprobante-pdf");
  const leer = async (id: string): Promise<DatosComprobanteImpreso> => {
    const d = await runInTenantContext(base.a.id, () => leerComprobanteImpreso(id, base.a.id));
    assert.ok(d);
    return d;
  };

  // La plataforma con el ARCA de prueba: aunque el negocio diga real, el CAE es de prueba.
  process.env.ARCA_MODO = "homologacion";
  assert.equal((await leer(vieja)).ambiente, "prueba");
  process.env.ARCA_MODO = "real";
  assert.equal((await leer(vieja)).ambiente, "real");

  // El cambio de ambiente de OTRO negocio no toca los comprobantes de este.
  await cambioDeAmbiente(base, base.b.id, 1, false);
  assert.equal((await leer(vieja)).ambiente, "real");

  // Este negocio pasó de prueba a real hace un día: lo autorizado antes no se sabe en cuál fue.
  await cambioDeAmbiente(base, base.a.id, 24, false);
  const d = await leer(vieja);
  assert.equal(d.ambiente, null);
  const impreso = await generarComprobantePdf(d);
  assert.ok(!impreso.ok && impreso.faltantes.some((f) => f.campo === "ambiente"), "no sale ni como factura válida ni como de prueba");

  // Lo autorizado después del cambio, sí.
  const nueva = await facturaAutorizada(base, base.a.id, null);
  assert.equal((await leer(nueva)).ambiente, "real");
});
