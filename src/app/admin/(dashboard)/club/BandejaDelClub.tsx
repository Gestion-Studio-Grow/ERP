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
// DOS PUESTOS (Tanda 1B). Arriba de las alertas, lo de ESTE puesto que chocó con otro al re-aplicarse sobre la base
// (`estado.sincro.paraResolver`, sincro-core.ts): legible, con quién dio el hueco, alternativas de un toque para un turno,
// «Volver a aplicar» y «Descartar». Lo de todos los puestos lo ve el dueño en Configuración (`ParaResolverDeLosPuestos`).
// Acá vive también «Reservando…» del alta (`ReservandoElTurno`): el WhatsApp recién después del ok de la base.
//
// Performance: la bandeja tiene su propia suscripción al almacén y su firma (`compartirBandeja`): sólo se repinta
// si cambió alguna alerta, y repintarla no toca la agenda (que no lee las alertas de la bandeja). Quién opera llega
// por su propio canal (`suscribirOperador`) y entra en la MISMA selección (`useBandeja`): cambiar de operador sólo
// repinta si cambia lo que se ve (lo que es de un dueño), y entonces sólo las alertas nuevas. Nada se anima.

import { memo, useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Marca } from "@/components/ui/Marca";
import { cancha as canchaDe, hhmm, pesos, reserva as reservaDe } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen, EstadoDeLaSincro, Operador } from "./almacen";
import { alternativasDelHueco, leerSincro, type ItemParaResolver } from "./sincro-core";
import { useSeleccion } from "./usar-almacen";
import { celularDelTurno, enlaceWhatsApp, textoConfirmacion } from "./whatsapp-core";
import { armarBandeja, compartirBandeja, queHace, type ItemBandeja, type QueHace, type VistaBandeja } from "./bandeja-core";
import { SE_DESHACE } from "./canchas-core";
import type { MedioCaja } from "./cuenta-core";
import { ComoPaga } from "./piezas";
import { BotonWhatsApp, TextoWhatsApp } from "./WhatsAppDelClub";

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
            const d = almacen.comando("ciclo", [que.reservaId, { tipo: que.tipo, medio }], { deshacible: true });
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
            const d = almacen.comando("espera", [{ tipo: "asignar", esperaId: que.esperaId, canchaId: que.canchaId, inicio: que.inicio }], { deshacible: SE_DESHACE.asignar });
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
    if (q.tipo === "apagarLuz") return void almacen.comando("luz", [q.canchaId, false]);
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

// ── dos puestos ─────────────────────────────────────────────────────────────────────────────────────────────────

/** La cola, la novedad del otro puesto y la conexión, por su propio canal (`suscribirSincro`). */
export function useSincro(almacen: Almacen): EstadoDeLaSincro {
  return useSyncExternalStore(almacen.suscribirSincro, almacen.sincro, almacen.sincro);
}

const firmaDe = (l: readonly ItemParaResolver[]) => l.map((x) => x.id).join("|");
const mismaLista = (previa: readonly ItemParaResolver[] | undefined, nueva: readonly ItemParaResolver[]) => (previa && firmaDe(previa) === firmaDe(nueva) ? previa : nueva);
const paraResolverDe = (e: EstadoClub) => leerSincro(e).paraResolver;

/** «Para resolver» de la foto (en vivo: cambia cuando la base trae un choque nuevo, sin recargar). */
export function useParaResolver(almacen: Almacen): readonly ItemParaResolver[] {
  return useSeleccion<readonly ItemParaResolver[]>(almacen, paraResolverDe, mismaLista);
}

/**
 * Un ítem de «Para resolver»: qué se hizo, por qué no entró y cómo seguir. Si era un turno, las alternativas que el motor
 * acepta AHORA (otra cancha a la misma hora, el próximo hueco, menos minutos), de un toque; «Volver a aplicar» lo corre
 * con los mismos ids y el mismo código de seña (si el hueco ya se liberó); «Descartar» lo saca.
 */
