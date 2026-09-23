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

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { operatorPrisma } from "@/lib/operator-db";
import { requireOperator } from "@/lib/operator-session";
import { requiereOkDelDuenio } from "@/app/operador/(console)/tenants/[id]/apps-del-negocio";
import { darDeBajaEnTx, vincularEnTx } from "@/lib/multilocal/multilocal-core";

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
