// Alta automatizada de un negocio Factoque — la escritura (ver la cabecera de `alta-negocio-core.ts`).
//
// Todo en UNA transacción, como el configurador de /operador (solicitudes/configurador.server.ts):
// la fábrica de ADR-019 (`provisionTenant`) crea o reencuentra el negocio por slug y su titular;
// después, con el GUC del negocio puesto y el candado del CUIT tomado, se completan CUIT, punto de
// venta, condición frente al IVA, módulos y subdominio, y se audita. O queda todo, o nada.
//
// IDEMPOTENTE: re-correrlo con los mismos datos no duplica ni pisa. Si el slug ya existe completa lo
// que falte; si un dato fiscal YA cargado no coincide con lo pedido, se niega (no se pisa un CUIT ni
// un talonario en silencio: eso se corrige desde la ficha del negocio, auditado).
//
// LA CONTRASEÑA: se genera acá, se guarda en un archivo local 0600 ANTES de escribir (si algo se cae
// entre el COMMIT y el mail, no se pierde una clave que ya quedó hasheada), viaja sólo en el mail al
// titular y el archivo se borra al confirmarse el envío. Sin `mustChangePassword` persistido (la
// columna de 20261109120000_must_change_password) el alta se deshace: la regla del dueño es que la
// provisoria obliga a cambiarse en el primer ingreso (src/lib/ingreso.server.ts → /admin/cambiar-password).

import type { PrismaClient } from "@/generated/prisma/client";
import { generateStrongPassword } from "@/lib/auth-password";
import { crearClienteProvisioning } from "@/lib/cartera-core";
import { interpretarCondicionIva, CONDICIONES_DEL_EMISOR } from "@/lib/fiscal/condicion-iva-emisor";
import { CAMBIO_OBLIGATORIO_INACTIVO, operatorSetMustChange } from "@/lib/must-change-password";
import {
  choqueDePuntoDeVenta,
  motivoDeChoque,
  puntosDeVentaUsados,
  type NegocioFiscal,
} from "@/app/operador/(console)/tenants/[id]/candado-punto-venta";
import { provisionTenant } from "../../../scripts/provision-tenant";
import { situacionDelCuit } from "./alta-web-core";
// La MISMA llave que `bloquearCuit` de src/lib/operator-actions.ts (que no se puede importar: es
// "use server"). Así el alta, la ficha y la carga del certificado se esperan entre sí.
import { bloquearCuit, tenedoresDelCuit } from "./tenedores-del-cuit.server";
import {
  BLUEPRINT_FACTOQUE,
  MODULOS_FACTOQUE,
  USO,
  claveAEntregar,
  interpretarArgs,
  lineasDeSalida,
  mailAlTitular,
  urlDelNegocio,
  type DatosDelAlta,
  type EstadoDeLaClave,
  type ResultadoDelAlta,
} from "./alta-negocio-core";

/** Dónde espera la contraseña provisoria hasta que se entrega. Sólo el disco de quien corre el alta. */
export interface GuardaDeClaves {
  leer(slug: string): string | null;
  /** Escribe con permisos 0600 y devuelve la ruta. */
  guardar(slug: string, clave: string): string;
  borrar(slug: string): void;
  ruta(slug: string): string;
}

export interface Correo {
  enviar(d: { tenantId: string; para: string; asunto: string; cuerpo: string }): Promise<{ sent: boolean; reason?: string }>;
}

export interface DependenciasDelAlta {
  claves: GuardaDeClaves;
  correo: Correo;
  /** Dominio de las direcciones de los negocios (default gsgapp.com.ar). */
  dominio?: string;
}

/** Un dato que no se puede completar sin pisar algo. Mensaje en criollo, sin stack. */
export class RechazoDelAlta extends Error {}

/**
 * Alta web: el CUIT no se puede tomar (un negocio verificado o de GSG lo tiene, o este mismo mail ya
 * tiene su negocio con ese CUIT). La web no lo dice en pantalla.
 */
export class CuitYaRegistrado extends RechazoDelAlta {}



interface Escrito {
  tenantId: string;
  titularId: string;
  subdominio: string;
  negocioCreado: boolean;
  completado: string[];
  entrega: "nueva" | "pendiente" | "ninguna";
  obligaACambiar: boolean;
}

