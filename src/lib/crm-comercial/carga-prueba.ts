// ============================================================================
// CRM COMERCIAL — carga y limpieza de la PRUEBA (GSG-CRM-011 parte 3 · diseño CRM-REINGENIERIA.md §6).
// ============================================================================
//
// Carga en UN negocio (por slug) los leads ficticios de la prueba y los clientes activos, y lo anota todo en
// `FilaDePruebaCrm` («de prueba»). Idempotente: lo ya anotado no se vuelve a cargar (dos corridas no duplican).
//
// Cómo entra cada cosa (criterio P2):
//   · Consulta entrante → la carga una persona de Dirección con `repo.proponerOportunidad` (la MISMA función que
//     usa la acción del servidor; el permiso y las reglas E1/E10/E17/E21/E24 viven ahí) y queda en RECIBIDA.
//     Quien escribió queda como contacto «de consulta entrante» (`repo.crearContacto`), con papel PIDE.
//   · Prospecto → lo propone el puesto Descubridor (si no hay, Dirección) con la misma función y queda en
//     DETECTADA. Si hay URL de fuente, la marca queda en el evento «sin verificar» (verificar es del Verificador).
//   · Lo que el motor frena (p. ej. prospectar en frío a una marca que ya es cliente, E17) NO se fuerza: queda
//     anotado como FRENADA con el motivo; lo que se une a otra abierta (E1), como UNIDA.
//   · Cliente activo → marca + oportunidad GANADA con un comercial como dueño (no hay función del repo que
//     cree una GANADA: la pone el cierre del proyecto). Escritura directa, en `tenantTransaction`.
//   · A cada oportunidad nueva le deja su primera tarea en la cola (Verificador o Calificador), para que los
//     puestos tengan qué tomar (un puesto sólo ve lo que creó o lo que tomó).
//
// Todo acceso a la base de un negocio va por `tenantTransaction`. La única lectura fuera es la fila de `Tenant`
// por slug (no es dato de un negocio). Contra Neon sólo con las dos llaves de `guardaDeBase`, que corta antes de conectar.

import { tenantTransaction } from "@/lib/rls";
import { basePrisma } from "@/lib/prisma-base";
import { claveEvento, claveMarca, normalizar } from "@/lib/eventos-sponsors/core";
import { dominioDe } from "./motor";
import * as repo from "./repo";
import { guardaDeBase, type PermisoProduccion } from "./guarda-base";

type Tx = Parameters<Parameters<typeof tenantTransaction>[0]>[0];

export const LOTE_POR_DEFECTO = "crm-prueba-2026-11";
const DIA = 86_400_000;

// ── Guardas ─────────────────────────────────────────────────────────────────

// `guardaDeBase` vive aparte (guarda-base.ts) para probarla sin importar la base.
export { guardaDeBase, type Guarda, type PermisoProduccion } from "./guarda-base";

export class SinMigracionDePrueba extends Error {
  constructor() {
    super("Falta la migración 20261116170000_crm_comercial_filas_de_prueba (y las del CRM): sin ella la prueba no se carga.");
  }
}

function esFaltaDeTablaDePrueba(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e);
  return /FilaDePruebaCrm/.test(msg) && /does not exist|no existe|P2021/.test(msg);
}

/** El negocio por su slug. Es la única lectura fuera de `tenantTransaction` (la tabla Tenant no es de un negocio). */
export async function negocioPorSlug(slug: string): Promise<{ id: string; slug: string } | null> {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(slug)) return null;
  return basePrisma.tenant.findUnique({ where: { slug }, select: { id: true, slug: true } });
}

// ── Lo que viene en los archivos (docs/tenants/<negocio>/crm-prueba/) ──────

export interface LeadDePrueba {
  id: string;
  tipo: string; // «consulta entrante» · «prospecto»
  recibido?: string;
  detectado?: string;
  canal?: string;
  marca?: string | null;
  dominio?: string | null;
  rubro?: string | null;
  de?: { nombre?: string; cargo?: string; email?: string; telefono?: string } | null;
  evento?: { nombre?: string; fecha?: string; lugar?: string } | null;
  fuente?: { url?: string | null; descripcion?: string; confirmado?: string } | null;
  texto?: string;
  datos_conocidos?: Record<string, unknown> | null;
}

