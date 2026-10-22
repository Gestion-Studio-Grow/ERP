"use client";

// ============================================================================
// LOS PROVEEDORES DEL CLUB — lo que les debemos, su cuenta, pagarles y los remitos.
// ============================================================================
//
// Para el dueño: la lista con lo que le debemos a cada uno (los que deben, primero) y el total (el mismo número que
// «Le debemos a proveedores» del Tablero). Tocar uno abre su ficha al lado (o arriba, en el celular): pagar (efectivo
// —sale del cajón— o transferencia, con su PIN), la cuenta con el saldo corrido, sus remitos con lo que trajo cada
// uno y editar los datos. «+ Alta de proveedor» y «Registrar remito» abren lo suyo en el mismo lugar.
//
// Para recepción: sólo el remito (es lo único de proveedores que hace, como el vanilla). Lo que debemos y los pagos
// son del dueño: esconderlo no es seguridad, el motor lo vuelve a controlar (`verProveedores`, `pagarProveedor` +
// PIN). El pago no se deshace (lleva PIN, como el vanilla); lo demás, sí, los 6 s del aviso. Reglas:
// proveedores-core.ts.
//
// La piel es la del club de hoy (sitio/club.html, «Proveedores»): una TABLA DENSA (proveedor, rubro, CUIT, lo que le
// debemos y «Cuenta y pagos»), y en la ficha la cuenta corriente y los remitos también en tabla. La estructura va acá
// (Tailwind, con consultas al ancho del contenedor); el vestido de Break Point, en piel/stock-proveedores.css. Lo
// abierto (ficha, alta, remito) va arriba de la tabla, que usa todo el ancho.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { pinesDeEjemplo } from "./caja-core";
import { Campo, CampoPin, Opciones } from "./formulario-del-club";
import { operadorActual } from "./operador-del-club";
import {
  ETIQUETA_MEDIO_PROVEEDOR,
  MEDIOS_PROVEEDOR,
  armarFichaProveedor,
  armarProveedores,
  permisosProveedores,
  type AccionProveedores,
  type DesenlaceProveedores,
  type FilaProveedor,
  type MedioProveedor,
  type VistaFichaProveedor,
} from "./proveedores-core";
import { RegistrarRemito } from "./remito-del-club";
import type { PropsDeSolapa } from "./solapas-club";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";
import "./piel/stock-proveedores.css";

const tarjeta = "flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
const OPCIONES_MEDIO = MEDIOS_PROVEEDOR.map((m) => ({ valor: m, etiqueta: ETIQUETA_MEDIO_PROVEEDOR[m] }));

function useHacer(almacen: Almacen) {
  // El pago lleva PIN: no se deshace (como el vanilla). Alta y edición, sí.
  return useCallback(
    (a: AccionProveedores): DesenlaceProveedores => almacen.comando("proveedores", [a], { deshacible: a.tipo !== "pagar" }),
    [almacen],
  );
}

function useTituloConFoco() {
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return titulo;
}

// ───────────── la tabla densa ─────────────
// Angosta (menos de 48rem de contenedor): cada proveedor en dos renglones, con lo que le debemos a la derecha. Desde
// 48rem, columnas. Cabecera y filas comparten las columnas; la cabecera es sólo visual (cada fila se dice en su botón).
const COLUMNAS_PROVEEDORES = "@3xl:grid-cols-[minmax(0,2fr)_minmax(0,1.3fr)_8.5rem_8rem_8.5rem]";
const ancha = "hidden @3xl:block";
const datosDe = (p: FilaProveedor) => [p.rubro, p.cuit ? `CUIT ${p.cuit}` : ""].filter(Boolean).join(" · ");
const fraseDelProveedor = (p: FilaProveedor) => [p.nombre, datosDe(p), p.deuda > 0 ? `Le debemos ${pesos(p.deuda)}` : "Al día"].filter(Boolean).join(" — ");