async function escribirEnUnaTransaccion(
  prisma: PrismaClient,
  d: DatosDelAlta,
  clave: string,
  habiaArchivo: boolean,
  web: { ahora: number } | null = null,
): Promise<Escrito> {
  return prisma.$transaction(async (tx) => {
    if (web) {
      // ALTA WEB: sólo negocios NUEVOS. El candado del CUIT va ANTES de crear nada: dos
      // confirmaciones con el mismo CUIT se ponen en fila y la segunda ve el negocio de la primera.
      // Sólo bloquean un negocio verificado (con ARCA conectado) o uno dado de alta por GSG; un alta
      // web sin verificar se puede reclamar y una vencida ya no cuenta (alta-web-core.ts).
      await bloquearCuit(tx, d.cuit);
      const situacion = situacionDelCuit(await tenedoresDelCuit(tx, d.cuit), web.ahora, d.email);
      if (situacion.tipo === "propio" || situacion.tipo === "bloqueado") {
        throw new CuitYaRegistrado("Ese CUIT ya tiene un negocio en Factoque.");
      }
      const mismoSlug = await tx.tenant.findFirst({ where: { OR: [{ slug: d.slug }, { subdomain: d.slug }] }, select: { id: true } });
      if (mismoSlug) throw new RechazoDelAlta(`La dirección "${d.slug}" ya está tomada.`);
    }
    const previo = await tx.tenant.findUnique({ where: { slug: d.slug }, select: { id: true, blueprintId: true } });
    if (previo && previo.blueprintId !== BLUEPRINT_FACTOQUE) {
      throw new RechazoDelAlta(
        `El slug "${d.slug}" ya es de un negocio que no es Factoque (${previo.blueprintId ?? "sin vertical"}). Elegí otro slug.`,
      );
    }
    if (!previo) {
      const ocupado = await tx.tenant.findUnique({ where: { subdomain: d.slug }, select: { slug: true } });
      if (ocupado) throw new RechazoDelAlta(`La dirección "${d.slug}" ya la usa el negocio "${ocupado.slug}". Elegí otro slug.`);
    }

    const fabrica = await provisionTenant(crearClienteProvisioning({ $transaction: (fn) => fn(tx) }) as unknown as PrismaClient, {
      name: d.nombre,
      slug: d.slug,
      owner: { name: d.titular, email: d.email, password: clave },
      blueprint: BLUEPRINT_FACTOQUE,
      skipCatalog: true,
      branding: { email: d.email },
      platform: { subdomain: d.slug, modules: [...MODULOS_FACTOQUE] },
    });
    const tenantId = fabrica.tenantId;
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    await bloquearCuit(tx, d.cuit);

    const t = await tx.tenant.findUniqueOrThrow({
      where: { id: tenantId },
      select: { arcaCuit: true, arcaPuntoVenta: true, arcaCondicionIva: true, arcaHomologacion: true, modules: true, subdomain: true },
    });
    const data: { arcaCuit?: string; arcaPuntoVenta?: number; arcaCondicionIva?: string; modules?: string[]; subdomain?: string } = {};
    const completado: string[] = [];
    const auditar: { action: string; changes: Record<string, unknown> }[] = [];

    // CUIT: se carga si falta; si hay otro, no se pisa.
    if (!t.arcaCuit) {
      data.arcaCuit = d.cuit;
      completado.push("CUIT");
      auditar.push({ action: "fiscal.cuit.set", changes: { arcaCuit: d.cuit, antes: t.arcaCuit } });
    } else if (t.arcaCuit !== d.cuit) {
      throw new RechazoDelAlta(`"${d.slug}" ya tiene el CUIT ${t.arcaCuit} y pediste ${d.cuit}. No se pisa: corregilo desde la ficha del negocio.`);
    }

    // Punto de venta: candado fiscal (un CUIT no repite talonario entre negocios). En el alta web los
    // que quedan con ese CUIT son altas sin verificar (si no, ya se rechazó arriba): no reservan nada,
    // porque el talonario es del que conecte ARCA.
    if (t.arcaPuntoVenta == null && web) {
      data.arcaPuntoVenta = d.puntoVenta;
      completado.push("punto de venta");
      auditar.push({ action: "fiscal.puntoVenta.set", changes: { arcaPuntoVenta: d.puntoVenta, antes: null, arcaCuit: d.cuit } });
    } else if (t.arcaPuntoVenta == null) {
      const otros: NegocioFiscal[] = await tx.tenant.findMany({
        where: { arcaCuit: d.cuit, id: { not: tenantId } },
        select: { id: true, name: true, slug: true, arcaCuit: true, arcaPuntoVenta: true },
      });
      const otro = choqueDePuntoDeVenta({ tenantId, cuit: d.cuit, puntoVenta: d.puntoVenta }, otros);
      if (otro) throw new RechazoDelAlta(motivoDeChoque(d.cuit, d.puntoVenta, otro, puntosDeVentaUsados(tenantId, d.cuit, otros)));
      data.arcaPuntoVenta = d.puntoVenta;
      completado.push("punto de venta");
      auditar.push({ action: "fiscal.puntoVenta.set", changes: { arcaPuntoVenta: d.puntoVenta, antes: null, arcaCuit: d.cuit } });
    } else if (t.arcaPuntoVenta !== d.puntoVenta) {
      throw new RechazoDelAlta(
        `"${d.slug}" ya factura con el punto de venta ${t.arcaPuntoVenta} y pediste ${d.puntoVenta}. No se pisa: corregilo desde la ficha del negocio.`,
      );
    }

    // Condición frente al IVA: con el negocio ya en real no se toca (misma regla que la ficha).
    if (!t.arcaCondicionIva) {
      const c = interpretarCondicionIva(d.condicionIva, !t.arcaHomologacion);
      if (c.accion === "error") throw new RechazoDelAlta(c.motivo);
      data.arcaCondicionIva = d.condicionIva;
      completado.push("condición IVA");
      auditar.push({ action: "fiscal.condicion-iva.set", changes: { arcaCondicionIva: d.condicionIva, antes: null } });
    } else if (t.arcaCondicionIva !== d.condicionIva) {
      const ya = CONDICIONES_DEL_EMISOR[t.arcaCondicionIva as keyof typeof CONDICIONES_DEL_EMISOR] ?? t.arcaCondicionIva;
      throw new RechazoDelAlta(`"${d.slug}" ya figura como ${ya}. No se pisa: corregilo desde la ficha del negocio.`);
    }

    // Módulos: ARCA + receptores. Se suman los que falten; nunca se apaga nada.
    const faltan = MODULOS_FACTOQUE.filter((m) => !t.modules.includes(m));
    if (faltan.length) {
      data.modules = [...t.modules, ...faltan];
      completado.push(`módulos ${faltan.join("+")}`);
      auditar.push({ action: "module.activate", changes: { incluidos: faltan, antes: t.modules, despues: data.modules } });
    }

    // Subdominio: sin él la dirección no existe.
    let subdominio = t.subdomain;
    if (!subdominio) {
      const ocupado = await tx.tenant.findUnique({ where: { subdomain: d.slug }, select: { slug: true } });
      if (ocupado) throw new RechazoDelAlta(`La dirección "${d.slug}" ya la usa el negocio "${ocupado.slug}".`);
      data.subdomain = subdominio = d.slug;
      completado.push("dirección");
      auditar.push({ action: "tenant.subdomain", changes: { antes: { subdomain: null }, despues: { subdomain: d.slug } } });
    }

    if (Object.keys(data).length) await tx.tenant.update({ where: { id: tenantId }, data, select: { id: true } });

    // Titular: OWNER (el rol trae billing:manage, src/lib/capabilities.ts). Si el mail ya es de
    // alguien con otro rol, no se le cambia el rol en silencio.
    const titular = await tx.user.findUniqueOrThrow({
      where: { tenantId_email: { tenantId, email: d.email } },
      select: { id: true, role: true },
    });
    if (titular.role !== "OWNER") {
      throw new RechazoDelAlta(`${d.email} ya es usuario de "${d.slug}" con otro rol. No se cambia acá: hacelo desde la ficha.`);
    }
    if (fabrica.ownerCreated) completado.push("titular");

    // Web: la clave generada no se entrega a nadie (no sale de la memoria); el titular elige la suya
    // con el enlace de un solo uso. No es una «provisoria» que obligue a cambiar.
    const entrega = web ? "ninguna" : claveAEntregar({ titularCreado: fabrica.ownerCreated, habiaArchivo });
    const obligaACambiar = entrega !== "ninguna";
    // Regla del dueño (#66): nunca una provisoria sin cambio obligatorio. Sin la columna en la base, se deshace el alta.
    if (obligaACambiar && !(await operatorSetMustChange(tx, { userId: titular.id, tenantId }, true)).persisted) {
      throw new RechazoDelAlta(CAMBIO_OBLIGATORIO_INACTIVO);
    }

    const actor = web ? `web:${d.operador}` : `operator:${d.operador}`;
    for (const a of auditar) {
      await tx.auditLog.create({ data: { tenantId, actor, action: a.action, entity: "Tenant", entityId: tenantId, changes: a.changes as object } });
    }
    // Sin la contraseña: sólo si hubo una provisoria y si obliga a cambiarse.
    await tx.auditLog.create({
      data: {
        tenantId,
        actor,
        action: "factoque.alta",
        entity: "Tenant",
        entityId: tenantId,
        changes: {
          creado: fabrica.tenantCreated,
          completado,
          titular: d.email,
          titularCreado: fabrica.ownerCreated,
          claveProvisoria: web ? "la elige el titular" : entrega,
          obligaACambiar,
        },
      },
    });

    return { tenantId, titularId: titular.id, subdominio, negocioCreado: fabrica.tenantCreated, completado, entrega, obligaACambiar };
  });
}