export interface ClienteDePrueba {
  id: string;
  marca: string;
  dominio?: string | null;
  rubro?: string | null;
  responsable_de_cuenta?: string | null;
  proyecto_en_curso?: { descripcion?: string; evento?: string; fecha_evento?: string; lugar?: string; estado?: string } | null;
  notas?: string | null;
}

// ── Lectura de fechas y lugares (texto libre de los archivos) ──────────────

const dia = (d: number, m: number, y: number): string | null => {
  const f = new Date(Date.UTC(y, m - 1, d));
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== m - 1 || f.getUTCDate() !== d) return null;
  return f.toISOString().slice(0, 10);
};

/** «14 al 17/04/2027», «30/11 al 02/12/2027», «18/04/2027», «jueves 19/11/2026». Sin día → null (no se inventa). */
export function leerFechas(s: string | null | undefined): { desde: string; hasta: string | null } | null {
  if (!s) return null;
  let m = /(\d{1,2})\/(\d{1,2})\s*al\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const y = Number(m[5]);
    const desde = dia(Number(m[1]), Number(m[2]), Number(m[2]) > Number(m[4]) ? y - 1 : y);
    const hasta = dia(Number(m[3]), Number(m[4]), y);
    return desde && hasta && hasta >= desde ? { desde, hasta } : null;
  }
  m = /(\d{1,2})\s*al\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const desde = dia(Number(m[1]), Number(m[3]), Number(m[4]));
    const hasta = dia(Number(m[2]), Number(m[3]), Number(m[4]));
    return desde && hasta && hasta >= desde ? { desde, hasta } : null;
  }
  m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
  if (m) {
    const desde = dia(Number(m[1]), Number(m[2]), Number(m[3]));
    return desde ? { desde, hasta: null } : null;
  }
  return null;
}

/** La región: la última parte del lugar («Predio X, Mendoza» → «Mendoza»). Sin lugar útil → null. */
export function regionDe(lugar: string | null | undefined): string | null {
  const l = lugar?.trim();
  if (!l || /^no (informa|lo dice|sabe)/i.test(l)) return null;
  const partes = l.split(",").map((p) => p.trim()).filter(Boolean);
  return (partes.at(-1) ?? l).slice(0, 120);
}

const sinMarca = (m: string | null | undefined) => !m?.trim() || /^ningun[ao]\b/i.test(m.trim());
const esConsulta = (l: LeadDePrueba) => /consulta/i.test(l.tipo);
const momento = (l: LeadDePrueba) => (esConsulta(l) ? l.recibido : l.detectado) ?? "";

// ── Anotar «de prueba» ──────────────────────────────────────────────────────

type Entidad = "LEAD" | "CLIENTE" | "MARCA" | "EVENTO" | "EVENTO_MARCA" | "OPORTUNIDAD" | "CONTACTO";

async function anotado(tx: Tx, tenantId: string, entidad: Entidad, clave: string) {
  return tx.filaDePruebaCrm.findUnique({ where: { tenantId_entidad_clave: { tenantId, entidad, clave } }, select: { filaId: true, nota: true } });
}

async function anotar(tx: Tx, tenantId: string, lote: string, entidad: Entidad, clave: string, filaId: string | null, nota: string | null = null): Promise<void> {
  if (await anotado(tx, tenantId, entidad, clave)) return;
  await tx.filaDePruebaCrm.create({ data: { tenantId, entidad, clave, filaId, nota: nota?.slice(0, 2000) ?? null, lote }, select: { id: true } });
}

