// UAT 16/10 (B8): si ARCA rechaza al completar un turno, recepción se entera en la pantalla.
import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeFacturaDelTurno } from "./aviso-factura";

test("ARCA rechazó: el aviso dice que el turno quedó terminado, el motivo y adónde ir", () => {
  const aviso = avisoDeFacturaDelTurno({ tipo: "emitida", status: "REJECTED", rechazoMotivo: "10015: ImpTotal no cierra" });
  assert.equal(
    aviso,
    "El turno quedó terminado, pero ARCA rechazó la factura (10015: ImpTotal no cierra). Quedó en Facturación → Comprobantes ARCA: avisale a quien lleva la facturación.",
  );
  assert.match(avisoDeFacturaDelTurno({ tipo: "emitida", status: "REJECTED", rechazoMotivo: null }) ?? "", /rechazó la factura\. Quedó/);
});

test("el envío falló antes de ARCA: aviso propio", () => {
  assert.match(avisoDeFacturaDelTurno({ tipo: "fallo" }) ?? "", /^El turno quedó terminado, pero la factura no se pudo emitir\./);
});

test("autorizada, pendiente o sin factura: no hay nada que avisar", () => {
  assert.equal(avisoDeFacturaDelTurno({ tipo: "emitida", status: "AUTHORIZED", rechazoMotivo: null }), null);
  assert.equal(avisoDeFacturaDelTurno({ tipo: "emitida", status: "PENDING", rechazoMotivo: null }), null);
  assert.equal(avisoDeFacturaDelTurno({ tipo: "sin-factura" }), null);
});