/** El alta entera: escribe, y si hay una provisoria que entregar, manda el mail aparte al titular. */
export async function altaNegocioFactoque(prisma: PrismaClient, d: DatosDelAlta, deps: DependenciasDelAlta): Promise<ResultadoDelAlta> {
  const archivoPrevio = deps.claves.leer(d.slug);
  const clave = archivoPrevio ?? generateStrongPassword();
  if (!archivoPrevio) deps.claves.guardar(d.slug, clave);

  let w: Escrito;
  try {
    w = await escribirEnUnaTransaccion(prisma, d, clave, archivoPrevio !== null);
  } catch (e) {
    // Nada se escribió (transacción): la clave recién generada no sirve para nada.
    if (!archivoPrevio) deps.claves.borrar(d.slug);
    throw e;
  }

  const url = urlDelNegocio(w.subdominio, deps.dominio);
  const base = { slug: d.slug, url, usuario: d.email, negocioCreado: w.negocioCreado, completado: w.completado };
  if (w.entrega === "ninguna") {
    deps.claves.borrar(d.slug);
    return { ...base, clave: { tipo: "sin-cambios" } };
  }

  const archivo = deps.claves.ruta(d.slug);
  const m = mailAlTitular({ negocio: d.nombre, titular: d.titular, url, email: d.email, clave });
  const r = await deps.correo.enviar({ tenantId: w.tenantId, para: d.email, asunto: m.asunto, cuerpo: m.cuerpo }).catch(() => ({
    sent: false,
    reason: "el envío falló",
  }));
  let estado: EstadoDeLaClave;
  if (r.sent) {
    deps.claves.borrar(d.slug);
    estado = { tipo: "enviada" };
  } else {
    estado = { tipo: "pendiente", motivo: `el mail no salió (${r.reason ?? "sin detalle"})`, archivo };
  }
  return { ...base, clave: estado };
}