function CabeceraDeProveedores() {
  return (
    <div aria-hidden data-club-cabeza className={cn("hidden items-end gap-x-3 border-b border-line-strong px-3 pb-1.5 text-xs font-medium text-body @3xl:grid", COLUMNAS_PROVEEDORES)}>
      <span>Proveedor</span>
      <span>Rubro</span>
      <span>CUIT</span>
      <span className="text-right">Le debemos</span>
      <span />
    </div>
  );
}

function FilaDelProveedor({ p, elegido, onAbrir }: { p: FilaProveedor; elegido: boolean; onAbrir: (id: string) => void }) {
  const debe = p.deuda > 0 ? <span className="font-semibold text-strong">{pesos(p.deuda)}</span> : <span className="text-body">Al día</span>;
  return (
    <li>
      <button
        type="button"
        id={`proveedor-${p.id}`}
        data-club-fila
        aria-label={fraseDelProveedor(p)}
        aria-current={elegido || undefined}
        onClick={() => onAbrir(p.id)}
        className={cn(
          "grid min-h-11 w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 border-b border-line px-3 py-1.5 text-left text-sm tabular-nums",
          COLUMNAS_PROVEEDORES,
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus",
          elegido ? "bg-accent-soft" : "hover:bg-surface-sunken",
        )}
      >
        <span className="min-w-0">
          <span className="block font-semibold text-strong @3xl:font-medium">{p.nombre}</span>
          <span className="block text-xs text-body @3xl:hidden">{datosDe(p) || "Sin datos cargados"}</span>
        </span>
        <span className={cn(ancha, "min-w-0 break-words text-body")}>{p.rubro || "—"}</span>
        <span className={cn(ancha, "whitespace-nowrap text-body")}>{p.cuit || "—"}</span>
        <span className={cn(ancha, "text-right whitespace-nowrap")}>{debe}</span>
        <span className={cn(ancha, "text-right")}>
          <span data-club-editar className="inline-flex min-h-8 items-center rounded-md border border-line-strong px-2.5 text-xs font-semibold whitespace-nowrap text-strong">
            Cuenta y pagos
          </span>
        </span>
        {/* Angosta: lo que le debemos, a la derecha del nombre. */}
        <span className="text-right whitespace-nowrap @3xl:hidden">{p.deuda > 0 ? <span className="font-semibold text-strong">Le debemos {pesos(p.deuda)}</span> : debe}</span>
      </button>
    </li>
  );
}

function DatosDelProveedor({ titulo, valores, boton, onGuardar, children }: { titulo?: string; valores: { nombre: string; rubro: string; cuit: string; tel: string }; boton: string; onGuardar: (d: { nombre: string; rubro: string; cuit: string; tel: string }) => void; children?: React.ReactNode }) {
  const [d, setD] = useState(valores);
  const set = (k: keyof typeof d) => (e: React.ChangeEvent<HTMLInputElement>) => setD({ ...d, [k]: e.target.value });
  return (
    <form
      aria-label={titulo}
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(d);
      }}
    >
      <Campo label="Nombre" value={d.nombre} onChange={set("nombre")} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Campo label="Rubro (ej.: bebidas, cocina, insumos)" value={d.rubro} onChange={set("rubro")} />
        <Campo label="CUIT" inputMode="numeric" value={d.cuit} onChange={set("cuit")} />
        <Campo label="Teléfono" inputMode="tel" value={d.tel} onChange={set("tel")} />
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" variant={children ? "solid" : "outline"} size="md">
          {boton}
        </Button>
        {children}
      </div>
    </form>
  );
}