/** El evento por nombre (cualquier fecha) o, si no está y la fecha se entiende, uno nuevo anotado de prueba. */
async function asegurarEvento(tx: Tx, tenantId: string, lote: string, ev: { nombre?: string; fecha?: string; lugar?: string } | null | undefined): Promise<string | null> {
  const nombre = ev?.nombre?.trim();
  if (!nombre) return null;
  const base = normalizar(nombre);
  if (!base) return null;
  const ya = await tx.eventoRelevado.findFirst({ where: { tenantId, clave: { startsWith: `${base}|` } }, orderBy: { createdAt: "asc" }, select: { id: true } });
  if (ya) return ya.id;
  const fechas = leerFechas(ev?.fecha);
  const region = regionDe(ev?.lugar);
  if (!fechas || !region) return null;
  const creado = await tx.eventoRelevado.create({
    data: {
      tenantId,
      clave: claveEvento(nombre, fechas.desde, region),
      nombre: nombre.slice(0, 200),
      fecha: new Date(`${fechas.desde}T00:00:00Z`),
      fechaHasta: fechas.hasta ? new Date(`${fechas.hasta}T00:00:00Z`) : null,
      lugar: (ev?.lugar ?? region).trim().slice(0, 300),
      region,
      origen: "MANUAL",
    },
    select: { id: true },
  });
  await anotar(tx, tenantId, lote, "EVENTO", creado.id, creado.id);
  return creado.id;
}

async function marcaExistente(tx: Tx, tenantId: string, nombre: string, dominio: string | null): Promise<string | null> {
  const porDominio = dominio ? await tx.marcaRelevada.findFirst({ where: { tenantId, dominio }, select: { id: true } }) : null;
  if (porDominio) return porDominio.id;
  const porNombre = await tx.marcaRelevada.findFirst({ where: { tenantId, clave: claveMarca(nombre) }, select: { id: true } });
  return porNombre?.id ?? null;
}

// ── Quién carga ─────────────────────────────────────────────────────────────

interface Cargadores {
  direccion: string;
  prospectos: string;
  comerciales: string[];
}

