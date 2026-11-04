// Verificación contra Mercado Pago con `fetch` falso: sólo approved + ARS + monto exacto (número) marca pagado.
import { test } from "node:test";
import assert from "node:assert/strict";
import { claveCoincide, comisionDe, cuerpoPreferencia, pagoQuePaga, verificarEnMp } from "./pagos";

const PEDIDO = { id: "pd1", total: 3000, estado: "pendiente", metodo: "mercadopago", fotografoId: "f1" };
const pago = (o: Record<string, unknown>) => ({ id: 77, status: "approved", transaction_amount: 3000, currency_id: "ARS", external_reference: "pd1", ...o });

function mp(resultados: unknown[], status = 200) {
  const llamadas: { url: string; auth: string | null }[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), auth: new Headers(init?.headers).get("authorization") });
    return new Response(JSON.stringify({ results: resultados }), { status });
  }) as typeof fetch;
  return { f, llamadas };
}

function marcador() {
  const estado = { pagado: false, cupon: 0, refs: [] as string[] };
  const marcar = async (id: string, ref: string) => {
    estado.refs.push(ref);
    if (estado.pagado) return { pedido: { id } as never, cambio: false };
    estado.pagado = true;
    estado.cupon++;
    return { pedido: { id } as never, cambio: true };
  };
  return { estado, marcar };
}

test("approved por el monto exacto → marca pagado, con el token del fotógrafo y por external_reference", async () => {
  const { f, llamadas } = mp([pago({})]);
  const m = marcador();
  assert.equal(await verificarEnMp(PEDIDO, { fetch: f, token: "APP_USR-x", marcar: m.marcar }), true);
  assert.equal(m.estado.pagado, true);
  assert.deepEqual(m.estado.refs, ["MP-77"]);
  assert.match(llamadas[0].url, /\/v1\/payments\/search\?external_reference=pd1/);
  assert.equal(llamadas[0].auth, "Bearer APP_USR-x");
});

test("monto distinto, monto como string, otra moneda, otro pedido o rejected → NO marca", async () => {
  for (const malo of [
    pago({ transaction_amount: 2999 }),
    pago({ transaction_amount: "3000" }),
    pago({ currency_id: "USD" }),
    pago({ external_reference: "otro" }),
    pago({ status: "rejected" }),
    pago({ status: "pending" }),
  ]) {
    const m = marcador();
    assert.equal(await verificarEnMp(PEDIDO, { fetch: mp([malo]).f, token: "t", marcar: m.marcar }), false, JSON.stringify(malo));
    assert.equal(m.estado.pagado, false);
  }
});

test("rejected y después approved: gana el aprobado", () => {
  assert.equal(pagoQuePaga([pago({ id: 1, status: "rejected" }), pago({ id: 2 })], PEDIDO)?.id, 2);
  assert.equal(pagoQuePaga("basura", PEDIDO), null);
});

test("MP caído, 401 o sin token → false, nunca marca a ciegas", async () => {
  const m = marcador();
  const caido = (async () => {
    throw new Error("red");
  }) as unknown as typeof fetch;
  assert.equal(await verificarEnMp(PEDIDO, { fetch: caido, token: "t", marcar: m.marcar }), false);
  assert.equal(await verificarEnMp(PEDIDO, { fetch: mp([pago({})], 401).f, token: "t", marcar: m.marcar }), false);
  assert.equal(await verificarEnMp(PEDIDO, { fetch: mp([pago({})]).f, token: null, marcar: m.marcar }), false);
  assert.equal(m.estado.pagado, false);
});

test("idempotencia: ya pagado no consulta MP; dos avisos seguidos consumen el cupón una sola vez", async () => {
  const { f, llamadas } = mp([pago({})]);
  assert.equal(await verificarEnMp({ ...PEDIDO, estado: "pagado" }, { fetch: f, token: "t" }), true);
  assert.equal(llamadas.length, 0);
  const m = marcador();
  await verificarEnMp(PEDIDO, { fetch: f, token: "t", marcar: m.marcar });
  await verificarEnMp(PEDIDO, { fetch: f, token: "t", marcar: m.marcar });
  assert.equal(m.estado.cupon, 1);
});

test("transferencia nunca se verifica contra MP", async () => {
  const { f, llamadas } = mp([pago({})]);
  assert.equal(await verificarEnMp({ ...PEDIDO, metodo: "transferencia" }, { fetch: f, token: "t" }), false);
  assert.equal(llamadas.length, 0);
});

test("preferencia: unit_price = total, external_reference, metadata, webhook y vuelta con la clave", () => {
  const c = cuerpoPreferencia({ pedidoId: "pd1", clave: "k", slug: "10k", albumNombre: "10K", cantidad: 2, total: 3000, comprador: { nombre: "A", email: "a@b.c" }, origen: "https://h.example" });
  const items = c.items as { unit_price: number; quantity: number; title: string }[];
  assert.equal(items[0].unit_price, 3000);
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].title, "2 fotos de 10K");
  assert.equal(c.external_reference, "pd1");
  assert.deepEqual(c.metadata, { pedido_id: "pd1" });
  assert.equal(c.notification_url, "https://h.example/api/btf/mp/webhook?pedido=pd1");
  assert.equal((c.back_urls as { success: string }).success, "https://h.example/a/10k/pedido/pd1?clave=k");
  assert.equal(c.auto_return, "approved");
});

test("clave en tiempo constante y comisión por plan", () => {
  assert.equal(claveCoincide("abc", "abc"), true);
  assert.equal(claveCoincide("abd", "abc"), false);
  assert.equal(claveCoincide("ab", "abc"), false);
  assert.equal(claveCoincide(null, "abc"), false);
  assert.equal(comisionDe("libre", 1000), 90);
  assert.equal(comisionDe("pro", 1000), 0);
});
