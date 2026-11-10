import { test } from "node:test";
import assert from "node:assert/strict";
import { leerUbicacion, distanciaKm, chequearRadio, renglonDeUbicacion, linkDeMapa } from "./ubicacion";
import { leerPago, renglonDePago, vueltoALlevar } from "./pago";
import { tokenDeSeguimiento, verificarToken, vistaDelSeguimiento } from "./seguimiento";
import { textoParaElRepartidor, cobroParaElRepartidor } from "./mensajes";
import { configDeliveryLocal } from "./config";
import { extrasDelAlta } from "./alta";

const MONTE_GRANDE = { lat: -34.8183, lng: -58.4683 };
// Por defecto el cliente aceptó los términos; el test de la casilla lo saca a mano.
const form = (o: Record<string, string>, acepta = true) => {
  const campos: Record<string, string> = acepta ? { aceptaTerminos: "on", ...o } : o;
  return { get: (k: string) => (k in campos ? campos[k] : null) };
};

// ── Ubicación ──
test("ubicación vacía no es error (el cliente no la quiso compartir)", () => {
  assert.deepEqual(leerUbicacion("", ""), { estado: "vacia" });
  assert.deepEqual(leerUbicacion(null, undefined), { estado: "vacia" });
});
test("ubicación a medias o con texto se rechaza", () => {
  assert.equal(leerUbicacion("-34.8", "").estado, "invalida");
  assert.equal(leerUbicacion("abc", "-58.4").estado, "invalida");
  assert.equal(leerUbicacion("Infinity", "-58.4").estado, "invalida");
});
test("ubicación fuera de la Argentina se rechaza", () => {
  assert.equal(leerUbicacion("40.4", "-3.7").estado, "invalida"); // Madrid
});
test("ubicación válida se redondea a 5 decimales y acota la precisión", () => {
  const u = leerUbicacion("-34.818312345", "-58.468398765", "12.6");
  assert.equal(u.estado, "ok");
  if (u.estado !== "ok") return;
  assert.deepEqual(u.ubicacion, { lat: -34.81831, lng: -58.4684, precisionM: 13 });
  const p = leerUbicacion("-34.8", "-58.4", "-5");
  assert.equal(p.estado === "ok" && p.ubicacion.precisionM, null);
});
test("distancia: Monte Grande → Luis Guillón ≈ 3 km; mismo punto = 0", () => {
  const guillon = { lat: -34.8059, lng: -58.4486 };
  const km = distanciaKm(MONTE_GRANDE, guillon);
  assert.ok(km > 1.5 && km < 3.5, `km=${km}`);
  assert.equal(distanciaKm(MONTE_GRANDE, MONTE_GRANDE), 0);
});
test("radio: dentro, fuera y sin dato", () => {
  const cerca = { lat: -34.82, lng: -58.47, precisionM: 10 };
  const lejos = { lat: -34.6037, lng: -58.3816, precisionM: 10 }; // Obelisco
  assert.equal(chequearRadio(MONTE_GRANDE, cerca, 4).estado, "dentro");
  assert.equal(chequearRadio(MONTE_GRANDE, lejos, 4).estado, "fuera");
  assert.equal(chequearRadio(null, cerca, 4).estado, "sin-dato");
  assert.equal(chequearRadio(MONTE_GRANDE, cerca, null).estado, "sin-dato");
});
test("el renglón lleva el link al mapa, los km, el aviso de precisión y el de fuera de radio", () => {
  const u = { lat: -34.6037, lng: -58.3816, precisionM: 900 };
  const r = renglonDeUbicacion(u, chequearRadio(MONTE_GRANDE, u, 4));
  assert.ok(r.startsWith(`Ubicación: ${linkDeMapa(u)}`));
  assert.match(r, /aprox\. 900 m, confirmar/);
  assert.match(r, /FUERA DEL RADIO/);
  assert.match(r, /\d+,\d km/);
});