export function ItemParaResolverDelClub({ almacen, item, alResolver }: { almacen: Almacen; item: ItemParaResolver; alResolver?: (id: string, reservas: string[]) => void }) {
  const idMotivo = useId();
  const alternativas = item.hueco && item.comando ? alternativasDelHueco(almacen.estado(), item.hueco) : [];
  const aplicar = (alternativa?: (typeof alternativas)[number]) => {
    let encolado: { id: string; reservas: string[] } | null = null;
    const d = almacen.volverAAplicar(item.id, alternativa ?? null, { alEncolar: (x) => (encolado = x) });
    const e = encolado as { id: string; reservas: string[] } | null;
    if (d.ok && e) alResolver?.(e.id, e.reservas);
  };
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0 first:pt-0" aria-describedby={idMotivo}>
      <p className="text-sm text-strong">{item.texto}</p>
      <p id={idMotivo} className="text-sm font-semibold text-danger">
        {item.motivo}
      </p>
      {alternativas.length > 0 && (
        <div role="group" aria-label="Otras opciones para ese turno" className="flex flex-wrap gap-2">
          {alternativas.map((a) => (
            <Button key={`${a.canchaId}@${a.inicio}/${a.duracion}`} variant="solid" size="md" onClick={() => aplicar(a)}>
              {a.texto}
            </Button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="md" onClick={() => aplicar()}>
          Volver a aplicar
        </Button>
        <Button variant="ghost" size="md" onClick={() => almacen.descartarParaResolver(item.id)}>
          Descartar
        </Button>
      </div>
    </li>
  );
}

/** Lo de ESTE puesto que chocó con otro: arriba de la bandeja, nivel alto. Nada si no hay. */
const ParaResolverDeEstePuesto = memo(function ParaResolverDeEstePuesto({ almacen }: { almacen: Almacen }) {
  const todos = useParaResolver(almacen);
  const equipo = almacen.puesto().equipo;
  const mios = todos.filter((x) => x.equipo === equipo);
  if (!mios.length) return null;
  return (
    <div data-ui="para-resolver" className="flex flex-col gap-1 rounded-md border border-danger/40 bg-danger-soft p-3">
      <Marca tipo="atencion" className="text-danger">
        {mios.length === 1 ? "Chocó con otro puesto" : `${mios.length} cosas chocaron con otro puesto`}
      </Marca>
      <ul role="list" className="flex flex-col">
        {mios.map((x) => (
          <ItemParaResolverDelClub key={x.id} almacen={almacen} item={x} />
        ))}
      </ul>
    </div>
  );
});

/**
 * Configuración (dueño): «Lo que quedó aparte», por ítem y de TODOS los puestos, en vivo (cuando llega un choque nuevo,
 * aparece sin recargar). Nada si no hay.
 */
export function ParaResolverDeLosPuestos({ almacen, className }: { almacen: Almacen; className?: string }) {
  const todos = useParaResolver(almacen);
  if (!todos.length) return null;
  return (
    <div className={className} data-ui="aparte-por-item">
      <h3 className="font-semibold text-strong">Lo que quedó aparte ({todos.length})</h3>
      <p className="text-sm text-body">Cosas que un puesto cargó y no entraron sobre lo que guardó otro. Revisalas una por una: volver a aplicar, elegir otra opción o descartar.</p>
      <ul role="list" className="flex flex-col">
        {[...todos].reverse().map((x) => (
          <ItemParaResolverDelClub key={x.id} almacen={almacen} item={x} />
        ))}
      </ul>
    </div>
  );
}

/**
 * El alta con base (dos puestos): «Reservando…» hasta que la base confirma el turno; recién ahí el mensaje y el botón de
 * WhatsApp (un hueco nunca se promete dos veces). Si el otro puesto ya lo había dado, el motivo con su nombre y las
 * alternativas de un toque, sin haber ofrecido nada.
 */
export function ReservandoElTurno({
  almacen,
  id,
  reservaId,
  onAbrir,
  onVolver,
}: {
  almacen: Almacen;
  /** El id con que el alta entró a la cola (`alEncolar`). */
  id: string;
  reservaId: string;
  onAbrir: (reservaId: string) => void;
  onVolver: () => void;
}) {
  const sincro = useSincro(almacen);
  useSyncExternalStore(almacen.suscribir, almacen.version, almacen.version);
  const [actual, setActual] = useState(id);
  const titulo = useRef<HTMLHeadingElement>(null);
  const idTitulo = useId();
  const conf = almacen.confirmacion(actual);
  const estado = almacen.estado();
  const r = reservaDe(estado, reservaId);
  const item = leerSincro(estado).paraResolver.find((x) => x.id === id);
  const fase = conf === "esperando" ? "esperando" : item ? "choco" : r && (conf === "confirmado" || conf === "desconocido") ? "listo" : "deshecho";
  useEffect(() => {
    titulo.current?.focus();
  }, [fase]);
  const encabezado = fase === "esperando" ? "Reservando…" : fase === "choco" ? "Ese hueco ya no está" : fase === "listo" ? "Turno reservado" : "Turno deshecho";
  return (
    <section
      aria-labelledby={idTitulo}
      aria-busy={fase === "esperando"}
      onKeyDown={(e) => {
        if (e.key === "Escape") onVolver();
      }}
      className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4"
    >
      <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        {encabezado}
      </h2>
      {r && fase !== "choco" && (
        <p className="text-sm text-muted">
          {r.titular} · {canchaDe(estado, r.canchaId)?.nombre ?? ""} {hhmm(r.inicio)}
        </p>
      )}
      {fase === "esperando" && (
        <>
          <p role="status" className="text-sm text-body">
            {sincro.sinInternetDesde !== null
              ? "Sin internet: el turno quedó guardado en esta compu y se confirma apenas vuelva la conexión. Todavía no mandes la confirmación."
              : "Confirmando con la base que el hueco sigue libre (unos segundos). El WhatsApp aparece cuando quede confirmado."}
          </p>
          <div>
            <Button variant="ghost" size="md" onClick={onVolver}>
              Volver a la agenda
            </Button>
          </div>
        </>
      )}
      {fase === "listo" && r && (
        <>
          <TextoWhatsApp texto={textoConfirmacion(estado, r)} etiqueta="Mensaje de confirmación listo para mandar" />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-start">
            <BotonWhatsApp enlace={enlaceWhatsApp(celularDelTurno(estado, r), textoConfirmacion(estado, r), almacen.modo())} variante="solid">
              Mandar por WhatsApp
            </BotonWhatsApp>
            <Button variant="outline" size="md" onClick={() => onAbrir(r.id)}>
              Abrir el turno
            </Button>
            <Button variant="ghost" size="md" onClick={onVolver}>
              Listo
            </Button>
          </div>
        </>
      )}
      {fase === "choco" && item && (
        <>
          <p role="alert" className="text-sm text-body">
            No se le mandó nada al cliente. Elegí otra opción o volvé a la agenda (queda en «Para resolver»).
          </p>
          <ul role="list" className="flex flex-col">
            <ItemParaResolverDelClub almacen={almacen} item={item} alResolver={(nuevo) => setActual(nuevo)} />
          </ul>
          <div>
            <Button variant="ghost" size="md" onClick={onVolver}>
              Volver a la agenda
            </Button>
          </div>
        </>
      )}
      {fase === "deshecho" && (
        <>
          <p role="status" className="text-sm text-strong">
            Se deshizo el turno: no mandes la confirmación.
          </p>
          <div>
            <Button variant="outline" size="md" onClick={onVolver}>
              Volver a la agenda
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

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
      <ParaResolverDeEstePuesto almacen={almacen} />
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