/**
 * ALTA WEB (/facturita/alta): la misma escritura, en una transacción, pero sólo para un negocio
 * NUEVO (CUIT libre y slug libre, ver `escribirEnUnaTransaccion`). La contraseña sorteada nunca se
 * guarda ni se manda: el titular elige la suya con el enlace de un solo uso (alta-web.server.ts).
 * Tira `CuitYaRegistrado` si el CUIT ya tiene negocio y `RechazoDelAlta` si algo no se puede.
 */
export async function altaNegocioFactoqueWeb(
  prisma: PrismaClient,
  d: DatosDelAlta,
  dominio?: string,
  ahora: number = Date.now(),
): Promise<{ tenantId: string; titularId: string; subdominio: string; url: string }> {
  const w = await escribirEnUnaTransaccion(prisma, d, generateStrongPassword(), false, { ahora });
  if (!w.negocioCreado) throw new RechazoDelAlta("El negocio no se creó.");
  return { tenantId: w.tenantId, titularId: w.titularId, subdominio: w.subdominio, url: urlDelNegocio(w.subdominio, dominio) };
}

/** El CLI sin el cableado: devuelve el código de salida. `escribir` es lo único que imprime. */
export async function correrAlta(
  argv: readonly string[],
  deps: DependenciasDelAlta & { prisma: () => PrismaClient; escribir: (linea: string) => void },
): Promise<number> {
  const a = interpretarArgs(argv);
  if (!a.ok) {
    for (const e of a.errores) deps.escribir(`✖ ${e}`);
    deps.escribir(USO);
    return 2;
  }
  if (a.modo === "confirmar-envio") {
    const habia = deps.claves.leer(a.slug) !== null;
    deps.claves.borrar(a.slug);
    deps.escribir(habia ? `slug: ${a.slug} · contraseña: entregada (se borró el archivo local)` : `slug: ${a.slug} · no había contraseña pendiente`);
    return 0;
  }
  try {
    const r = await altaNegocioFactoque(deps.prisma(), a.datos, deps);
    for (const l of lineasDeSalida(r)) deps.escribir(l);
    return 0;
  } catch (e) {
    deps.escribir(`✖ Alta no hecha (no se escribió nada): ${e instanceof RechazoDelAlta ? e.message : e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
