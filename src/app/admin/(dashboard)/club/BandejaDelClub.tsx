"use client";

// ============================================================================
// PARA RESOLVER AHORA — la bandeja de la recepción, al lado de la agenda.
// ============================================================================
//
// La del club vanilla: las alertas del motor en su orden (lo urgente primero), cada una con su rótulo (forma +
// palabra) y su botón. Lo que se resuelve acá mismo se despliega debajo de la alerta (devolver o cobrar la falta
// con el medio, ofrecer el hueco de la lista de espera por WhatsApp); lo demás lleva al turno o a su solapa.
// Qué hace cada botón lo decide bandeja-core.ts (`queHace`), sin pantalla.
//
// Performance: la bandeja tiene su propia suscripción al almacén y su firma (`compartirBandeja`): sólo se repinta
// si cambió alguna alerta, y repintarla no toca la agenda (que no lee las alertas de la bandeja). Quién opera llega
// por su propio canal (`suscribirOperador`) y entra en la MISMA selección (`useBandeja`): cambiar de operador sólo
// repinta si cambia lo que se ve (lo que es de un dueño), y entonces sólo las alertas nuevas. Nada se anima.

import { memo, useCallback, useId, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Marca } from "@/components/ui/Marca";
import { pesos, reserva as reservaDe } from "@/lib/club/motor.mjs";
import type { Almacen, Operador } from "./almacen";
import { armarBandeja, compartirBandeja, queHace, type ItemBandeja, type QueHace, type VistaBandeja } from "./bandeja-core";
import { ponerLuz } from "./agenda-core";
import { ejecutarCiclo } from "./ciclo-core";
import { SE_DESHACE, ejecutarEspera } from "./canchas-core";
import type { MedioCaja } from "./cuenta-core";
import { ComoPaga } from "./piezas";
import { BotonWhatsApp } from "./WhatsAppDelClub";

/**
 * La bandeja del almacén: el estado y quién opera en UNA selección (el filtro «sólo para el dueño» depende de los dos),
 * calculada a lo sumo una vez por versión y por operador, y la MISMA vista si nada de lo que se ve cambió (React no
 * la repinta). Es `useSeleccion` (usar-almacen.ts) con el canal del operador sumado.
 */
function useBandeja(almacen: Almacen): VistaBandeja {
  const cache = useRef<{ version: number; operador: Operador | null; valor: VistaBandeja } | null>(null);
  const suscribir = useCallback(
    (alCambiar: () => void) => {
      const a = almacen.suscribir(alCambiar);
      const b = almacen.suscribirOperador(alCambiar);
      return () => {
        a();
        b();
      };
    },
    [almacen],
  );
  const leer = (): VistaBandeja => {
    const version = almacen.version();
    const operador = almacen.operador();
    const c = cache.current;
    if (c && c.version === version && c.operador === operador) return c.valor;
    const valor = compartirBandeja(c?.valor, armarBandeja(almacen.estado(), almacen.ahora(), operador?.usuario.rol === "duenio"));
    cache.current = { version, operador, valor };
    return valor;
  };
  return useSyncExternalStore(suscribir, leer, leer);
}

export interface PropsDeBandeja {
  almacen: Almacen;
  /** Abre la cuenta de un turno (en su día) en la agenda. */
  onVerTurno: (reservaId: string) => void;
  /** Lleva a una solapa; false si quien opera no la tiene (no existe o no es para su rol). */
  irASolapa: (id: string) => boolean;
}

/** Devolver en mano o cobrar la falta de alguien sin ficha, acá mismo (como la ventanita del vanilla). */
function PlataSinFicha({ almacen, que, onListo }: { almacen: Almacen; que: Extract<QueHace, { tipo: "devolver" | "cobrarFalta" }>; onListo: () => void }) {
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const r = reservaDe(almacen.estado(), que.reservaId);
  const monto = que.tipo === "devolver" ? (r?.devolucionPendiente ?? 0) : (r?.deudaSinFicha ?? 0);
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      {que.tipo === "devolver" && <p className="text-sm text-body">No tiene ficha de cliente, así que no se le pueden dejar créditos: se le devuelve. ¿Cómo?</p>}
      <ComoPaga medio={medio} onElegir={(m) => setMedio(m as MedioCaja)} leyenda={que.tipo === "devolver" ? "Cómo se le devuelve" : "Cómo paga"} angosto />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="solid"
          size="md"
          onClick={() => {
            // Devolver y cobrar la falta se deshacen (`devuelto`, `cobrarFalta` en DESHACIBLES del vanilla).
            const d = almacen.ejecutar((e, a, auth) => ejecutarCiclo(e, que.reservaId, { tipo: que.tipo, medio }, a, auth), { deshacible: true });
            if (d.ok) onListo();
          }}
        >
          {que.tipo === "devolver" ? `Ya se devolvió ${pesos(monto)}` : `Cobrar ${pesos(monto)}`}
        </Button>
        <Button variant="ghost" size="md" onClick={onListo}>
          Después
        </Button>
      </div>
    </div>
  );
}

