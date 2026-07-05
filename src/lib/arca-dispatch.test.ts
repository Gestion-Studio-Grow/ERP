import { test } from "node:test";
import assert from "node:assert/strict";

import { crearClientePara, type LeerConfigFiscal } from "./arca-dispatch";
import { StubAfipClient } from "@/plugins/arca";

// Lector fake: no toca la DB. El seam es justamente para testear offline.
const leerFijo =
  (cfg: { cuit: number; homologacion: boolean } | null): LeerConfigFiscal =>
  async () =>
    cfg;

test("clientePara: sin ARCA_MODO devuelve el stub aunque haya config del tenant", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: true }),
    {}, // env sin ARCA_MODO → factory cae al stub (seguro por default)
  );
  const cliente = await clientePara("tenant-1");
  assert.ok(cliente instanceof StubAfipClient, "debe ser el stub con ARCA apagado");
});

test("clientePara: tenant sin config fiscal cae a un stub cuit:0 (inofensivo)", async () => {
  const clientePara = crearClientePara(leerFijo(null), {});
  const cliente = await clientePara("tenant-inexistente");
  assert.ok(cliente instanceof StubAfipClient);
});

test("clientePara: ARCA_MODO=real sin credenciales lanza error de acción humana (no emite falso)", async () => {
  const clientePara = crearClientePara(
    leerFijo({ cuit: 20111111112, homologacion: false }),
    { ARCA_MODO: "real" }, // real pero sin ARCA_CERT_PEM / ARCA_KEY_PEM
  );
  await assert.rejects(() => clientePara("tenant-1"), /ARCA_CERT_PEM|ARCA_KEY_PEM/);
});