// ── Pago ──
const TODOS = ["transferencia", "efectivo", "mercadopago"] as const;
test("pago sin elegir es válido (el local pregunta)", () => {
  assert.deepEqual(leerPago("", "", TODOS), { ok: true, medio: null, pagaCon: null });
});
test("medio inventado o no habilitado por el local se rechaza", () => {
  assert.equal(leerPago("bitcoin", "", TODOS).ok, false);
  assert.equal(leerPago("mercadopago", "", ["efectivo"]).ok, false);
});
test("efectivo: paga con se lee en criollo; vacío = justo; disparate se rechaza", () => {
  assert.deepEqual(leerPago("efectivo", "20.000", TODOS), { ok: true, medio: "efectivo", pagaCon: 20000 });
  assert.deepEqual(leerPago("efectivo", "", TODOS), { ok: true, medio: "efectivo", pagaCon: null });
  assert.equal(leerPago("efectivo", "-5", TODOS).ok, false);
  assert.equal(leerPago("efectivo", "999.999.999", TODOS).ok, false);
  assert.equal(leerPago("efectivo", "0", TODOS).ok, false);
});
test("transferencia ignora el paga con", () => {
  assert.deepEqual(leerPago("transferencia", "5000", TODOS), { ok: true, medio: "transferencia", pagaCon: null });
});
test("vuelto: sólo si paga con más", () => {
  assert.equal(vueltoALlevar(15000, 20000), 5000);
  assert.equal(vueltoALlevar(15000, 15000), null);
  assert.equal(vueltoALlevar(15000, 10000), null);
  assert.equal(vueltoALlevar(15000, null), null);
});
test("renglones de pago", () => {
  assert.match(renglonDePago("efectivo", 20000), /20\.000.*vuelto/);
  assert.match(renglonDePago("transferencia", null), /confirmar al ver la plata/);
  assert.match(renglonDePago("mercadopago", null), /link de Mercado Pago/);
});

// ── Seguimiento ──
const S = "secreto-de-prueba";
test("token: vale para su pedido y su negocio, y nada más", () => {
  const t = tokenDeSeguimiento(S, "tenantA", "cmpedido0001");
  assert.equal(verificarToken(S, "tenantA", t), "cmpedido0001");
  assert.equal(verificarToken(S, "tenantB", t), null, "otro negocio");
  assert.equal(verificarToken("otro-secreto", "tenantA", t), null, "otro secreto");
  const [, sig] = t.split(".");
  assert.equal(verificarToken(S, "tenantA", `cmpedido0002.${sig}`), null, "otro pedido con la firma ajena");
  assert.equal(verificarToken(S, "tenantA", "basura"), null);
  assert.equal(verificarToken(S, "tenantA", `${t}x`), null);
  assert.equal(verificarToken("", "tenantA", t), null);
  assert.throws(() => tokenDeSeguimiento("", "tenantA", "cmpedido0001"));
});
test("seguimiento: transferencia pendiente pide el comprobante", () => {
  const v = vistaDelSeguimiento({ status: "PENDING", envio: true, enCamino: false, paid: false, medio: "transferencia" });
  assert.equal(v.actual, 0);
  assert.match(v.detalle, /comprobante/);
});
test("seguimiento: el camino completo de un envío", () => {
  const base = { envio: true, paid: true, medio: "efectivo" as const };
  assert.equal(vistaDelSeguimiento({ ...base, status: "CONFIRMED", enCamino: false }).actual, 1);
  assert.equal(vistaDelSeguimiento({ ...base, status: "PREPARING", enCamino: false }).actual, 2);
  assert.equal(vistaDelSeguimiento({ ...base, status: "READY", enCamino: false }).actual, 2);
  const camino = vistaDelSeguimiento({ ...base, status: "READY", enCamino: true });
  assert.equal(camino.actual, 3);
  assert.equal(camino.pasos[3].id, "camino");
  const fin = vistaDelSeguimiento({ ...base, status: "DELIVERED", enCamino: true });
  assert.equal(fin.actual, 4);
  assert.equal(fin.terminado, true);
});
test("seguimiento: retiro y cancelación", () => {
  const r = vistaDelSeguimiento({ status: "READY", envio: false, enCamino: false, paid: false, medio: null });
  assert.equal(r.pasos[3].id, "listo");
  assert.equal(r.actual, 3);
  const c = vistaDelSeguimiento({ status: "CANCELLED", envio: true, enCamino: false, paid: true, medio: "transferencia" });
  assert.equal(c.actual, -1);
  assert.equal(c.terminado, true);
});

