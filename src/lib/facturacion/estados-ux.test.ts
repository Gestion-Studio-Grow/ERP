import { test } from "node:test";
import assert from "node:assert/strict";
import { estadoUx, estadoDelError, sinJerga, type ContextoUx } from "./estados-ux";

const c: ContextoUx = {
  rutas: { datosFiscales: "/puesta", comprobantes: "/lista", plan: "/planes" },
  total: 12000,
  formatear: (n) => `$${n}`,
  pdfHref: "/pdf",
  detalleHref: "/detalle",
  whatsappHref: "https://wa.me/?text=x",
};
const ids = (e: { acciones: { id: string }[] }) => e.acciones.map((a) => a.id);

test("emitido: título con letra, número y monto; WhatsApp primero y principal", () => {
  const e = estadoUx(
    { tipo: "resultado", r: { ok: true, invoiceId: "i", limite: null, mensaje: "", estado: { estado: "autorizada", dePrueba: false, numero: "00003-00001234", cae: "12345678901234", letra: "B" } } },
    c,
  );
  assert.equal(e.clave, "emitido");
  assert.equal(e.titulo, "Factura B 00003-00001234 · $12000");
  assert.equal(e.texto, "Listo: Factura B 00003-00001234 autorizada.");
  assert.deepEqual(ids(e), ["whatsapp", "pdf", "detalle"]);
  assert.equal(e.acciones[0].principal, true);
});

test("modo de prueba: franja ámbar y «Pasar a facturar en serio»", () => {
  const e = estadoUx(
    { tipo: "resultado", r: { ok: true, invoiceId: "i", limite: null, mensaje: "", estado: { estado: "autorizada", dePrueba: true, numero: null, cae: "STUB1", letra: "C" } } },
    { ...c, pdfHref: null },
  );
  assert.equal(e.clave, "modo-de-prueba");
  assert.equal(e.tono, "prueba");
  assert.equal(e.texto, "Factura de prueba, sin validez fiscal.");
  assert.ok(ids(e).includes("pasar-a-real"));
  assert.ok(!ids(e).includes("pdf"));
});

test("sin régimen A: ofrece Factura B y avisar al contador por WhatsApp", () => {
  const e = estadoUx({ tipo: "sin-regimen-a" }, c);
  assert.equal(e.clave, "sin-regimen-a");
  assert.match(e.texto, /Para hacer Factura A falta saber qué te asignó ARCA/);
  assert.deepEqual(ids(e), ["avisar-contador", "factura-b"]);
  assert.match(e.acciones[0].href ?? "", /^https:\/\/wa\.me\/\?text=/);
  const rechazada = estadoDelError("Falta cargar qué Factura A te asignó ARCA.", c);
  assert.equal(rechazada.clave, "sin-regimen-a");
});

test("tope mensual: ver planes y comprobantes", () => {
  const e = estadoDelError("Llegaste al tope de 5 facturas gratis de este mes. Para emitir más, pasate a Comerciante.", c);
  assert.equal(e.clave, "tope-mensual");
  assert.deepEqual(ids(e), ["planes", "comprobantes"]);
});

test("ARCA no responde: probar de nuevo", () => {
  const e = estadoUx({ tipo: "resultado", r: { ok: false, error: "No se pudo emitir la factura. Probá de nuevo en unos minutos." } }, c);
  assert.equal(e.clave, "arca-no-responde");
  assert.equal(e.texto, "ARCA está lento; probá de nuevo en unos minutos.");
  assert.deepEqual(ids(e), ["reintentar"]);
});

test("rechazo de ARCA: motivo traducido, corregir y probar de nuevo", () => {
  const e = estadoUx(
    { tipo: "resultado", r: { ok: true, invoiceId: "i", limite: null, mensaje: "", estado: { estado: "rechazada", origen: "arca", motivo: "El CUIT del receptor no existe." } } },
    c,
  );
  assert.equal(e.clave, "rechazo");
  assert.equal(e.texto, "ARCA no la aceptó: El CUIT del receptor no existe.");
  assert.deepEqual(ids(e).slice(0, 2), ["corregir-comprador", "reintentar"]);
});

test("falta configurar: sin datos fiscales o sin la facturación asignada", () => {
  assert.equal(estadoDelError("Faltan los datos fiscales del negocio (CUIT y punto de venta).", c).clave, "falta-configurar");
  const e = estadoDelError("Tu negocio no tiene la facturación electrónica asignada. Pedísela a Soporte GSG.", c);
  assert.equal(e.clave, "falta-configurar");
  assert.doesNotMatch(e.texto, /Soporte GSG/);
  assert.deepEqual(ids(e), ["puesta-a-punto"]);
  assert.equal(estadoUx({ tipo: "sin-configurar" }, c).texto, "Antes de facturar hay que terminar la puesta a punto.");
});

test("falta un dato del comprador (umbral) sin «RG …»", () => {
  const e = estadoDelError("Desde $10.000.000 ARCA exige identificar al comprador (RG 5700): cargá su DNI, CUIL o CUIT.", c);
  assert.equal(e.clave, "falta-un-dato");
  assert.doesNotMatch(e.texto, /RG/);
  assert.deepEqual(ids(e), ["corregir-comprador"]);
  assert.equal(estadoDelError("Contá qué vendiste: la descripción va en la factura.", c).acciones[0].id, "corregir-detalle");
});

test("pendiente esperando a ARCA y pendiente sin conexión", () => {
  const esperando = estadoUx({ tipo: "resultado", r: { ok: true, invoiceId: "i", limite: null, mensaje: "", estado: { estado: "pendiente", motivo: "esperando", ventanaDias: 5 } } }, c);
  assert.equal(esperando.clave, "pendiente");
  const apagada = estadoUx({ tipo: "resultado", r: { ok: true, invoiceId: "i", limite: null, mensaje: "", estado: { estado: "pendiente", motivo: "apagada", ventanaDias: 5 } } }, c);
  assert.equal(apagada.clave, "falta-configurar");
});

test("sinJerga saca RG, homologación, Soporte GSG, WSFE y tenant", () => {
  assert.equal(sinJerga("ARCA exige identificar al comprador (RG 5700): cargá su DNI."), "ARCA exige identificar al comprador: cargá su DNI.");
  assert.equal(sinJerga("ARCA en homologación (sin validez fiscal)"), "ARCA en modo de prueba (sin validez fiscal)");
  assert.equal(sinJerga("Pedile a Soporte GSG que lo cargue."), "Pedile a nuestro equipo que lo cargue.");
  assert.equal(sinJerga("Error WSFE del tenant"), "Error del negocio");
});
