"use server";

// ============================================================================
// ARMAR RED DE LOCALES — la ÚNICA puerta que habilita leer datos de otro negocio.
// ============================================================================
//
// Vincular un local a una casa le da a la dueña de la casa la lectura de las ventas, la caja y
// el stock de ese local. Por eso sólo se hace desde la consola de GSG (plano de operador,
// ADR-021), cada export arranca con `requireOperator()`, y cada vínculo deja auditoría en la
// casa Y en el local, en la misma transacción que la fila: o quedan las tres cosas o ninguna.
//
// Recibe los ids por formulario, como el resto de la consola (operator-actions.ts): del lado
// del operador no hay "negocio del request", y el operador es quien decide sobre todos. Las
// validaciones (casa ≠ local, el local no está en otra red, ninguno tiene la cartera del
// contador, la casa tiene el módulo, CH sólo con el OK del dueño) viven puras en
// `validarVinculo` y se deciden ADENTRO de la transacción, con el candado de los dos negocios
// tomado: que el botón estuviera habilitado no prueba nada.
//
// Corre sobre `operatorPrisma`, que cae a DATABASE_URL si falta OPERATOR_DATABASE_URL
// (operator-db.ts): con el rol `app_rls` la tabla sin GUC no muestra nada. Por eso cada lectura
// y escritura de CarteraCliente y AuditLog va con el GUC del negocio dueño de la fila
// (`vincularEnTx`): anda igual con un rol exento que con `app_rls`.

//
// ABRIR UN LOCAL DENTRO DE LA RED (paso "¿de qué red?" del alta, /operador/alta): después de que
// la fábrica crea el negocio, `sumarAltaALaRedAction` hace en UNA transacción el vínculo, el CUIT
// y el punto de venta del local (sin repetir el talonario de otro local del mismo CUIT) y le deja
// la lista de la casa (`sumarAltaEnTx`). `revisarAltaEnRedAction` hace el mismo chequeo sin
// escribir: el wizard lo usa mientras se carga el paso y otra vez justo antes de crear, para no
// crear un local con un punto de venta ya usado.
//
// El id del local llega por formulario: esta puerta no le pisa el catálogo a un negocio que ya
// existía. Sin vista previa, la lista de la casa sólo CREA productos; si el local ya tenía precios
// propios, la lista queda pendiente y se manda desde la casa, con vista previa (multilocal-core).

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import { logger } from "@/lib/logger";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  AltaEnRedRechazada,
  choqueFiscalEnTx,
  darDeBajaEnTx,
  decidirAcceso,
  leerFiscalDelAlta,
  sumarAltaEnTx,
  vincularEnTx,
  type ResultadoAltaEnRed,
} from "@/lib/multilocal/multilocal-core";

/** Vuelve a la tarjeta de la red en la ficha de la casa, con el mensaje. */
function volverARed(casaId: string, q: Record<string, string>): never {
  redirect(`/operador/tenants/${encodeURIComponent(casaId)}?${new URLSearchParams(q).toString()}#red`);
}

function campo(formData: FormData, nombre: string): string {
  return String(formData.get(nombre) ?? "").trim();
}

/** Vincula un local a la casa (o le cambia el alias si ya estaba). */
export async function vincularLocalAction(formData: FormData) {
  const op = await requireOperator();
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  const alias = campo(formData, "alias");
  if (!casaId) redirect("/operador?error=notfound");
  if (!localId) volverARed(casaId, { error: "Elegí el local que querés sumar a la red." });

  const r = await operatorPrisma.$transaction((tx) =>
    vincularEnTx(tx, { casaId, localId, alias, actor: `operator:${op}` }, requiereOkDelDuenio),
  );
  if (!r.ok) volverARed(casaId, { error: r.motivo });

  revalidatePath(`/operador/tenants/${casaId}`);
  revalidatePath(`/operador/tenants/${localId}`);
  const hecho = r.yaEstaba
    ? `«${r.local}» ya estaba en la red: quedó como «${r.alias}».`
    : `Listo: «${r.local}» es local de ${r.casa} como «${r.alias}». Quedó registrado en la auditoría de los dos negocios.`;
  volverARed(casaId, { ok: r.aviso ? `${hecho} ${r.aviso}` : hecho });
}

/** Da de baja el vínculo: la casa deja de ver ese local en el acto. No borra nada. */
export async function darDeBajaLocalAction(formData: FormData) {
  const op = await requireOperator();
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  if (!casaId) redirect("/operador?error=notfound");
  if (!localId) volverARed(casaId, { error: "El pedido llegó incompleto. Recargá la ficha y probá de nuevo." });

  const r = await operatorPrisma.$transaction((tx) => darDeBajaEnTx(tx, { casaId, localId, actor: `operator:${op}` }));
  if (!r.ok) volverARed(casaId, { error: r.motivo });

  revalidatePath(`/operador/tenants/${casaId}`);
  revalidatePath(`/operador/tenants/${localId}`);
  volverARed(casaId, {
    ok: `Diste de baja «${r.alias}»: la casa ya no ve sus ventas, su caja ni su stock. Se puede volver a vincular cuando quieras.`,
  });
}