/** El hueco para el de la lista de espera: el mensaje, mandarlo por WhatsApp y, si dice que sí, darle el turno. */
export function OfrecerHueco({ almacen, que, onListo }: { almacen: Almacen; que: Extract<QueHace, { tipo: "ofrecerEspera" }>; onListo: () => void }) {
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-2">
      <blockquote className="rounded-md bg-surface-sunken px-3 py-2 text-sm text-body">{que.mensaje}</blockquote>
      <div className="flex flex-wrap gap-2">
        <BotonWhatsApp enlace={que.whatsapp}>Mandar por WhatsApp</BotonWhatsApp>
        <Button
          variant="solid"
          size="md"
          onClick={() => {
            const d = almacen.ejecutar((e, a) => ejecutarEspera(e, { tipo: "asignar", esperaId: que.esperaId, canchaId: que.canchaId, inicio: que.inicio }, a), { deshacible: SE_DESHACE.asignar });
            if (d.ok) onListo();
          }}
        >
          Dijo que sí: reservar
        </Button>
      </div>
    </div>
  );
}

const ItemDeLaBandeja = memo(function ItemDeLaBandeja({
  item,
  abierta,
  onAbrir,
  almacen,
  onVerTurno,
  irASolapa,
}: {
  item: ItemBandeja;
  abierta: boolean;
  onAbrir: (clave: string | null) => void;
} & PropsDeBandeja) {
  const idPanel = useId();
  // Lo que hace el botón se decide en el toque, con el estado de ese momento.
  const que = abierta ? queHace(almacen.estado(), item.alerta, almacen.modo()) : null;
  const desplegable = item.alerta.tipo === "devolucion" || item.alerta.tipo === "falta_sin_ficha" || item.alerta.tipo === "espera";
  const cerrar = () => onAbrir(null);
  const tocar = () => {
    if (desplegable) return onAbrir(abierta ? null : item.clave);
    const q = queHace(almacen.estado(), item.alerta, almacen.modo());
    if (!q) return almacen.informar({ ok: false, mensaje: "Esto ya no está para resolver." });
    if (q.tipo === "verTurno") return onVerTurno(q.reservaId);
    // Apagar desde la bandeja no se deshace (la acción `alerta` del vanilla no está en DESHACIBLES).
    if (q.tipo === "apagarLuz") return void almacen.ejecutar((e) => ponerLuz(e, q.canchaId, false));
    if (q.tipo === "solapa" && !irASolapa(q.solapa)) almacen.informar({ ok: false, mensaje: q.siNoEsta });
  };
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0">
      <Marca tipo={item.marca} className={item.nivel === "alta" ? "text-danger" : "text-muted"}>
        {item.rotulo}
      </Marca>
      <p className="text-sm text-strong">{item.texto}</p>
      <div>
        <Button
          variant={item.nivel === "alta" ? "solid" : "outline"}
          size="md"
          onClick={tocar}
          aria-expanded={desplegable ? abierta : undefined}
          aria-controls={desplegable && abierta ? idPanel : undefined}
        >
          {item.accion}
        </Button>
      </div>
      {abierta && que && (
        <div id={idPanel}>
          {(que.tipo === "devolver" || que.tipo === "cobrarFalta") && <PlataSinFicha almacen={almacen} que={que} onListo={cerrar} />}
          {que.tipo === "ofrecerEspera" && <OfrecerHueco almacen={almacen} que={que} onListo={cerrar} />}
        </div>
      )}
    </li>
  );
});

// `memo`: cambiar de día o de panel repinta la recepción, no la bandeja (sus props son estables).
export default memo(function BandejaDelClub({ almacen, onVerTurno, irASolapa }: PropsDeBandeja) {
  const vista = useBandeja(almacen);
  const [abierta, setAbierta] = useState<string | null>(null);
  // Si la que estaba abierta ya se resolvió (o se fue), no queda nada abierto.
  const abiertaVigente = abierta !== null && vista.items.some((i) => i.clave === abierta) ? abierta : null;
  const n = vista.items.length;
  return (
    <section aria-labelledby="club-bandeja-titulo" data-ui="bandeja" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 id="club-bandeja-titulo" className="text-lg font-semibold text-strong">
          Para resolver ahora
        </h2>
        <Badge tone={vista.urgentes ? "danger" : "info"}>{vista.urgentes ? `${vista.urgentes} urgente${vista.urgentes > 1 ? "s" : ""}` : n === 1 ? "1 pendiente" : `${n} pendientes`}</Badge>
      </div>
      {n === 0 ? (
        <p className="text-sm text-muted">Todo en orden.</p>
      ) : (
        <ul role="list" className="flex flex-col">
          {vista.items.map((i) => (
            <ItemDeLaBandeja key={i.clave} item={i} abierta={i.clave === abiertaVigente} onAbrir={setAbierta} almacen={almacen} onVerTurno={onVerTurno} irASolapa={irASolapa} />
          ))}
        </ul>
      )}
    </section>
  );
});
