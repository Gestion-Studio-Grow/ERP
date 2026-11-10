// ProfeTurnos — alta sola de un profe de pádel: la escritura (lo puro está en alta-core.ts).
//
// Todo en UNA transacción: la fábrica de ADR-019 (`provisionTenant`, scripts/provision-tenant.ts) crea
// el negocio (rubro `profe-padel`, módulos `padel-clases` + `clients`, dirección = slug) y su titular
// OWNER; después, parados en el negocio nuevo, se arma el turnero (PadelConfig con el WhatsApp del
// profe), se apaga el cambio obligatorio de clave y se audita. O queda todo, o nada.
//
// LA CONTRASEÑA la eligió el profe en el formulario (no la conoce nadie más): por eso NO es una
// provisoria y `mustChangePassword` queda en false (la fábrica la pone en true para las que genera
// GSG). No viaja a ningún lado: no hay mail en esta tanda, así que no hay nada que pueda fallar
// después del COMMIT.
//
// CONCURRENCIA: un candado de transacción (advisory) serializa las altas de ProfeTurnos; con él, la
// búsqueda de direcciones ocupadas ya ve lo que confirmó la anterior. Si igual choca (otra superficie
// creó el mismo slug), la fábrica (con `soloNuevo`) da P2002 o reencuentra un negocio que NO es nuestro:
// se tira y la transacción vuelve atrás entera (nunca se suma un OWNER a un negocio ajeno). Se reintenta
// con la dirección siguiente.

import type { PrismaClient } from "@/generated/prisma/client";
import { crearClienteProvisioning } from "@/lib/cartera-core";
import { provisionTenant } from "../../../scripts/provision-tenant";
import {
  BLUEPRINT_PROFE,
  MODULOS_PROFE,
  cayoEnLaTrampa,
  slugLibre,
  slugSugerido,
  urlDelPanel,
  validarAlta,
  type CampoDelAlta,
  type DatosDelAlta,
  type FormularioDelAlta,
  type Limites,
} from "./alta-core";

export interface DepsAltaProfe {
  /** La conexión del plano de operador (app_rls, sujeta a RLS), como el alta de Factoque. */
  prisma: PrismaClient;
  limites: Limites;
  /** Dominio de las direcciones de los negocios (APP_BASE_DOMAIN). */
  dominio: string;
  /** El flag `PROFETURNOS_ALTA_ABIERTA === "1"` ya leído. */
  abierta: boolean;
}

export type RespuestaDelAlta =
  | { ok: true; slug: string; url: string }
  | { ok: false; errores: Partial<Record<CampoDelAlta, string>> }
  | { ok: false; motivo: "cerrada" | "frenado" | "error"; mensaje: string };

export const MENSAJES = {
  cerrada: "El alta todavía no está abierta. Muy pronto vas a poder crear tu turnero desde acá.",
  frenado: "Recibimos varios pedidos seguidos desde acá. Esperá un rato y probá de nuevo.",
  error: "No pudimos crear tu turnero. Probá de nuevo en un rato; si sigue, escribinos.",
} as const;

const ACTOR = "web:alta-profeturnos";
const INTENTOS = 3;

/** Un dato que impide el alta (dirección tomada por otro). No se muestra: se reintenta. */
class ChoqueDeDireccion extends Error {
  /** La dirección que chocó (null: no quedó ninguna libre). */
  constructor(readonly slug: string | null) {
    super("dirección tomada");
  }
}