/** Lo que el wizard muestra antes de crear el local: a qué casa va y con qué CUIT y punto de venta. */
export type RevisionAltaEnRed =
  | { ok: true; casa: string; cuit: string | null; puntoVenta: number | null }
  | { ok: false; motivo: string };

/**
 * El chequeo del paso "¿de qué red?", SIN escribir: la casa existe y es casa, y el CUIT + punto
 * de venta no lo usa otro negocio. Lo que decide de verdad es `sumarAltaALaRedAction`, adentro
 * de su transacción y con el candado del CUIT: esto sólo evita crear un local que después no
 * puede entrar a la red.
 */
export async function revisarAltaEnRedAction(formData: FormData): Promise<RevisionAltaEnRed> {
  const op = await requireOperator();
  const casaId = campo(formData, "casaId");
  if (!casaId) return { ok: false, motivo: "Elegí la casa de la red." };
  try {
    return await operatorPrisma.$transaction(async (tx) => {
      const casa = await tx.tenant.findUnique({ where: { id: casaId }, select: { name: true, slug: true, modules: true, arcaCuit: true } });
      if (!casa) return { ok: false as const, motivo: "Esa casa ya no existe. Recargá el alta." };
      if (requiereOkDelDuenio(casa.slug)) return { ok: false as const, motivo: "Esa casa es un cliente vivo: no se le suman locales sin el OK del dueño." };
      const acceso = decidirAcceso(casa.modules, "casa");
      if (!acceso.ok) return { ok: false as const, motivo: `«${casa.name}» no puede ser casa de una red: ${acceso.error}` };
      const fiscal = leerFiscalDelAlta({ cuit: campo(formData, "cuit"), puntoVenta: campo(formData, "puntoVenta") }, casa.arcaCuit);
      if (!fiscal.ok) return fiscal;
      // El local todavía no existe: ningún negocio se excluye del chequeo.
      const choque = await choqueFiscalEnTx(tx, "", fiscal.cuit, fiscal.puntoVenta, false);
      if (choque) return { ok: false as const, motivo: choque };
      return { ok: true as const, casa: casa.name, cuit: fiscal.cuit, puntoVenta: fiscal.puntoVenta };
    });
  } catch (e) {
    logger.error("operador.red-locales", "no se pudo revisar el alta en la red", e, { actor: op, casaId });
    return { ok: false, motivo: "No se pudo revisar ahora: la base no contestó. Probá de nuevo en un rato." };
  }
}

/**
 * Suma a la red un local recién creado, en UNA transacción: vínculo, CUIT y punto de venta, y la
 * lista de la casa. Si el vínculo o el punto de venta no cierran, no queda nada escrito y el
 * operador ve el porqué (y puede corregir el CUIT o el punto de venta y reintentar). Si lo que no
 * cierra es la lista, el local queda en la red y la lista pendiente, con su motivo. Todo es
 * idempotente: reintentar (desde el resultado del alta) es seguro.
 */
export async function sumarAltaALaRedAction(formData: FormData): Promise<ResultadoAltaEnRed> {
  const op = await requireOperator();
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  if (!casaId || !localId) return { ok: false, motivo: "El pedido llegó incompleto. Abrí la ficha del local y sumalo a la red desde ahí." };
  try {
    const r = await operatorPrisma.$transaction(
      (tx) =>
        sumarAltaEnTx(
          tx,
          {
            casaId,
            localId,
            alias: campo(formData, "alias"),
            cuit: campo(formData, "cuit"),
            puntoVenta: campo(formData, "puntoVenta"),
            actor: `operator:${op}`,
            lote: randomUUID(),
          },
          requiereOkDelDuenio,
        ),
      // Un catálogo de ~200 productos son dos sentencias (escribirPlan), pero el vínculo recorre
      // las casas de la base para validar: se da margen sobre los 5 s por defecto.
      { timeout: 20_000 },
    );
    revalidatePath(`/operador/tenants/${casaId}`);
    revalidatePath(`/operador/tenants/${localId}`);
    return r;
  } catch (e) {
    if (e instanceof AltaEnRedRechazada) return { ok: false, motivo: e.message };
    logger.error("operador.red-locales", "no se pudo sumar el alta a la red", e, { actor: op, casaId, localId });
    return {
      ok: false,
      motivo: "No se pudo sumar el local a la red: no quedó nada a medias. Probá de nuevo en un rato; si sigue, vinculalo desde la ficha de la casa (tarjeta Red) y cargale el punto de venta en la suya.",
    };
  }
}