function PagarAlProveedor({ almacen, f, puedePagar, hacer }: { almacen: Almacen; f: VistaFichaProveedor; puedePagar: boolean; hacer: (a: AccionProveedores) => DesenlaceProveedores }) {
  const operador = useOperador(almacen);
  const quien = operador ? operador.usuario.nombre.split(" ")[0] : null;
  const [medio, setMedio] = useState<MedioProveedor>("transferencia");
  const [monto, setMonto] = useState(String(f.saldo));
  const [pin, setPin] = useState("");
  const id = `pagar-${f.id}`;
  return (
    <section aria-labelledby={id} data-club-caja className="flex flex-col gap-2 rounded-md border border-line p-3">
      <h3 id={id} className="font-semibold text-strong">
        Pagar
      </h3>
      {puedePagar ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "pagar", proveedorId: f.id, medio, monto, pin });
            setPin("");
          }}
        >
          <Opciones leyenda="Cómo le pagamos" opciones={OPCIONES_MEDIO} valor={medio} onElegir={setMedio} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
            <Campo label="Monto" inputMode="numeric" importe value={monto} onChange={(e) => setMonto(e.target.value)} />
            <CampoPin quien={quien} rol={operador?.usuario.rol} value={pin} onChange={setPin} />
          </div>
          <p className="text-sm text-body">El efectivo sale del cajón (queda en la caja del día); la transferencia queda anotada como egreso. Lleva tu PIN y queda a tu nombre.</p>
          <Button type="submit" variant="solid" size="md">
            Registrar pago
          </Button>
          {almacen.modo() === "demo" && (
            <details className="text-sm text-body">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">¿Probando la demo? Ver los PIN de ejemplo</summary>
              <p className="tabular-nums">{pinesDeEjemplo(almacen.estado())}. Son de ejemplo, sólo de la demo.</p>
            </details>
          )}
        </form>
      ) : (
        <p className="text-sm text-body">Pagarle a un proveedor es de los dueños, con su PIN.</p>
      )}
    </section>
  );
}

