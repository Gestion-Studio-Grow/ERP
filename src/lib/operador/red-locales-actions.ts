"use server";

// ============================================================================
// ARMAR RED DE LOCALES — la ÚNICA puerta que habilita leer datos de otro negocio.
// ============================================================================
//
// Vincular un local a una casa le da a la dueña de la casa la lectura de las ventas, la caja y
// el stock de ese local. Por eso sólo se hace desde la consola de GSG (plano de operador,
// ADR-021), cada export pasa primero por `requireOperadorParaNegocio`/`operadorParaNegocio` (sesión de
// operador y candado de CH: sólo el dueño), y cada vínculo deja auditoría en la
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
// El id del local llega por formulario, y no prueba nada: `sumarAltaEnTx` sólo acepta un local con la
// marca del alta para ESTA casa, que escribe el servidor al crearlo (`commitTenantAction`); cualquier
// otro negocio se rechaza. Tampoco le pisa el catálogo a un negocio que ya
// existía. Sin vista previa, la lista de la casa sólo CREA productos; si el local ya tenía precios
// propios, la lista queda pendiente y se manda desde la casa, con vista previa (multilocal-core).

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { operadorParaNegocio, requireOperadorParaNegocio } from "@/lib/operador/guardia-negocio";
import { logger } from "@/lib/logger";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import {
  AltaEnRedRechazada,
  darDeBajaEnTx,
  revisarAltaEnRedEnTx,
  sumarAltaEnTx,
  vincularEnTx,
  type ResultadoAltaEnRed,
  type RevisionAltaEnRed as Revision,
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
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  const { nombre: op } = await requireOperadorParaNegocio({ id: casaId }, { id: localId });
  const alias = campo(formData, "alias");
  if (!casaId) redirect("/operador?error=notfound");
  if (!localId) volverARed(casaId, { error: "Elegí el local que querés sumar a la red." });

  const r = await operatorPrisma.$transaction((tx) =>
    vincularEnTx(tx, { casaId, localId, alias, actor: `operator:${op}`, confirmado: campo(formData, "confirmo") === "si" }, requiereOkDelDuenio),
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
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  const { nombre: op } = await requireOperadorParaNegocio({ id: casaId }, { id: localId });
  if (!casaId) redirect("/operador?error=notfound");
  if (!localId) volverARed(casaId, { error: "El pedido llegó incompleto. Recargá la ficha y probá de nuevo." });

  const r = await operatorPrisma.$transaction((tx) => darDeBajaEnTx(tx, { casaId, localId, actor: `operator:${op}`, confirmado: campo(formData, "confirmo") === "si" }));
  if (!r.ok) volverARed(casaId, { error: r.motivo });

  revalidatePath(`/operador/tenants/${casaId}`);
  revalidatePath(`/operador/tenants/${localId}`);
  volverARed(casaId, {
    ok: `Diste de baja «${r.alias}»: la casa ya no ve sus ventas, su caja ni su stock. Se puede volver a vincular cuando quieras.`,
  });
}

/** Lo que el wizard muestra antes de crear el local: a qué casa va y con qué CUIT y punto de venta. */
export type RevisionAltaEnRed = Revision;

/**
 * El chequeo del paso "¿de qué red?", SIN escribir: la MISMA regla que aplica después la red
 * (`revisarAltaEnRedEnTx`: la casa, el mismo CUIT que la casa y el CUIT + punto de venta libre). El
 * commit del alta la repite en el servidor antes de crear (`commitTenantAction`). Lo que decide de
 * verdad es `sumarAltaALaRedAction`, adentro de su transacción y con el candado del CUIT.
 */
export async function revisarAltaEnRedAction(formData: FormData): Promise<RevisionAltaEnRed> {
  const casaId = campo(formData, "casaId");
  const g = await operadorParaNegocio({ id: casaId });
  if (!g.ok) return { ok: false, motivo: g.motivo };
  const op = g.sesion.nombre;
  if (!casaId) return { ok: false, motivo: "Elegí la casa de la red." };
  try {
    // Los módulos del local nuevo los mira el commit (salen del plan); acá, el nombre para el mensaje.
    return await operatorPrisma.$transaction((tx) =>
      revisarAltaEnRedEnTx(
        tx,
        {
          casaId,
          cuit: campo(formData, "cuit"),
          puntoVenta: campo(formData, "puntoVenta"),
          local: { name: campo(formData, "nombre"), slug: campo(formData, "slug"), modules: [] },
        },
        requiereOkDelDuenio,
      ),
    );
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
  const casaId = campo(formData, "casaId");
  const localId = campo(formData, "localId");
  const g = await operadorParaNegocio({ id: casaId }, { id: localId });
  if (!g.ok) return { ok: false, motivo: g.motivo };
  const op = g.sesion.nombre;
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
      motivo: "No se pudo sumar el local a la red: no quedó nada a medias. Reintentá en un rato desde este mismo resultado del alta: es seguro, no duplica nada.",
    };
  }
}