function esChoqueDeUnicidad(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

async function escribirEnUnaTransaccion(prisma: PrismaClient, d: DatosDelAlta, saltear: ReadonlySet<string>): Promise<{ tenantId: string; slug: string }> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('profeturnos.alta'))`;

    const base = slugSugerido(d.negocio);
    const ocupados = await tx.tenant.findMany({
      where: { OR: [{ slug: { startsWith: base } }, { subdomain: { startsWith: base } }] },
      select: { slug: true, subdomain: true },
    });
    const usados = [...saltear, ...ocupados.flatMap((t) => [t.slug, t.subdomain ?? ""])];
    const slug = slugLibre(base, usados);
    if (!slug) throw new ChoqueDeDireccion(null);

    let fabrica: Awaited<ReturnType<typeof provisionTenant>>;
    try {
      fabrica = await provisionTenant(crearClienteProvisioning({ $transaction: (fn) => fn(tx) }) as unknown as PrismaClient, {
        name: d.negocio,
        slug,
        owner: { name: d.nombre, email: d.email, password: d.clave },
        blueprint: BLUEPRINT_PROFE,
        // El rubro siembra servicios/box/profesional de la agenda del motor, que el profe no usa
        // (padel-clases tiene su propia agenda): sin catálogo de ejemplo.
        skipCatalog: true,
        branding: { email: d.email, whatsapp: d.whatsapp },
        platform: { status: "TRIAL", subdomain: slug, modules: [...MODULOS_PROFE] },
        // Sólo un negocio NUEVO: si otra superficie confirma el mismo slug en el medio, `create` da P2002
        // en vez de devolver el negocio ajeno (el upsert lo devolvía con tenantCreated en true).
        soloNuevo: true,
      });
    } catch (e) {
      // Otra superficie (Factoque, la consola) tomó la dirección: la transacción vuelve atrás y se
      // reintenta con el sufijo siguiente.
      if (esChoqueDeUnicidad(e)) throw new ChoqueDeDireccion(slug);
      throw e;
    }
    // Sólo negocios NUEVOS: si la fábrica reencontró uno, es de otro (la transacción vuelve atrás).
    if (!fabrica.tenantCreated || !fabrica.ownerCreated) throw new ChoqueDeDireccion(slug);
    const tenantId = fabrica.tenantId;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;

    // La clave la eligió el profe: no es provisoria (ver cabecera).
    const r = await tx.user.updateMany({
      where: { tenantId, email: d.email, role: "OWNER" },
      data: { mustChangePassword: false },
    });
    if (r.count !== 1) throw new Error("profeturnos.alta: el titular no quedó creado");

    // El turnero: su configuración con el celular del profe (el wa.me del alumno). El resto, defaults.
    await tx.padelConfig.create({ data: { tenantId, whatsappProfe: d.whatsapp }, select: { id: true } });

    // Sin datos personales ni la clave: qué se creó y desde dónde.
    await tx.auditLog.create({
      data: {
        tenantId,
        actor: ACTOR,
        action: "profeturnos.alta",
        entity: "Tenant",
        entityId: tenantId,
        changes: {
          origen: "alta-web",
          slug,
          blueprint: BLUEPRINT_PROFE,
          modulos: [...MODULOS_PROFE],
          claveElegidaPorElTitular: true,
          obligaACambiar: false,
        },
      },
    });
    return { tenantId, slug };
  });
}

/**
 * El alta entera desde el formulario público. Orden: flag → trampa → validación → límites →
 * escritura. Nada se escribe si algo de antes frena.
 */
export async function darDeAltaProfe(deps: DepsAltaProfe, f: FormularioDelAlta, ip: string): Promise<RespuestaDelAlta> {
  if (!deps.abierta) return { ok: false, motivo: "cerrada", mensaje: MENSAJES.cerrada };
  // El robot que llenó la trampa recibe un error genérico y no pasa nada.
  if (cayoEnLaTrampa(f.trampa)) return { ok: false, motivo: "error", mensaje: MENSAJES.error };
  const v = validarAlta(f);
  if (!v.ok) return v;
  const d = v.datos;
  if (!deps.limites.pasa([`alta-ip:${ip}`, `alta-mail:${d.email}`])) return { ok: false, motivo: "frenado", mensaje: MENSAJES.frenado };

  const saltear = new Set<string>();
  for (let intento = 0; intento < INTENTOS; intento++) {
    try {
      const w = await escribirEnUnaTransaccion(deps.prisma, d, saltear);
      return { ok: true, slug: w.slug, url: urlDelPanel(w.slug, deps.dominio) };
    } catch (e) {
      if (e instanceof ChoqueDeDireccion) {
        if (!e.slug) break;
        saltear.add(e.slug);
        continue;
      }
      if (esChoqueDeUnicidad(e)) continue;
      // Sin datos del pedido en el registro: sólo el tipo de error.
      console.error(`[profeturnos-alta] el alta falló: ${e instanceof Error ? e.name : "error"}`);
      return { ok: false, motivo: "error", mensaje: MENSAJES.error };
    }
  }
  return { ok: false, motivo: "error", mensaje: MENSAJES.error };
}
