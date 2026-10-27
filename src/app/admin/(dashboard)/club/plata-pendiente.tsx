"use client";

// ============================================================================
// PLATA PENDIENTE (n) — lo que quedó sin resolver de cualquier día, con su botón. En la Agenda (bandeja) y en la Caja.
// ============================================================================
//
// La lista es del motor (`plataPendiente`, vía plata-pendiente-core.ts): no vence; un renglón se va cuando alguien lo
// resuelve. Lo que pide un medio se despliega con los 4 medios, que resuelven al toque (devolver, cobrar la falta,
// cobrar la seña vencida, cobrar la cuenta del fiado rechazado): «Devolver» 1 toque + medio 1 toque. El fiado que espera
// el OK ofrece «Se fue: que se cierre sola al aprobar»; el aprobado, «Pasar a su cuenta corriente». Todo viaja como
// comando de la lista blanca (re-aplicable en otro puesto; si ya lo resolvió otro, el motor dice que no y no cobra
// dos veces). Devolver y cobrar se pueden deshacer desde el aviso de abajo.
//
// Se repinta sólo si cambia la lista (`porFirma`). Nada se anima.

import { memo, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { pesos } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { ETIQUETA_MEDIO, MEDIOS_CAJA, type MedioCaja } from "./cuenta-core";
import { armarPlataPendiente, comandoDePlata, type ItemPlata, type VistaPlata } from "./plata-pendiente-core";
import { porFirma, useSeleccion } from "./usar-almacen";
import { enlaceWhatsApp } from "./whatsapp-core";
import { BotonWhatsApp } from "./WhatsAppDelClub";

const seleccionar = (e: Parameters<typeof armarPlataPendiente>[0]) => armarPlataPendiente(e);

/** Corre el comando que resuelve el ítem (todos de la lista blanca). */
function resolver(almacen: Almacen, it: ItemPlata, medio: MedioCaja | null): boolean {
  const c = comandoDePlata(it.item, medio);
  if (!c) return false;
  // Devolver, cobrar la falta, la seña y la cuenta se deshacen (como en la bandeja de siempre); el resto, no.
  switch (c.nombre) {
    case "ciclo":
      return almacen.comando("ciclo", c.args, { deshacible: true }).ok;
    case "cuenta":
      return almacen.comando("cuenta", c.args, { deshacible: true }).ok;
    case "buffet":
      return almacen.comando("buffet", c.args, { deshacible: true }).ok;
    case "plata":
      return almacen.comando("plata", c.args).ok;
  }
}

function Renglon({ almacen, it }: { almacen: Almacen; it: ItemPlata }) {
  const [abierto, setAbierto] = useState(false);
  const idMedios = useId();
  const idTexto = useId();
  const r = it.resolver;
  const sale = r.tipo === "conMedio" && r.sentido === "sale";
  return (
    <li data-plata={it.item.tipo} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0" aria-labelledby={idTexto}>
      <p id={idTexto} className="text-sm text-strong tabular-nums">
        {it.texto}
      </p>
      <p className="text-xs text-body">{it.detalle}</p>
      <div className="flex flex-wrap gap-2">
        {r.tipo === "conMedio" && (
          <Button variant={sale ? "outline" : "solid"} size="md" aria-expanded={abierto} aria-controls={abierto ? idMedios : undefined} onClick={() => setAbierto((x) => !x)}>
            {r.verbo}
          </Button>
        )}
        {r.tipo === "unToque" && (
          <Button variant="solid" size="md" onClick={() => resolver(almacen, it, null)}>
            {r.verbo}
          </Button>
        )}
        {r.tipo === "esperando" && <p className="text-sm text-body">Se cierra sola cuando el dueño apruebe.</p>}
        {it.whatsapp && (
          <BotonWhatsApp enlace={enlaceWhatsApp(it.item.tel, it.whatsapp, almacen.modo())} nombreAccesible={`Avisarle por WhatsApp a ${it.item.nombre}`}>
            Avisar por WhatsApp
          </BotonWhatsApp>
        )}
      </div>
      {r.tipo === "conMedio" && abierto && (
        <div id={idMedios} role="group" aria-label={sale ? `Cómo se le devuelve a ${it.item.nombre}` : `Cómo paga ${it.item.nombre}`} className="flex flex-wrap gap-2">
          {MEDIOS_CAJA.map((m) => (
            <Button
              key={m}
              variant="outline"
              size="md"
              aria-label={`${sale ? "Devolver" : "Cobrar"} ${pesos(it.item.monto)} ${sale ? "a" : "de"} ${it.item.nombre} en ${ETIQUETA_MEDIO[m]}`}
              onClick={() => {
                if (resolver(almacen, it, m)) setAbierto(false);
              }}
            >
              {ETIQUETA_MEDIO[m]}
            </Button>
          ))}
        </div>
      )}
    </li>
  );
}

/**
 * «Plata pendiente (n)». Nada si no hay (`siVacia` para mostrar el «nada pendiente» en la Caja). `titulo` = nivel del
 * encabezado (h2 en la Caja, h3 adentro de la bandeja).
 */
export default memo(function PlataPendienteDelClub({ almacen, titulo = "h3", siVacia = false }: { almacen: Almacen; titulo?: "h2" | "h3"; siVacia?: boolean }) {
  const v: VistaPlata = useSeleccion(almacen, seleccionar, porFirma);
  const id = useId();
  if (!v.items.length && !siVacia) return null;
  const Titulo = titulo;
  return (
    <section aria-labelledby={id} data-ui="plata-pendiente" className="flex flex-col gap-2 rounded-lg border border-line border-l-4 border-l-warning bg-surface-raised p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <Titulo id={id} className="font-semibold text-strong">
          Plata pendiente ({v.items.length})
        </Titulo>
        {v.items.length > 0 && (
          <p className="text-xs text-body tabular-nums">
            {v.entra > 0 ? `Por cobrar ${pesos(v.entra)}` : ""}
            {v.entra > 0 && v.sale > 0 ? " · " : ""}
            {v.sale > 0 ? `Por devolver ${pesos(v.sale)}` : ""}
          </p>
        )}
      </div>
      {v.items.length === 0 ? (
        <p className="text-sm text-body">No queda plata pendiente: nada para devolver ni para cobrar de otros días.</p>
      ) : (
        <ul role="list" className="flex flex-col">
          {v.items.map((it) => (
            <Renglon key={it.clave} almacen={almacen} it={it} />
          ))}
        </ul>
      )}
    </section>
  );
});
