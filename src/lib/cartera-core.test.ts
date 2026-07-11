// Tests del CORE del módulo CARTERA (producto Contador) — lógica pura + puertos
// fake, sin DB (node:test, mismo runner del repo). Cubren lo que exige el frente:
//  - pertenencia ESTRICTA estudio→cliente (estudio A no ve/opera cartera de B),
//  - agregación del panel (filas + resumen, alerta de tope),
//  - alta idempotente/segura (validación CUIT, slug que jamás se adjunta a un
//    negocio de otro CUIT),
//  - la fachada de provisioning que setea el GUC de RLS apenas existe el tenant.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  UMBRAL_ALERTA_CAP,
  armarFilaCartera,
  conGucTrasCrearTenant,
  crearClienteProvisioning,
  exigirClienteDeCartera,
  listarCarteraCore,
  resolverSlugCliente,
  resumirCartera,
  validarAltaCliente,
  type CarteraPorts,
  type ClienteInfo,
  type FilaCarteraDb,
  type ResumenFiscalCliente,
} from "./cartera-core";

// ── helpers ──────────────────────────────────────────────────────────────────

const filaDb = (over: Partial<FilaCarteraDb> = {}): FilaCarteraDb => ({
  id: "cart-1",
  clienteTenantId: "cli-1",
  alias: "Kiosco de Marta",
  estado: "activa",
  ...over,
});

const info = (over: Partial<ClienteInfo> = {}): ClienteInfo => ({
  nombre: "Kiosco La Esquina SRL",
  slug: "kiosco-la-esquina",
  subdomain: null,
  arcaCuit: "20111111112",
  arcaHomologacion: true,
  ...over,
});

const resumenFiscal = (over: Partial<ResumenFiscalCliente> = {}): ResumenFiscalCliente => ({
  facturasMes: 10,
  capFacturasMes: 100,
  montoFacturadoMes: 500_000,
  pendientesRevision: 0,
  listasParaEmitir: 3,
  ultimaImportacion: null,
  ...over,
});

// ── armado de fila + resumen ─────────────────────────────────────────────────

test("armarFilaCartera: combina fila + tenant + resumen y calcula pctCap", () => {
  const f = armarFilaCartera(filaDb(), info(), resumenFiscal({ facturasMes: 80, capFacturasMes: 100 }));
  assert.equal(f.alias, "Kiosco de Marta");
  assert.equal(f.nombre, "Kiosco La Esquina SRL");
  assert.equal(f.cuit, "20111111112");
  assert.equal(f.arcaConfigurado, true);
  assert.equal(f.pctCap, 0.8);
});

test("armarFilaCartera: cap inválido cae al default del producto (no divide por cero)", () => {
  const f = armarFilaCartera(filaDb(), info(), resumenFiscal({ facturasMes: 0, capFacturasMes: 0 }));
  assert.equal(f.pctCap, 0);
  const g = armarFilaCartera(filaDb(), info({ arcaCuit: null }), resumenFiscal({ capFacturasMes: 0, facturasMes: 159 }));
  assert.equal(g.pctCap, 1); // default 159
  assert.equal(g.arcaConfigurado, false);
});

test("resumirCartera: agrega activos/pausados, sumas y alerta de tope (≥ 80%)", () => {
  const filas = [
    armarFilaCartera(filaDb({ id: "a", clienteTenantId: "c1" }), info(), resumenFiscal({ facturasMes: 90, capFacturasMes: 100, pendientesRevision: 2 })),
    armarFilaCartera(filaDb({ id: "b", clienteTenantId: "c2", estado: "pausada" }), info(), resumenFiscal({ facturasMes: 10, capFacturasMes: 100, montoFacturadoMes: 100_000 })),
    armarFilaCartera(filaDb({ id: "c", clienteTenantId: "c3" }), info(), resumenFiscal({ facturasMes: 79, capFacturasMes: 100 })),
  ];
  const r = resumirCartera(filas);
  assert.equal(r.clientes, 2);
  assert.equal(r.pausados, 1);
  assert.equal(r.facturasMes, 179);
  assert.equal(r.montoFacturadoMes, 1_100_000);
  assert.equal(r.pendientesRevision, 2);
  assert.equal(r.listasParaEmitir, 9);
  assert.equal(r.cercaDelTope, 1); // solo el de 90% (0.79 < UMBRAL 0.8)
  assert.equal(UMBRAL_ALERTA_CAP, 0.8);
});

// ── aislamiento: estudio A no ve la cartera de estudio B ─────────────────────