function CuentaConElProveedor({ f }: { f: VistaFichaProveedor }) {
  const id = `cuenta-${f.id}`;
  return (
    <section aria-labelledby={id} data-club-caja className="flex flex-col gap-2">
      <h3 id={id} className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
        Cuenta corriente <span className="tabular-nums">{f.saldo > 0 ? `Le debemos ${pesos(f.saldo)}` : "Al día"}</span>
      </h3>
      {f.movimientos.length === 0 ? (
        <p className="text-sm text-body">Sin movimientos todavía.</p>
      ) : (
        <table data-club-tabla="cuenta" className="w-full text-sm tabular-nums">
          <caption className="sr-only">Cuenta con {f.nombre}: remitos (suman) y pagos (restan), del más viejo al más nuevo</caption>
          <thead>
            <tr className="border-b border-line-strong text-left text-xs text-body">
              <th scope="col" className="hidden py-1 pr-2 font-medium @xl:table-cell">
                Fecha
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                <span className="@xl:hidden">Concepto y cuándo</span>
                <span className="hidden @xl:inline">Concepto</span>
              </th>
              <th scope="col" className="py-1 pr-2 text-right font-medium">
                Importe
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Saldo
              </th>
            </tr>
          </thead>
          <tbody>
            {f.movimientos.map((m, i) => (
              <tr key={i} className="border-b border-line align-top last:border-b-0">
                <td className="hidden py-1.5 pr-2 whitespace-nowrap text-body @xl:table-cell">{m.cuando}</td>
                {/* Angosta: la fecha va debajo del concepto (en el celular, el número de remito entra sin cortarse). */}
                <td className="py-1.5 pr-2 break-words">
                  <span className="block text-strong">{m.concepto}</span>
                  <span className="block text-xs text-body @xl:hidden">{m.cuando}</span>
                </td>
                <td className={cn("py-1.5 pr-2 text-right whitespace-nowrap", m.haber > 0 ? "text-success" : "text-strong")}>
                  {m.haber > 0 ? `− ${pesos(m.haber)}` : `+ ${pesos(m.debe)}`}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap text-strong">{pesos(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function RemitosDelProveedor({ f }: { f: VistaFichaProveedor }) {
  const id = `remitos-${f.id}`;
  return (
    <section aria-labelledby={id} data-club-caja className="flex flex-col gap-2">
      <h3 id={id} className="font-semibold text-strong">
        Remitos ({f.remitos.length})
      </h3>
      {f.remitos.length === 0 ? (
        <p className="text-sm text-body">Todavía no trajo nada.</p>
      ) : (
        // Los remitos como renglones de tabla: número, cuándo y total; se abren para ver lo que trajo cada uno.
        <ul data-club-remitos className="flex flex-col border-t border-line-strong">
          {f.remitos.map((r) => (
            <li key={r.id}>
              <details className="border-b border-line px-2 text-sm">
                <summary className="flex min-h-11 cursor-pointer flex-wrap items-center justify-between gap-x-3 font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">
                  <span>Remito {r.numero}</span>
                  <span className="font-normal text-body tabular-nums">
                    {r.cuando} · {r.lineas.length === 1 ? "1 producto" : `${r.lineas.length} productos`}
                    {r.vence ? ` · ${r.vence}` : ""} · <span className="font-semibold text-strong">{pesos(r.total)}</span>
                  </span>
                </summary>
                <ul className="flex flex-col gap-0.5 pb-2 tabular-nums text-strong">
                  {r.lineas.map((l, i) => (
                    <li key={i}>
                      {l.cant} × {l.nombre} a {pesos(l.costo)} = {pesos(l.subtotal)}
                    </li>
                  ))}
                  <li className="text-body">Lo cargó {r.cargo}.</li>
                </ul>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function FichaDelProveedor({ almacen, proveedorId, puedePagar, onCerrar }: { almacen: Almacen; proveedorId: string; puedePagar: boolean; onCerrar: () => void }) {
  const operador = useOperador(almacen);
  const seleccionar = useCallback((e: EstadoClub) => {
    const r = armarFichaProveedor(e, proveedorId, operador?.auth ?? {});
    return r === null || "motivo" in r ? null : r;
  }, [proveedorId, operador]);
  const f = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacer(almacen);
  const titulo = useTituloConFoco();
  if (!f) return null;
  const detalle = [f.rubro, f.cuit ? `CUIT ${f.cuit}` : "", f.tel].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={`ficha-proveedor-${f.id}`} data-club-ficha className={cn(tarjeta, "@container")} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <header data-club-ficha-cabeza className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`ficha-proveedor-${f.id}`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {f.nombre}
          </h2>
          {detalle && <p className="text-sm text-body">{detalle}</p>}
          <p className="text-sm font-semibold text-strong tabular-nums">{f.saldo > 0 ? `Le debemos ${pesos(f.saldo)}` : "No le debemos nada."}</p>
        </div>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Cerrar
        </Button>
      </header>
      {/* `key`: el pago arranca con el saldo de ahora cada vez que cambia. */}
      {f.saldo > 0 && <PagarAlProveedor key={f.saldo} almacen={almacen} f={f} puedePagar={puedePagar} hacer={hacer} />}
      <CuentaConElProveedor f={f} />
      <RemitosDelProveedor f={f} />
      <details className="rounded-md border border-line px-3 text-sm">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">Editar datos</summary>
        <div className="pb-3">
          <DatosDelProveedor
            key={`${f.nombre}|${f.rubro}|${f.cuit}|${f.tel}`}
            titulo={`Datos de ${f.nombre}`}
            valores={{ nombre: f.nombre, rubro: f.rubro, cuit: f.cuit, tel: f.tel }}
            boton="Guardar datos"
            onGuardar={(d) => hacer({ tipo: "editar", proveedorId: f.id, ...d })}
          />
        </div>
      </details>
    </section>
  );
}

function AltaDeProveedor({ almacen, onListo, onCerrar }: { almacen: Almacen; onListo: (id: string) => void; onCerrar: () => void }) {
  const hacer = useHacer(almacen);
  const titulo = useTituloConFoco();
  return (
    <section aria-labelledby="club-alta-proveedor" data-club-ficha className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <h2 data-club-ficha-cabeza id="club-alta-proveedor" ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Alta de proveedor
      </h2>
      <DatosDelProveedor
        valores={{ nombre: "", rubro: "", cuit: "", tel: "" }}
        boton="Dar de alta"
        onGuardar={(d) => {
          const r = hacer({ tipo: "alta", ...d });
          if (r.ok && r.proveedorId) onListo(r.proveedorId);
        }}
      >
        <Button variant="outline" size="md" onClick={onCerrar}>
          Cancelar
        </Button>
      </DatosDelProveedor>
    </section>
  );
}

/** Recepción: sólo el remito. */
function RemitoDeRecepcion({ almacen, puedeRemito }: { almacen: Almacen; puedeRemito: boolean }) {
  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-strong">Proveedores</h2>
        <p className="text-sm text-body">Desde recepción se cargan los remitos. Pagarles a los proveedores y ver lo que les debemos es de los dueños, con su PIN.</p>
      </div>
      {puedeRemito ? <RegistrarRemito almacen={almacen} enfocar={false} /> : <p className="text-sm text-body">Todavía no entró nadie a operar: para cargar un remito, entrá con tu PIN.</p>}
    </div>
  );
}

type Panel = { tipo: "ficha"; id: string } | { tipo: "alta" } | { tipo: "remito" } | null;
const seleccionarLista = (e: EstadoClub) => armarProveedores(e);

export default function ProveedoresDelClub({ almacen }: PropsDeSolapa) {
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const permisos = permisosProveedores(almacen.estado(), operadorActual(almacen).usuario?.id);
  const v = useSeleccion(almacen, seleccionarLista, porFirma);
  const [panel, setPanel] = useState<Panel>(null);
  const listaId = useId();
  const abierto = panel?.tipo === "ficha" ? panel.id : null;

  const soltar = useCallback(() => {
    const volver = panel?.tipo === "ficha" ? `proveedor-${panel.id}` : panel?.tipo === "remito" ? "club-prov-remito" : "club-alta-proveedor-boton";
    setPanel(null);
    requestAnimationFrame(() => (document.getElementById(volver) ?? document.getElementById(listaId))?.focus());
  }, [panel, listaId]);
  const cerrar = useCallback(() => {
    almacen.olvidarDeshacer();
    soltar();
  }, [almacen, soltar]);

  if (!permisos.ver) return <RemitoDeRecepcion almacen={almacen} puedeRemito={permisos.remito} />;

  return (
    <section aria-labelledby="club-proveedores" className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 data-pantalla id="club-proveedores" className="text-lg font-semibold text-strong">
            Proveedores ({v.filas.length})
          </h2>
          <p className="text-sm text-strong tabular-nums">Le debemos en total {pesos(v.deudaTotal)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button id="club-prov-remito" variant="outline" size="md" onClick={() => setPanel({ tipo: "remito" })}>
            Registrar remito
          </Button>
          <Button id="club-alta-proveedor-boton" variant="solid" size="md" onClick={() => setPanel({ tipo: "alta" })}>
            + Alta de proveedor
          </Button>
        </div>
      </div>

      {/* Lo abierto va arriba de la tabla (que usa todo el ancho, como en el club de hoy), con el ancho de un formulario. */}
      {panel && (
        <div className="max-w-3xl">
          {panel.tipo === "ficha" ? (
            <FichaDelProveedor key={panel.id} almacen={almacen} proveedorId={panel.id} puedePagar={permisos.pagar} onCerrar={cerrar} />
          ) : panel.tipo === "alta" ? (
            <AltaDeProveedor almacen={almacen} onListo={(id) => setPanel({ tipo: "ficha", id })} onCerrar={cerrar} />
          ) : (
            <RegistrarRemito almacen={almacen} onListo={soltar} onCerrar={cerrar} />
          )}
        </div>
      )}

      {v.filas.length === 0 ? (
        <p id={listaId} tabIndex={-1} className="text-sm text-body">
          Todavía no hay proveedores. Dalos de alta para cargarles remitos.
        </p>
      ) : (
        <div data-club-tabla="proveedores" className="@container min-w-0">
          <CabeceraDeProveedores />
          <ul id={listaId} tabIndex={-1} aria-label="Proveedores del club" className="flex flex-col focus-visible:outline-2 focus-visible:outline-focus">
            {v.filas.map((p) => (
              <FilaDelProveedor key={p.id} p={p} elegido={p.id === abierto} onAbrir={(id) => setPanel({ tipo: "ficha", id })} />
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-body">Tocá un proveedor para ver su cuenta, pagarle o ver sus remitos. Recepción carga los remitos desde la Caja; pagarles y ver su cuenta es de los dueños, con PIN.</p>
    </section>
  );
}
