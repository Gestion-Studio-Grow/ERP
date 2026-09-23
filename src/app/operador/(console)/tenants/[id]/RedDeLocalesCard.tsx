// Tarjeta "Red de locales" de la ficha del negocio (consola de GSG).
//
// Es la ÚNICA puerta que habilita a un negocio a leer datos de otro: vincular un local a una
// casa le da a la dueña de la casa la lectura de sus ventas, su caja y su stock. Por eso vive
// acá, del lado del proveedor, y cada vínculo queda auditado en los dos negocios
// (src/lib/operador/red-locales-actions.ts).
//
// Server component: dos formularios que postean a las actions, sin estado en el cliente. Lo que
// el formulario ofrece es comodidad; lo que decide es `validarVinculo`, adentro de la
// transacción.

import { Badge, Button, Card, Field, Input, Select } from "@/components/ui";
import { darDeBajaLocalAction, vincularLocalAction } from "@/lib/operador/red-locales-actions";
import { resumenDeLaFicha, type RedEnLaFicha } from "@/lib/multilocal/multilocal-core";

export interface CandidatoLocal {
  id: string;
  name: string;
  slug: string;
  /** Nombre de la casa de la que ya es local, o null. Se muestra, pero no se puede elegir. */
  enOtraRed: string | null;
}

export function RedDeLocalesCard({
  tenantId,
  nombre,
  esCasa,
  tieneCartera,
  bloqueo,
  red,
  candidatos,
}: {
  tenantId: string;
  nombre: string;
  /** ¿Tiene el módulo `multilocal`? Sin él no se vincula nada. */
  esCasa: boolean;
  /** ¿Tiene la cartera del contador? Sus filas son clientes, no locales. */
  tieneCartera: boolean;
  /** Motivo por el que este negocio no se toca (CH), o null. */
  bloqueo: string | null;
  red: { estado: "ok"; red: RedEnLaFicha } | { estado: "sin-tabla" } | { estado: "error" };
  candidatos: readonly CandidatoLocal[];
}) {
  if (red.estado !== "ok") {
    return (
      <Card id="red" className="p-5 space-y-2">
        <h2 className="font-medium">Red de locales</h2>
        <div role="alert" className="rounded-md bg-warning-soft text-warning text-sm px-3 py-2">
          {red.estado === "sin-tabla"
            ? "La tabla del vínculo (CarteraCliente) no está en esta base: falta su migración. Hasta aplicarla no se puede armar una red."
            : "No se pudo leer la red de este negocio. Recargá la ficha; si sigue, revisá la conexión del operador."}
        </div>
      </Card>
    );
  }

  const { locales, esLocalDe } = red.red;
  // En un estudio contable las filas son clientes de su cartera: se administran desde /contador.
  const filas = tieneCartera ? [] : locales;
  const activos = filas.filter((l) => l.estado === "activa");
  const yaEstan = new Set(activos.map((l) => l.localTenantId));
  const ofrecibles = candidatos.filter((c) => c.id !== tenantId && !yaEstan.has(c.id));
  const libres = ofrecibles.filter((c) => !c.enOtraRed);

  return (
    <Card id="red" className="p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Red de locales</h2>
        {esCasa && <Badge tone="accent">{resumenDeLaFicha(nombre, filas)}</Badge>}
      </div>
      <p className="text-sm text-muted">
        Una marca con varios locales: cada local es su propio negocio y la <b>casa</b> (el que tiene
        «Mis locales») ve sus ventas, sus cajas y su stock. Vincular es la única forma de que un negocio
        lea datos de otro, y queda en la auditoría de los dos.
      </p>

      {esLocalDe.length > 0 && (
        <div role="status" className="rounded-md bg-info-soft text-info text-sm px-3 py-2">
          Este negocio es local de la red de {esLocalDe.map((c) => `«${c.name}»`).join(", ")}: esa casa ve sus ventas,
          su caja y su stock. Para sacarlo, dalo de baja desde la ficha de la casa.
        </div>
      )}

      {tieneCartera && (
        <p className="text-sm text-muted">
          Este negocio tiene la cartera del contador: sus vínculos son clientes del estudio y se
          administran desde su panel (/contador). Un estudio no puede ser casa de una red.
        </p>
      )}

      {!esCasa && !tieneCartera && (
        <p className="text-sm text-muted">
          Para que sea la casa de una red, primero activá <b>«Mis locales»</b> en «Apps del negocio», más abajo.
        </p>
      )}

      {filas.length > 0 && (
        <ul className="space-y-2">
          {filas.map((l) => (
            <li
              key={l.localTenantId}
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-line px-3 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-strong break-words">
                  {l.alias}{" "}
                  <span className="text-xs font-normal text-muted">
                    · {l.nombre} (/{l.slug})
                  </span>
                </p>
                <p className="text-xs text-muted">
                  {l.arcaPuntoVenta ? `Punto de venta ${l.arcaPuntoVenta}` : "Sin punto de venta"}
                  {l.arcaCuit ? ` · CUIT ${l.arcaCuit}` : " · sin CUIT"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {l.estado === "activa" ? (
                  <>
                    {!l.arcaPuntoVenta && <Badge tone="warning">no factura</Badge>}
                    <form action={darDeBajaLocalAction}>
                      <input type="hidden" name="casaId" value={tenantId} />
                      <input type="hidden" name="localId" value={l.localTenantId} />
                      <Button type="submit" variant="outline" aria-label={`Dar de baja ${l.alias} de la red`}>
                        Dar de baja
                      </Button>
                    </form>
                  </>
                ) : (
                  <Badge tone="neutral">{l.estado === "baja" ? "dado de baja" : l.estado}</Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {esCasa && !tieneCartera && (
        bloqueo ? (
          <p className="text-sm text-muted">{bloqueo}</p>
        ) : libres.length === 0 ? (
          <p className="text-sm text-muted">
            No hay otros negocios para sumar
            {ofrecibles.length > 0 ? ` (los que hay ya son locales de otra red: ${ofrecibles.map((c) => c.name).join(", ")})` : ""}.
            Dá de alta el local en «+ Alta de tenant» y volvé acá.
          </p>
        ) : (
          <form action={vincularLocalAction} className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-end">
            <input type="hidden" name="casaId" value={tenantId} />
            <Field label="Local a sumar" htmlFor="red-local">
              <Select id="red-local" name="localId" required defaultValue="">
                <option value="" disabled>
                  Elegí un negocio…
                </option>
                {ofrecibles.map((c) => (
                  <option key={c.id} value={c.id} disabled={!!c.enOtraRed}>
                    {c.name} (/{c.slug}){c.enOtraRed ? ` — ya es local de «${c.enOtraRed}»` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Cómo lo llama la casa" htmlFor="red-alias" hint="Opcional. Ej.: Canning.">
              <Input id="red-alias" name="alias" maxLength={60} autoComplete="off" placeholder="Nombre corto" />
            </Field>
            <Button type="submit" variant="solid">
              Vincular local
            </Button>
          </form>
        )
      )}
    </Card>
  );
}