/** Fake de puertos con carteras de DOS estudios: devuelve SOLO lo del estudio pedido. */
function portsConDosEstudios(registro: { pedidos: string[] }): CarteraPorts {
  const carteras: Record<string, FilaCarteraDb[]> = {
    "estudio-A": [filaDb({ id: "a1", clienteTenantId: "cli-de-A" })],
    "estudio-B": [filaDb({ id: "b1", clienteTenantId: "cli-de-B", alias: "Cliente de B" })],
  };
  return {
    async filasDeCartera(estudioTenantId) {
      registro.pedidos.push(estudioTenantId);
      return carteras[estudioTenantId] ?? [];
    },
    async datosCliente(clienteTenantId) {
      return info({ nombre: `Negocio ${clienteTenantId}` });
    },
    async resumenFiscalCliente() {
      return resumenFiscal();
    },
  };
}

test("listarCarteraCore: estudio A solo recibe SUS filas (jamás las de B)", async () => {
  const registro = { pedidos: [] as string[] };
  const ports = portsConDosEstudios(registro);

  const deA = await listarCarteraCore(ports, "estudio-A");
  assert.equal(deA.filas.length, 1);
  assert.equal(deA.filas[0].clienteTenantId, "cli-de-A");
  assert.ok(!deA.filas.some((f) => f.clienteTenantId === "cli-de-B"));
  // El core consulta la cartera EXCLUSIVAMENTE con el id del estudio actual.
  assert.deepEqual(registro.pedidos, ["estudio-A"]);

  const deB = await listarCarteraCore(ports, "estudio-B");
  assert.equal(deB.filas.length, 1);
  assert.equal(deB.filas[0].clienteTenantId, "cli-de-B");
});

test("listarCarteraCore: fila huérfana (tenant borrado) no rompe el panel", async () => {
  const ports: CarteraPorts = {
    async filasDeCartera() {
      return [filaDb({ id: "x", clienteTenantId: "fantasma" }), filaDb({ id: "y", clienteTenantId: "vivo" })];
    },
    async datosCliente(id) {
      return id === "vivo" ? info() : null;
    },
    async resumenFiscalCliente() {
      return resumenFiscal();
    },
  };
  const r = await listarCarteraCore(ports, "estudio-A");
  assert.equal(r.filas.length, 1);
  assert.equal(r.filas[0].clienteTenantId, "vivo");
});

// ── pertenencia estricta (la guarda de toda acción) ──────────────────────────

/** Fake del lookup de fila: cartera keyed por (estudio, cliente). */
function buscarFilaFake(rows: Record<string, FilaCarteraDb>) {
  return async (estudio: string, cliente: string) => rows[`${estudio}:${cliente}`] ?? null;
}

test("exigirClienteDeCartera: cliente de OTRO estudio se rechaza (sin fugar info)", async () => {
  const buscar = buscarFilaFake({
    "estudio-B:cli-de-B": filaDb({ clienteTenantId: "cli-de-B" }),
  });
  // El estudio A pide operar el cliente de B → mismo error que "no existe".
  const r = await exigirClienteDeCartera(buscar, "estudio-A", "cli-de-B");
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /no está en tu cartera/i);
});

test("exigirClienteDeCartera: activa pasa; baja se trata como inexistente", async () => {
  const buscar = buscarFilaFake({
    "estudio-A:cli-1": filaDb({ estado: "activa" }),
    "estudio-A:cli-2": filaDb({ clienteTenantId: "cli-2", estado: "baja" }),
  });
  assert.equal((await exigirClienteDeCartera(buscar, "estudio-A", "cli-1")).ok, true);
  const baja = await exigirClienteDeCartera(buscar, "estudio-A", "cli-2");
  assert.equal(baja.ok, false);
  assert.match((baja as { error: string }).error, /no está en tu cartera/i);
});

test("exigirClienteDeCartera: pausada solo pasa con permitirPausada", async () => {
  const buscar = buscarFilaFake({
    "estudio-A:cli-1": filaDb({ estado: "pausada" }),
  });
  const sin = await exigirClienteDeCartera(buscar, "estudio-A", "cli-1");
  assert.equal(sin.ok, false);
  assert.match((sin as { error: string }).error, /pausado/i);
  const con = await exigirClienteDeCartera(buscar, "estudio-A", "cli-1", { permitirPausada: true });
  assert.equal(con.ok, true);
});

// ── alta: validación + slug seguro ───────────────────────────────────────────

test("validarAltaCliente: alta válida normaliza CUIT/email y sugiere slug", () => {
  const v = validarAltaCliente({
    nombre: "Kiosco La Esquina",
    cuit: "20-11111111-2",
    email: "Dueno@Negocio.com ",
    alias: "  Kiosco de Marta ",
  });
  assert.equal(v.ok, true);
  const ok = v as Extract<typeof v, { ok: true }>;
  assert.equal(ok.cuit, "20111111112");
  assert.equal(ok.email, "dueno@negocio.com");
  assert.equal(ok.alias, "Kiosco de Marta");
  assert.equal(ok.slugBase, "kiosco-la-esquina");
});