// ── Mensaje al repartidor ──
const PEDIDO = {
  code: 42, negocio: "Bitácora Café", cliente: "Ana", telefono: "11 5555-0000", direccion: "Calle 1 234",
  nota: "Ubicación: https://www.google.com/maps/search/?api=1&query=-34.82,-58.47", total: 15000, pagado: false,
  medio: "efectivo" as const, pagaCon: 20000, renglones: [{ nombre: "Flat white", cantidad: 2 }, { nombre: "Medialuna", cantidad: 1.5 }],
};
test("el repartidor lee qué cobrar y el vuelto", () => {
  assert.match(cobroParaElRepartidor(PEDIDO), /COBRAR \$15\.000.*llevar \$5\.000 de vuelto/);
  assert.equal(cobroParaElRepartidor({ ...PEDIDO, pagado: true }), "YA PAGÓ — no cobrar");
  assert.match(cobroParaElRepartidor({ ...PEDIDO, medio: "transferencia", pagaCon: null }), /consultá al local/);
});
test("el texto al repartidor trae número, dirección, ubicación y renglones", () => {
  const t = textoParaElRepartidor(PEDIDO);
  assert.match(t, /\*Pedido #42\* · Bitácora Café/);
  assert.match(t, /Dirección: Calle 1 234/);
  assert.match(t, /google\.com\/maps/);
  assert.match(t, /• 2 × Flat white/);
  assert.match(t, /• 1,5 × Medialuna/);
});

// ── Config y alta ──
test("config: sólo los negocios cargados; nada de prototipo", () => {
  assert.equal(configDeliveryLocal("bitacora")?.nombre, "Bitácora Café");
  assert.equal(configDeliveryLocal("magra"), null);
  assert.equal(configDeliveryLocal("toString"), null);
  assert.equal(configDeliveryLocal(null), null);
});
test("alta: envío con ubicación y efectivo arma los dos renglones y la auditoría", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  const x = extrasDelAlta(cfg, form({ medioPreferido: "efectivo", pagaCon: "20000", ubicacionLat: "-34.82", ubicacionLng: "-58.47", ubicacionPrecision: "20" }), true);
  assert.equal(x.ok, true);
  if (!x.ok) return;
  assert.equal(x.renglones.length, 2);
  assert.match(x.renglones[0], /^Ubicación: /);
  assert.equal(x.auditoria.ubicacion?.fueraDelRadio, false);
  assert.deepEqual(x.auditoria.pago, { medio: "efectivo", pagaCon: 20000 });
});
test("alta: retiro ignora la ubicación; ubicación rara no frena; pago malo sí", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  const retiro = extrasDelAlta(cfg, form({ ubicacionLat: "-34.82", ubicacionLng: "-58.47" }), false);
  assert.ok(retiro.ok && retiro.renglones.length === 0 && retiro.auditoria.ubicacion === null);
  const rara = extrasDelAlta(cfg, form({ ubicacionLat: "40", ubicacionLng: "-3" }), true);
  assert.ok(rara.ok && rara.renglones.length === 0);
  assert.equal(extrasDelAlta(cfg, form({ medioPreferido: "cripto" }), true).ok, false);
});
test("alta: sin aceptar los términos no se toma el pedido, aunque el navegador se saltee la casilla", () => {
  const cfg = configDeliveryLocal("bitacora")!;
  const x = extrasDelAlta(cfg, form({ medioPreferido: "efectivo" }, false), true);
  assert.equal(x.ok, false);
  assert.equal(extrasDelAlta(cfg, form({ medioPreferido: "efectivo", aceptaTerminos: "si" }, false), true).ok, false);
});