async function cargadores(tenantId: string): Promise<Cargadores> {
  return tenantTransaction(
    async (tx) => {
      const miembros = await tx.miembroCrmComercial.findMany({ where: { tenantId, activo: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { userId: true, rol: true, puesto: true } });
      const direccion = miembros.find((m) => m.rol === "DIRECCION")?.userId;
      if (!direccion) throw new Error("El negocio no tiene a nadie activo en Dirección del CRM comercial: primero los usuarios, después la carga.");
      const desc = miembros.find((m) => m.rol === "PUESTO" && (m.puesto === "descubridor" || m.puesto === "identificador"))?.userId;
      const comerciales = miembros.filter((m) => m.rol === "COMERCIAL").map((m) => m.userId);
      return { direccion, prospectos: desc ?? direccion, comerciales: comerciales.length ? comerciales : [direccion] };
    },
    { tenantId },
  );
}

// ── Carga ───────────────────────────────────────────────────────────────────

export interface ResultadoLead {
  id: string;
  tipo: "CONSULTA" | "PROSPECTO";
  resultado: "CREADA" | "UNIDA" | "FRENADA" | "YA_CARGADA";
  oportunidadId: string | null;
  etapa: string | null;
  motivo?: string | null;
  aviso?: string | null;
}

export interface InformeCarga {
  ok: true;
  negocio: string;
  lote: string;
  clientes: { id: string; resultado: "CREADO" | "YA_CARGADO"; oportunidadId: string | null }[];
  leads: ResultadoLead[];
  /** Oportunidades anotadas de prueba en el negocio, por etapa (después de la carga). */
  porEtapa: Record<string, number>;
  oportunidadesDePrueba: number;
}

export interface PedidoDeCarga {
  slug: string;
  leads: LeadDePrueba[];
  clientes: ClienteDePrueba[];
  lote?: string;
  ahora?: Date;
  /** `--produccion`: habilita Neon sólo si además `CRM_PRUEBA_CONFIRMO_NEGOCIO` es este slug (`guardaDeBase`). */
  produccion?: boolean;
}

const permisoDe = (slug: string, produccion?: boolean): PermisoProduccion => ({ produccion: produccion === true, negocio: slug, confirmo: process.env.CRM_PRUEBA_CONFIRMO_NEGOCIO });

function textoDelLead(l: LeadDePrueba): string {
  const partes: string[] = [];
  if (esConsulta(l)) {
    const de = l.de ? [l.de.nombre, l.de.cargo ? `(${l.de.cargo})` : null, l.de.email ? `<${l.de.email}>` : null, l.de.telefono].filter(Boolean).join(" ") : "";
    partes.push(`Consulta recibida${l.recibido ? ` el ${l.recibido}` : ""}${l.canal ? ` por ${l.canal}` : ""}.${de ? ` De: ${de}.` : ""}`);
  } else {
    const f = l.fuente;
    partes.push(`Detectado${l.detectado ? ` el ${l.detectado}` : ""}.${f ? ` Fuente: ${f.descripcion ?? "(sin descripción)"}${f.url ? ` · ${f.url}` : " · sin link"}${f.confirmado ? ` · según la fuente: ${f.confirmado}` : ""}.` : " Sin fuente."}`);
  }
  if (l.rubro) partes.push(`Rubro: ${l.rubro}.`);
  if (l.evento) partes.push(`Evento (como vino): ${[l.evento.nombre, l.evento.fecha, l.evento.lugar].filter(Boolean).join(" · ")}.`);
  if (l.texto) partes.push(`\n${l.texto}`);
  if (l.datos_conocidos && Object.keys(l.datos_conocidos).length) {
    partes.push(`\nDatos como vinieron (sin verificar): ${Object.entries(l.datos_conocidos).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}`);
  }
  return partes.join(" ").slice(0, 10_000);
}

async function cargarCliente(tenantId: string, lote: string, c: ClienteDePrueba, quien: Cargadores, comercial: string, ahora: Date): Promise<InformeCarga["clientes"][number]> {
  return tenantTransaction(
    async (tx) => {
      const ya = await anotado(tx, tenantId, "CLIENTE", c.id);
      if (ya) return { id: c.id, resultado: "YA_CARGADO" as const, oportunidadId: ya.filaId };
      const dominio = dominioDe(c.dominio ?? null);
      let marcaId = await marcaExistente(tx, tenantId, c.marca, dominio);
      if (!marcaId) {
        const m = await tx.marcaRelevada.create({ data: { tenantId, clave: claveMarca(c.marca), nombre: c.marca.trim().slice(0, 200), dominio, rubro: c.rubro?.slice(0, 120) ?? null }, select: { id: true } });
        marcaId = m.id;
        await anotar(tx, tenantId, lote, "MARCA", m.id, m.id);
      }
      const p = c.proyecto_en_curso ?? null;
      const eventoId = p ? await asegurarEvento(tx, tenantId, lote, { nombre: p.evento, fecha: p.fecha_evento, lugar: p.lugar }) : null;
      if (eventoId && dominio) {
        // La marca está en ese evento porque es nuestro proyecto en curso (dato interno; la «fuente» es su sitio).
        const em = await tx.eventoMarca.findFirst({ where: { tenantId, eventoId, marcaId, rol: "EXPOSITOR" }, select: { id: true } });
        if (!em) {
          const nuevo = await tx.eventoMarca.create({ data: { tenantId, eventoId, marcaId, rol: "EXPOSITOR", urlFuente: `https://${dominio}`, edicion: leerFechas(p?.fecha_evento)?.desde.slice(0, 4) ?? null, verificacion: "confirmado" }, select: { id: true } });
          await anotar(tx, tenantId, lote, "EVENTO_MARCA", nuevo.id, nuevo.id);
        }
      }
      const nota = [
        "Cliente activo (dato de la prueba).",
        p ? `Proyecto en curso: ${[p.descripcion, p.evento, p.fecha_evento, p.lugar, p.estado].filter(Boolean).join(" · ")}.` : null,
        c.responsable_de_cuenta ? `En el archivo la cuenta la lleva: ${c.responsable_de_cuenta}.` : null,
        c.notas ? `Notas: ${c.notas}` : null,
      ]
        .filter(Boolean)
        .join(" ")
        .slice(0, 4000);
      const op = await tx.oportunidad.create({
        data: { tenantId, tipo: "PROSPECTO", marcaId, eventoId, etapa: "GANADA", etapaDesde: ahora, duenoUserId: comercial, creadaPor: quien.direccion, nota, idempotencia: `prueba-${lote}-${c.id}`, ultimaActividadEl: ahora },
        select: { id: true },
      });
      await anotar(tx, tenantId, lote, "OPORTUNIDAD", op.id, op.id);
      await tx.actividadComercial.create({ data: { tenantId, oportunidadId: op.id, usuarioId: quien.direccion, tipo: "CLIENTE_ACTIVO", texto: nota }, select: { id: true } });
      await anotar(tx, tenantId, lote, "CLIENTE", c.id, op.id, "CREADO");
      return { id: c.id, resultado: "CREADO" as const, oportunidadId: op.id };
    },
    { tenantId },
  );
}

async function cargarLead(tenantId: string, lote: string, l: LeadDePrueba, quien: Cargadores, ahora: Date): Promise<ResultadoLead> {
  const tipo = esConsulta(l) ? ("CONSULTA" as const) : ("PROSPECTO" as const);
  const previo = await tenantTransaction((tx) => anotado(tx, tenantId, "LEAD", l.id), { tenantId });
  if (previo) {
    const etapa = previo.filaId ? await tenantTransaction((tx) => tx.oportunidad.findFirst({ where: { id: previo.filaId as string, tenantId }, select: { etapa: true } }), { tenantId }) : null;
    return { id: l.id, tipo, resultado: "YA_CARGADA", oportunidadId: previo.filaId, etapa: etapa?.etapa ?? null, motivo: previo.nota };
  }

  const conMarca = !sinMarca(l.marca);
  const dominio = conMarca ? dominioDe(l.dominio ?? null) : null;
  const { eventoId, marcaYaEstaba } = await tenantTransaction(
    async (tx) => ({
      eventoId: await asegurarEvento(tx, tenantId, lote, l.evento),
      marcaYaEstaba: conMarca ? !!(await marcaExistente(tx, tenantId, (l.marca as string).trim(), dominio)) : true,
    }),
    { tenantId },
  );

  const ctx: repo.Ctx = { tenantId, userId: tipo === "CONSULTA" ? quien.direccion : quien.prospectos };
  const fuenteUrl = l.fuente?.url && /^https?:\/\//i.test(l.fuente.url) ? l.fuente.url : null;
  const r = await repo.proponerOportunidad(
    ctx,
    {
      tipo,
      marca: conMarca ? { nombre: (l.marca as string).trim(), dominio, rubro: l.rubro ?? null } : null,
      eventoId,
      consultaTexto: textoDelLead(l),
      proximoPaso: tipo === "CONSULTA" ? "Comprobar quién escribe y ver qué datos faltan" : "Verificar la marca en el evento con la fuente",
      proximoPasoEl: new Date(ahora.getTime() + (tipo === "CONSULTA" ? 1 : 2) * DIA),
      fuenteUrl,
      idempotencia: `prueba-${lote}-${l.id}`,
    },
    ahora,
  );
  if (!r.ok) {
    if (r.faltaMigracion) throw new SinMigracionDePrueba();
    await tenantTransaction((tx) => anotar(tx, tenantId, lote, "LEAD", l.id, null, `FRENADA: ${r.motivo}`), { tenantId });
    return { id: l.id, tipo, resultado: "FRENADA", oportunidadId: null, etapa: null, motivo: r.motivo };
  }
  const unida = !!r.unida;

  await tenantTransaction(
    async (tx) => {
      const o = await tx.oportunidad.findFirst({ where: { id: r.id, tenantId }, select: { marcaId: true } });
      if (!unida) await anotar(tx, tenantId, lote, "OPORTUNIDAD", r.id, r.id);
      if (o?.marcaId && !marcaYaEstaba) await anotar(tx, tenantId, lote, "MARCA", o.marcaId, o.marcaId);
      if (tipo === "PROSPECTO" && fuenteUrl && eventoId && o?.marcaId) {
        const em = await tx.eventoMarca.findFirst({ where: { tenantId, eventoId, marcaId: o.marcaId }, select: { id: true } });
        if (!em) {
          const nuevo = await tx.eventoMarca.create({ data: { tenantId, eventoId, marcaId: o.marcaId, rol: "EXPOSITOR", urlFuente: fuenteUrl.slice(0, 1000), edicion: leerFechas(l.evento?.fecha)?.desde.slice(0, 4) ?? null }, select: { id: true } });
          await anotar(tx, tenantId, lote, "EVENTO_MARCA", nuevo.id, nuevo.id);
        }
      }
    },
    { tenantId },
  );

  // Quien escribió la consulta: contacto «de consulta entrante», cargado por la persona que cargó la consulta.
  if (tipo === "CONSULTA" && l.de && (l.de.email || l.de.telefono) && l.de.nombre) {
    const ya = await tenantTransaction((tx) => anotado(tx, tenantId, "CONTACTO", l.id), { tenantId });
    if (!ya) {
      const c = await repo.crearContacto({ tenantId, userId: quien.direccion }, { oportunidadId: r.id, nombre: l.de.nombre, email: l.de.email ?? null, telefono: l.de.telefono ?? null, cargo: l.de.cargo ?? null, deConsultaEntrante: true, papel: "PIDE" }, ahora);
      if (c.ok) await tenantTransaction((tx) => anotar(tx, tenantId, lote, "CONTACTO", l.id, c.id), { tenantId });
    }
  }

  // Primera tarea en la cola: sin ella ningún puesto ve la oportunidad (sólo ve lo que creó o lo que tomó).
  if (!unida) {
    await repo.crearTarea(
      { tenantId, userId: quien.direccion },
      { oportunidadId: r.id, para: tipo === "CONSULTA" ? "calificador" : "verificador", tipo: tipo === "CONSULTA" ? "PUNTUAR" : "VERIFICAR", idempotencia: `prueba-${lote}-${l.id}-primera` },
      ahora,
    );
  }

  const nota = unida ? `UNIDA: se sumó a la oportunidad abierta de la misma marca y evento (E1).` : `CREADA${r.aviso ? ` · aviso: ${r.aviso}` : ""}`;
  await tenantTransaction((tx) => anotar(tx, tenantId, lote, "LEAD", l.id, r.id, nota), { tenantId });
  const etapa = await tenantTransaction((tx) => tx.oportunidad.findFirst({ where: { id: r.id, tenantId }, select: { etapa: true } }), { tenantId });
  return { id: l.id, tipo, resultado: unida ? "UNIDA" : "CREADA", oportunidadId: r.id, etapa: etapa?.etapa ?? null, aviso: r.aviso ?? null };
}

/**
 * Carga la prueba en el negocio `slug`. Primero los clientes activos (ya existían), después los leads en el
 * orden en que llegaron (fecha de detección o de recepción). Idempotente.
 */
export async function cargarPrueba(p: PedidoDeCarga): Promise<InformeCarga> {
  const g = guardaDeBase(process.env.DATABASE_URL, permisoDe(p.slug, p.produccion));
  if (!g.ok) throw new Error(g.motivo);
  const lote = p.lote ?? LOTE_POR_DEFECTO;
  const ahora = p.ahora ?? new Date();
  const negocio = await negocioPorSlug(p.slug);
  if (!negocio) throw new Error(`No hay un negocio con el slug «${p.slug}».`);
  const tenantId = negocio.id;
  try {
    await tenantTransaction((tx) => tx.filaDePruebaCrm.count({ where: { tenantId } }), { tenantId });
  } catch (e) {
    if (esFaltaDeTablaDePrueba(e) || repo.esFaltaDeTabla(e)) throw new SinMigracionDePrueba();
    throw e;
  }
  const quien = await cargadores(tenantId);

  const clientes: InformeCarga["clientes"] = [];
  for (const [i, c] of p.clientes.entries()) {
    clientes.push(await cargarCliente(tenantId, lote, c, quien, quien.comerciales[i % quien.comerciales.length], ahora));
  }
  const orden = [...p.leads].sort((a, b) => momento(a).localeCompare(momento(b)) || a.id.localeCompare(b.id));
  const leads: ResultadoLead[] = [];
  for (const l of orden) leads.push(await cargarLead(tenantId, lote, l, quien, ahora));

  const resumen = await tenantTransaction(
    async (tx) => {
      const ids = (await tx.filaDePruebaCrm.findMany({ where: { tenantId, entidad: "OPORTUNIDAD" }, select: { filaId: true } })).map((f) => f.filaId).filter((x): x is string => !!x);
      const grupos = await tx.oportunidad.groupBy({ by: ["etapa"], where: { tenantId, id: { in: ids } }, _count: { _all: true } });
      return { total: ids.length, porEtapa: Object.fromEntries(grupos.map((g) => [g.etapa, g._count._all])) };
    },
    { tenantId },
  );
  return { ok: true, negocio: negocio.slug, lote, clientes, leads: leads.sort((a, b) => a.id.localeCompare(b.id)), porEtapa: resumen.porEtapa, oportunidadesDePrueba: resumen.total };
}

// ── Limpieza ────────────────────────────────────────────────────────────────

export interface InformeLimpieza {
  ok: true;
  negocio: string;
  aplicado: boolean;
  borradas: Record<string, number>;
  /** Lo anotado que NO se borra porque algo que no es de la prueba lo usa (se informa, no se fuerza). */
  quedan: { marcas: string[]; eventos: string[]; contactos: string[] };
  /** Proyectos que nacieron al ASIGNAR una oportunidad de prueba: viven en Proyectos y se borran desde ahí. */
  proyectosNacidosDeLaPrueba: string[];
}

class Simulacro extends Error {
  constructor(readonly informe: InformeLimpieza) {
    super("simulacro");
  }
}

/**
 * Borra SÓLO lo anotado de prueba en el negocio `slug` y lo que cuelga de sus oportunidades (actividad, tareas,
 * borradores, brief, vínculos). `aplicar: false` (por defecto) corre lo mismo y lo deshace: las cifras son reales.
 */
export async function limpiarPrueba(p: { slug: string; aplicar?: boolean; produccion?: boolean }): Promise<InformeLimpieza> {
  const g = guardaDeBase(process.env.DATABASE_URL, permisoDe(p.slug, p.produccion));
  if (!g.ok) throw new Error(g.motivo);
  const negocio = await negocioPorSlug(p.slug);
  if (!negocio) throw new Error(`No hay un negocio con el slug «${p.slug}».`);
  const tenantId = negocio.id;
  const aplicar = p.aplicar === true;
  try {
    return await tenantTransaction(
      async (tx) => {
        const filas = await tx.filaDePruebaCrm.findMany({ where: { tenantId }, select: { id: true, entidad: true, filaId: true } });
        const de = (e: Entidad) => [...new Set(filas.filter((f) => f.entidad === e && f.filaId).map((f) => f.filaId as string))];
        const ops = await tx.oportunidad.findMany({ where: { tenantId, id: { in: de("OPORTUNIDAD") } }, select: { id: true, proyectoId: true, contactoId: true } });
        const opIds = ops.map((o) => o.id);
        const marcas = de("MARCA");
        const eventos = de("EVENTO");

        // Contactos candidatos: los anotados, los de marcas de prueba y los que usan las oportunidades de prueba.
        const [deMarcas, vinc, borr] = await Promise.all([
          tx.contactoComercial.findMany({ where: { tenantId, marcaId: { in: marcas } }, select: { id: true } }),
          tx.oportunidadContacto.findMany({ where: { tenantId, oportunidadId: { in: opIds } }, select: { contactoId: true } }),
          tx.borradorMensaje.findMany({ where: { tenantId, oportunidadId: { in: opIds }, contactoId: { not: null } }, select: { contactoId: true } }),
        ]);
        const candidatos = [...new Set([...de("CONTACTO"), ...deMarcas.map((c) => c.id), ...ops.map((o) => o.contactoId), ...vinc.map((v) => v.contactoId), ...borr.map((b) => b.contactoId)].filter((x): x is string => !!x))];

        const borradas: Record<string, number> = {};
        const donde = { tenantId, oportunidadId: { in: opIds } };
        borradas.vinculos = (await tx.oportunidadContacto.deleteMany({ where: donde })).count;
        borradas.borradores = (await tx.borradorMensaje.deleteMany({ where: donde })).count;
        borradas.tareas = (await tx.tareaComercial.deleteMany({ where: donde })).count;
        borradas.briefs = (await tx.briefComercial.deleteMany({ where: donde })).count;
        borradas.actividades = (await tx.actividadComercial.deleteMany({ where: donde })).count;
        borradas.oportunidades = (await tx.oportunidad.deleteMany({ where: { tenantId, id: { in: opIds } } })).count;

        // Lo que todavía usa algo que no es de la prueba se queda (y se informa).
        const [usaC1, usaC2, usaC3] = await Promise.all([
          tx.oportunidad.findMany({ where: { tenantId, contactoId: { in: candidatos } }, select: { contactoId: true } }),
          tx.oportunidadContacto.findMany({ where: { tenantId, contactoId: { in: candidatos } }, select: { contactoId: true } }),
          tx.borradorMensaje.findMany({ where: { tenantId, contactoId: { in: candidatos } }, select: { contactoId: true } }),
        ]);
        const contactosQuedan = new Set([...usaC1, ...usaC2, ...usaC3].map((x) => x.contactoId as string));
        const contactos = candidatos.filter((c) => !contactosQuedan.has(c));
        borradas.contactos = (await tx.contactoComercial.deleteMany({ where: { tenantId, id: { in: contactos } } })).count;
        borradas.marcaEnEvento = (await tx.eventoMarca.deleteMany({ where: { tenantId, id: { in: de("EVENTO_MARCA") } } })).count;

        const [opsEv, emEv] = await Promise.all([
          tx.oportunidad.findMany({ where: { tenantId, eventoId: { in: eventos } }, select: { eventoId: true } }),
          tx.eventoMarca.findMany({ where: { tenantId, eventoId: { in: eventos } }, select: { eventoId: true } }),
        ]);
        const eventosQuedan = new Set([...opsEv, ...emEv].map((x) => x.eventoId as string));
        const eventosBorrar = eventos.filter((e) => !eventosQuedan.has(e));
        borradas.eventos = (await tx.eventoRelevado.deleteMany({ where: { tenantId, id: { in: eventosBorrar } } })).count;

        const [opsM, opsVia, emM, cM] = await Promise.all([
          tx.oportunidad.findMany({ where: { tenantId, marcaId: { in: marcas } }, select: { marcaId: true } }),
          tx.oportunidad.findMany({ where: { tenantId, compraAtravesDeMarcaId: { in: marcas } }, select: { compraAtravesDeMarcaId: true } }),
          tx.eventoMarca.findMany({ where: { tenantId, marcaId: { in: marcas } }, select: { marcaId: true } }),
          tx.contactoComercial.findMany({ where: { tenantId, marcaId: { in: marcas } }, select: { marcaId: true } }),
        ]);
        const marcasQuedan = new Set([...opsM.map((x) => x.marcaId), ...opsVia.map((x) => x.compraAtravesDeMarcaId), ...emM.map((x) => x.marcaId), ...cM.map((x) => x.marcaId)].filter((x): x is string => !!x));
        const marcasBorrar = marcas.filter((m) => !marcasQuedan.has(m));
        borradas.marcas = (await tx.marcaRelevada.deleteMany({ where: { tenantId, id: { in: marcasBorrar } } })).count;

        // Las anotaciones de lo que se quedó siguen (una limpieza posterior lo reintenta); el resto se va.
        const siguen = new Set([...marcasQuedan, ...eventosQuedan, ...contactosQuedan]);
        borradas.anotaciones = (await tx.filaDePruebaCrm.deleteMany({ where: { tenantId, id: { in: filas.filter((f) => !(f.filaId && siguen.has(f.filaId) && ["MARCA", "EVENTO", "CONTACTO"].includes(f.entidad))).map((f) => f.id) } } })).count;

        const informe: InformeLimpieza = {
          ok: true,
          negocio: negocio.slug,
          aplicado: aplicar,
          borradas,
          quedan: { marcas: marcas.filter((m) => marcasQuedan.has(m)), eventos: eventos.filter((e) => eventosQuedan.has(e)), contactos: candidatos.filter((c) => contactosQuedan.has(c)) },
          proyectosNacidosDeLaPrueba: ops.map((o) => o.proyectoId).filter((x): x is string => !!x),
        };
        if (!aplicar) throw new Simulacro(informe);
        return informe;
      },
      { tenantId, timeoutMs: 60_000 },
    );
  } catch (e) {
    if (e instanceof Simulacro) return e.informe;
    if (esFaltaDeTablaDePrueba(e) || repo.esFaltaDeTabla(e)) throw new SinMigracionDePrueba();
    throw e;
  }
}