test("validarAltaCliente: CUIT con dígito verificador malo, email inválido y nombre corto fallan", () => {
  assert.equal(validarAltaCliente({ nombre: "Kiosco", cuit: "20111111113", email: "a@b.co" }).ok, false);
  assert.equal(validarAltaCliente({ nombre: "Kiosco", cuit: "20111111112", email: "no-es-email" }).ok, false);
  assert.equal(validarAltaCliente({ nombre: "K", cuit: "20111111112", email: "a@b.co" }).ok, false);
});

test("validarAltaCliente: alias default = nombre", () => {
  const v = validarAltaCliente({ nombre: "Verdulería Doña Rosa", cuit: "20-11111111-2", email: "a@b.co" });
  assert.equal((v as { alias: string }).alias, "Verdulería Doña Rosa");
});

test("resolverSlugCliente: slug libre se usa directo", async () => {
  const r = await resolverSlugCliente("kiosco", "20111111112", async () => null);
  assert.deepEqual(r, { ok: true, slug: "kiosco", reusaExistente: false });
});

test("resolverSlugCliente: slug tomado por el MISMO CUIT ⇒ re-alta idempotente", async () => {
  const r = await resolverSlugCliente("kiosco", "20111111112", async (slug) =>
    slug === "kiosco" ? { arcaCuit: "20-11111111-2" } : null,
  );
  assert.deepEqual(r, { ok: true, slug: "kiosco", reusaExistente: true });
});

test("resolverSlugCliente: slug tomado por OTRO CUIT ⇒ jamás se adjunta, cae a la variante", async () => {
  const r = await resolverSlugCliente("kiosco", "20111111112", async (slug) =>
    slug === "kiosco" ? { arcaCuit: "27222222226" } : null,
  );
  assert.equal(r.ok, true);
  const ok = r as Extract<typeof r, { ok: true }>;
  assert.equal(ok.slug, "kiosco-1112"); // cola del CUIT
  assert.equal(ok.reusaExistente, false);
});

test("resolverSlugCliente: base y variante tomadas por otros ⇒ error claro (no un 3er invento)", async () => {
  const r = await resolverSlugCliente("kiosco", "20111111112", async () => ({ arcaCuit: "27222222226" }));
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /nombre corto único/i);
});

// ── fachada de provisioning: GUC de RLS apenas existe el tenant ──────────────

type Llamada = { tipo: string; detalle?: unknown };

/** Tx fake con la superficie que usa provisionTenant (tenant.upsert + $executeRaw + otro delegate). */
function txFake(llamadas: Llamada[]) {
  return {
    tenant: {
      async upsert(args: unknown) {
        llamadas.push({ tipo: "tenant.upsert", detalle: args });
        return { id: "tenant-nuevo" };
      },
      async findUnique() {
        llamadas.push({ tipo: "tenant.findUnique" });
        return null;
      },
    },
    user: {
      async create(args: unknown) {
        llamadas.push({ tipo: "user.create", detalle: args });
        return { id: "u1" };
      },
    },
    async $executeRaw(_q: TemplateStringsArray, ...valores: unknown[]) {
      llamadas.push({ tipo: "set_config", detalle: valores[0] });
      return 1;
    },
  };
}

test("conGucTrasCrearTenant: setea app.current_tenant_id INMEDIATAMENTE después del upsert de Tenant", async () => {
  const llamadas: Llamada[] = [];
  const tx = conGucTrasCrearTenant(txFake(llamadas));

  // Simula el orden real de provisionTenant: lee, upserta el tenant, crea el OWNER.
  await (tx as unknown as { tenant: { findUnique(): Promise<null> } }).tenant.findUnique();
  const t = await (tx as unknown as { tenant: { upsert(a: unknown): Promise<{ id: string }> } }).tenant.upsert({ where: { slug: "x" } });
  await (tx as unknown as { user: { create(a: unknown): Promise<{ id: string }> } }).user.create({ data: {} });

  assert.equal(t.id, "tenant-nuevo");
  assert.deepEqual(
    llamadas.map((l) => l.tipo),
    ["tenant.findUnique", "tenant.upsert", "set_config", "user.create"],
  );
  // El GUC se setea con el id RECIÉN creado (las escrituras siguientes pasan RLS).
  assert.equal(llamadas.find((l) => l.tipo === "set_config")?.detalle, "tenant-nuevo");
});

test("crearClienteProvisioning: envuelve $transaction y le da a provisionTenant el tx proxied", async () => {
  const llamadas: Llamada[] = [];
  const base = {
    async $transaction<T>(fn: (tx: object) => Promise<T>): Promise<T> {
      return fn(txFake(llamadas));
    },
  };
  const cliente = crearClienteProvisioning(base);
  const resultado = await cliente.$transaction(async (tx) => {
    const t = await (tx as unknown as { tenant: { upsert(a: unknown): Promise<{ id: string }> } }).tenant.upsert({});
    return t.id;
  });
  assert.equal(resultado, "tenant-nuevo");
  assert.deepEqual(llamadas.map((l) => l.tipo), ["tenant.upsert", "set_config"]);
});
