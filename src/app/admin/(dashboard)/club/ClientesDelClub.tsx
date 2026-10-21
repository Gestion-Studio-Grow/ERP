"use client";

// ============================================================================
// LOS CLIENTES DEL CLUB — la lista, el alta y la ficha con su cuenta corriente.
// ============================================================================
//
// A la izquierda (o arriba, en el celular), la lista con el buscador: los que deben, primero y en rojo (con ⚠ y la
// palabra, nunca sólo el color). Tocar un cliente abre su ficha al lado (en la tablet apaisada y la PC) o arriba de
// la lista (en el celular), y el foco va a la ficha; «Cerrar la ficha» o Escape vuelven al cliente de la lista.
// La ficha: los datos, la baja (sólo sin deuda ni cargos), las novedades por WhatsApp y la CUENTA CORRIENTE: el
// dueño la configura; recepción la pide y espera al dueño (con el código de 6 letras que le manda); el estado de
// cuenta con el saldo corrido; cobrar la deuda y recordarla por WhatsApp.
// Todo cambia con `almacen.ejecutar` (aviso abajo y «Deshacer» de lo que se puede deshacer). Lo de las reglas está
// en clientes-core.ts; quién opera, en operador-del-club.ts.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { tomarFichaPedida } from "./ficha-pedida";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { LIMITE_SUGERIDO, armarClientes, armarFicha, ejecutarClientes, textoCC, type AccionClientes, type DesenlaceClientes, type FilaCliente, type VistaFicha } from "./clientes-core";
import { codigoDeLaDemo } from "./credito-core";
import type { MedioCaja } from "./cuenta-core";
import { useNegocioDelClub } from "./negocio-del-club";
import { operadorActual } from "./operador-del-club";
import { ComoPaga } from "./piezas";
import type { PropsDeSolapa } from "./solapas-club";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";
import { BotonWhatsApp } from "./WhatsAppDelClub";

/** Lo que se puede deshacer en los 6 s del aviso. Lo del crédito no: es una decisión (o un intento de código). */
const DESHACIBLES: ReadonlySet<AccionClientes["tipo"]> = new Set(["alta", "editar", "baja", "novedades", "cobrarDeuda"]);

function useHacer(almacen: Almacen) {
  return useCallback(
    (a: AccionClientes): DesenlaceClientes => almacen.ejecutar((e, ahora, auth) => ejecutarClientes(e, a, ahora, auth), { deshacible: DESHACIBLES.has(a.tipo) }),
    [almacen],
  );
}

const etiqueta = "text-sm font-medium text-strong";
const tarjeta = "flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";

function Campo({ label, ...props }: { label: string } & React.ComponentProps<typeof Input>) {
  const id = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className={etiqueta}>
        {label}
      </label>
      <Input id={id} autoComplete="off" {...props} />
    </div>
  );
}

function FilaDeLaLista({ c, elegido, onAbrir }: { c: FilaCliente; elegido: boolean; onAbrir: (id: string) => void }) {
  return (
    <li>
      <button
        type="button"
        id={`cliente-${c.id}`}
        aria-current={elegido || undefined}
        onClick={() => onAbrir(c.id)}
        className={cn(
          "flex min-h-11 w-full flex-col gap-1 rounded-md border px-3 py-2 text-left text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
          elegido ? "border-accent bg-accent-soft" : "border-line bg-surface-raised hover:border-line-strong",
        )}
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold text-strong">{c.nombre}</span>
          <span className="block text-xs text-body">
            {c.nivel ? `Nivel ${c.nivel}` : "Sin nivel"} · {textoCC(c.cc)}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap gap-x-3 tabular-nums">
          {c.deuda > 0 ? <span className="font-semibold text-danger">⚠ Debe {pesos(c.deuda)}</span> : <span className="text-body">Al día</span>}
          {c.creditos > 0 && <span className="text-body">Créditos {pesos(c.creditos)}</span>}
          {c.faltas > 0 && <span className="text-body">{c.faltas === 1 ? "1 falta" : `${c.faltas} faltas`}</span>}
        </span>
      </button>
    </li>
  );
}

function AltaDeCliente({ almacen, onListo, onCerrar }: { almacen: Almacen; onListo: (id: string) => void; onCerrar: () => void }) {
  const hacer = useHacer(almacen);
  const [datos, setDatos] = useState({ nombre: "", tel: "", nivel: "" });
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <section aria-labelledby="club-alta-cliente" className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <div>
        <h2 id="club-alta-cliente" ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
          Alta de cliente
        </h2>
        <p className="text-sm text-body">En Break Point todos son clientes: no hay socios ni beneficios.</p>
      </div>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const d = hacer({ tipo: "alta", ...datos });
          if (d.ok && d.clienteId) onListo(d.clienteId);
        }}
      >
        <Campo label="Nombre y apellido" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
        <Campo label="Teléfono (con característica)" inputMode="tel" value={datos.tel} onChange={(e) => setDatos({ ...datos, tel: e.target.value })} />
        <Campo label="Nivel (opcional, ej.: 5ta)" value={datos.nivel} onChange={(e) => setDatos({ ...datos, nivel: e.target.value })} />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="solid" size="md">
            Dar de alta
          </Button>
          <Button variant="outline" size="md" onClick={onCerrar}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  );
}

function DatosDelCliente({ f, hacer }: { f: VistaFicha; hacer: (a: AccionClientes) => DesenlaceClientes }) {
  const [datos, setDatos] = useState({ nombre: f.nombre, tel: f.tel, nivel: f.nivel });
  return (
    <section aria-labelledby={`datos-${f.id}`} className="flex flex-col gap-3">
      <h3 id={`datos-${f.id}`} className="font-semibold text-strong">
        Datos
      </h3>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          hacer({ tipo: "editar", clienteId: f.id, ...datos });
        }}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
          <Campo label="Nombre" value={datos.nombre} onChange={(e) => setDatos({ ...datos, nombre: e.target.value })} />
          <Campo label="Teléfono" inputMode="tel" value={datos.tel} onChange={(e) => setDatos({ ...datos, tel: e.target.value })} />
          <Campo label="Nivel" value={datos.nivel} onChange={(e) => setDatos({ ...datos, nivel: e.target.value })} />
        </div>
        <Button type="submit" variant="outline" size="md">
          Guardar cambios
        </Button>
      </form>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-strong has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
        <input
          type="checkbox"
          className="size-5 accent-[var(--accent)]"
          checked={f.recibeNovedades}
          onChange={(e) => hacer({ tipo: "novedades", clienteId: f.id, recibe: e.target.checked })}
        />
        Recibe las novedades del club por WhatsApp
      </label>
      {f.baja.puede ? (
        <Button variant="danger" size="md" onClick={() => hacer({ tipo: "baja", clienteId: f.id })}>
          Dar de baja a {f.nombre}
        </Button>
      ) : (
        <p className="text-sm text-body">{f.baja.motivo}</p>
      )}
    </section>
  );
}

/** Recepción, con el pedido hecho: avisarle al dueño y tipear el código que manda. */
function EsperandoAlDuenio({ almacen, f, hacer }: { almacen: Almacen; f: VistaFicha; hacer: (a: AccionClientes) => DesenlaceClientes }) {
  const p = f.pedido!;
  const [codigo, setCodigo] = useState("");
  const [monto, setMonto] = useState(String(p.monto));
  const [verDemo, setVerDemo] = useState(false);
  // Sólo en la demo: en la jornada real, el código lo saca el dueño con SU PIN (si recepción lo viera, se aprobaría sola).
  const enDemo = almacen.modo() === "demo";
  const demo = verDemo && enDemo ? codigoDeLaDemo(almacen.estado(), p.id) : null;
  const nota = useId();
  const notas = [...new Set(p.avisos.map((a) => a.enlace.nota).filter(Boolean))];
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3">
      <h4 className="font-semibold text-strong">Esperando al dueño</h4>
      <p className="text-sm text-strong">
        {p.pidio} pidió {p.que}. Avisale al dueño: abre el link en su celular, pone su PIN y te manda un código de 6 letras.
      </p>
      <div className="flex flex-wrap gap-2">
        {p.avisos.map((a) => (
          <BotonWhatsApp key={a.duenioId} enlace={a.enlace} notaEn={notas.length === 1 ? nota : undefined}>
            Avisar a {a.nombre} por WhatsApp
          </BotonWhatsApp>
        ))}
      </div>
      {notas.length === 1 && (
        <p id={nota} className="text-xs text-body">
          {notas[0]}
        </p>
      )}
      <form
        className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem]"
        onSubmit={(e) => {
          e.preventDefault();
          if (hacer({ tipo: "aprobarCodigo", novedadId: p.id, codigo, monto }).ok) setCodigo("");
        }}
      >
        <Campo label="Código del dueño (ej. ABC-DEF)" autoCapitalize="characters" spellCheck={false} maxLength={7} value={codigo} onChange={(e) => setCodigo(e.target.value)} />
        <Campo label="Monto aprobado" inputMode="numeric" importe value={monto} onChange={(e) => setMonto(e.target.value)} />
        <Button type="submit" variant="solid" size="md" className="sm:col-span-2" disabled={p.trabado !== null}>
          Aprobar con el código
        </Button>
      </form>
      <p className="text-sm text-body">{p.trabado ?? `Quedan ${p.quedan} intentos.`}</p>
      {/* En el celular el texto no entra en una línea: el botón crece para abajo (sigue de 44 px como mínimo). */}
      {enDemo && (
        <Button variant="ghost" size="md" className="h-auto! min-h-11 py-2 whitespace-normal!" onClick={() => setVerDemo((v) => !v)} aria-expanded={verDemo}>
          {verDemo ? "Ocultar" : "Ver"} el código que le llega al dueño (sólo en la demo)
        </Button>
      )}
      {demo && (
        <p className="text-sm text-strong">
          En el celular de {demo.duenio} sale: <strong className="tabular-nums">{demo.codigo}</strong>
        </p>
      )}
    </div>
  );
}

function CuentaCorriente({ almacen, f, hacer }: { almacen: Almacen; f: VistaFicha; hacer: (a: AccionClientes) => DesenlaceClientes }) {
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const operador = operadorActual(almacen);
  const [limite, setLimite] = useState(String(f.cc.limite || LIMITE_SUGERIDO));
  const [nota, setNota] = useState("");
  const [medio, setMedio] = useState<MedioCaja>("efectivo");
  const [monto, setMonto] = useState(String(f.deuda));
  const id = `cc-${f.id}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="flex flex-wrap items-baseline gap-2 font-semibold text-strong">
        Cuenta corriente
        <span className={cn("rounded px-2 py-0.5 text-xs font-semibold", f.cc.habilitada ? "bg-accent-soft text-accent-ink" : "bg-surface-sunken text-strong")}>
          {f.cc.habilitada ? `Hasta ${pesos(f.cc.limite)}` : "No habilitada"}
        </span>
      </h3>

      {operador.esDuenio ? (
        <>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              hacer({ tipo: "configurarCC", clienteId: f.id, habilitada: true, limite });
            }}
          >
            <Campo label="Hasta cuánto le fiamos" inputMode="numeric" importe value={limite} onChange={(e) => setLimite(e.target.value)} />
            <Button type="submit" variant="solid" size="md">
              {f.cc.habilitada ? "Cambiar el límite" : "Habilitar"}
            </Button>
          </form>
          {f.cc.habilitada && (
            <Button variant="outline" size="md" onClick={() => hacer({ tipo: "configurarCC", clienteId: f.id, habilitada: false, limite: "" })}>
              Cortar la cuenta corriente
            </Button>
          )}
          {f.pedido && (
            <p className="text-sm text-body">
              {f.pedido.pidio} pidió {f.pedido.que}: lo resolvés acá o en el Tablero.
            </p>
          )}
        </>
      ) : f.pedido ? (
        <EsperandoAlDuenio almacen={almacen} f={f} hacer={hacer} />
      ) : f.cc.habilitada ? (
        <p className="text-sm text-body">Para cambiarle el límite o cortarla, lo hace el dueño.</p>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "pedirCC", clienteId: f.id, limite, nota });
          }}
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr]">
            <Campo label="Límite que pedís" inputMode="numeric" importe value={limite} onChange={(e) => setLimite(e.target.value)} />
            <Campo label="Por qué (opcional)" value={nota} maxLength={120} onChange={(e) => setNota(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" size="md">
            Pedir la autorización al dueño
          </Button>
        </form>
      )}

      <h4 className="flex flex-wrap items-baseline justify-between gap-2 font-semibold text-strong">
        Estado de cuenta
        <span className={cn("tabular-nums", f.deuda > 0 ? "text-danger" : "text-strong")}>{f.deuda > 0 ? `⚠ Debe ${pesos(f.deuda)}` : `Saldo ${pesos(f.deuda)}`}</span>
      </h4>
      {f.movimientos.length === 0 ? (
        <p className="text-sm text-body">Sin movimientos todavía.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <caption className="sr-only">Movimientos de la cuenta corriente de {f.nombre}, del más viejo al más nuevo</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-body">
              <th scope="col" className="py-1 pr-2 font-medium">
                Cuándo
              </th>
              <th scope="col" className="py-1 pr-2 font-medium">
                Concepto
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
                <td className="py-1.5 pr-2 whitespace-nowrap text-body">{m.cuando}</td>
                <td className="py-1.5 pr-2 break-words text-strong">{m.concepto}</td>
                <td className={cn("py-1.5 pr-2 text-right whitespace-nowrap", m.importe > 0 ? "text-danger" : "text-success")}>
                  {m.importe > 0 ? "+" : "−"}
                  {pesos(Math.abs(m.importe))}
                </td>
                <td className="py-1.5 text-right whitespace-nowrap text-strong">{pesos(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {f.deuda > 0 && (
        <form
          aria-label={`Cobrar la deuda de ${f.nombre}`}
          className="flex flex-col gap-2 rounded-md border border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            hacer({ tipo: "cobrarDeuda", clienteId: f.id, medio, monto });
          }}
        >
          <ComoPaga medio={medio} onElegir={(m) => m !== "monedero" && setMedio(m)} angosto />
          <Campo label="Monto (vacío = todo lo que debe)" inputMode="numeric" importe value={monto} onChange={(e) => setMonto(e.target.value)} />
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <Button type="submit" variant="solid" size="md">
              Cobrar
            </Button>
            {f.recordarDeuda && (
              <BotonWhatsApp enlace={f.recordarDeuda}>Recordar por WhatsApp</BotonWhatsApp>
            )}
          </div>
        </form>
      )}
    </section>
  );
}

function FichaDelCliente({ almacen, clienteId, onCerrar, onSeFue }: { almacen: Almacen; clienteId: string; onCerrar: () => void; onSeFue: () => void }) {
  const modo = almacen.modo();
  const negocio = useNegocioDelClub();
  // El link al aprobador del dueño sale de ESTE sitio (el panel del negocio): /admin/club/aprobar#aprobar&…, salvo que
  // el negocio apruebe en otro sitio (aprobador-externo.ts: Break Point en el trial, con el link del club de hoy).
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarFicha(e, clienteId, a, modo, window.location.origin, negocio), [clienteId, modo, negocio]);
  const f = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacer(almacen);
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  // Dado de baja (o deshecha el alta): la ficha se cierra sola, sin apagar «Deshacer».
  useEffect(() => {
    if (!f) onSeFue();
  }, [f, onSeFue]);
  if (!f) return null;
  const detalle = [f.tel, f.nivel ? `Nivel ${f.nivel}` : "", f.faltas === 1 ? "1 falta" : `${f.faltas} faltas`, f.creditos ? `créditos ${pesos(f.creditos)}` : ""].filter(Boolean).join(" · ");
  return (
    <section aria-labelledby={`ficha-${f.id}`} className={tarjeta} onKeyDown={(e) => e.key === "Escape" && onCerrar()}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 id={`ficha-${f.id}`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {f.nombre}
          </h2>
          <p className="text-sm text-body">{detalle}</p>
          {f.deuda > 0 && <p className="text-sm font-semibold text-danger">⚠ Debe {pesos(f.deuda)}</p>}
        </div>
        <Button variant="ghost" size="md" onClick={onCerrar}>
          Cerrar la ficha
        </Button>
      </header>
      {/* `key`: si cambian los datos guardados (o se deshace), el formulario arranca de lo guardado. */}
      <DatosDelCliente key={`${f.nombre}|${f.tel}|${f.nivel}`} f={f} hacer={hacer} />
      <hr className="border-line" />
      <CuentaCorriente key={`${f.cc.habilitada}|${f.cc.limite}|${f.deuda}|${f.pedido?.id ?? ""}`} almacen={almacen} f={f} hacer={hacer} />
    </section>
  );
}

type Panel = { tipo: "ficha"; id: string } | { tipo: "alta" } | null;

export default function ClientesDelClub({ almacen }: PropsDeSolapa) {
  const [busca, setBusca] = useState("");
  const seleccionar = useCallback((e: EstadoClub) => armarClientes(e, busca), [busca]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const [panel, setPanel] = useState<Panel>(() => {
    const id = tomarFichaPedida();
    return id ? { tipo: "ficha", id } : null;
  });
  useEffect(() => {
    const abrir = (e: Event) => {
      tomarFichaPedida();
      setPanel({ tipo: "ficha", id: (e as CustomEvent<string>).detail });
    };
    window.addEventListener("club:ficha", abrir);
    return () => window.removeEventListener("club:ficha", abrir);
  }, []);
  const buscaId = useId();
  const abierto = panel?.tipo === "ficha" ? panel.id : null;

  // El foco vuelve a quien abrió (si se dio de baja, ya no está en la lista: va al buscador).
  const soltar = useCallback(() => {
    const volver = panel?.tipo === "ficha" ? `cliente-${panel.id}` : "club-alta-boton";
    setPanel(null);
    requestAnimationFrame(() => (document.getElementById(volver) ?? document.getElementById(buscaId))?.focus());
  }, [panel, buscaId]);
  // Cerrar a mano: lo hecho queda (como al cerrar la cuenta de un turno), ya no se deshace.
  const cerrar = useCallback(() => {
    almacen.olvidarDeshacer();
    soltar();
  }, [almacen, soltar]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_28rem]">
      <section aria-labelledby="club-clientes" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 data-pantalla id="club-clientes" className="text-lg font-semibold text-strong">
            Clientes ({v.filas.length === v.total ? v.total : `${v.filas.length} de ${v.total}`})
          </h2>
          <Button id="club-alta-boton" variant="solid" size="md" onClick={() => setPanel({ tipo: "alta" })}>
            + Alta de cliente
          </Button>
        </div>
        <div className="flex max-w-sm flex-col gap-1">
          <label htmlFor={buscaId} className={etiqueta}>
            Buscar por nombre o teléfono
          </label>
          <Input id={buscaId} type="search" autoComplete="off" value={busca} onChange={(e) => setBusca(e.target.value)} />
        </div>
        {v.filas.length === 0 ? (
          <p className="text-sm text-body">No hay clientes con eso. Si es nuevo, dalo de alta.</p>
        ) : (
          <ul aria-label="Clientes del club" className="flex flex-col gap-2">
            {v.filas.map((c) => (
              <FilaDeLaLista key={c.id} c={c} elegido={c.id === abierto} onAbrir={(id) => setPanel({ tipo: "ficha", id })} />
            ))}
          </ul>
        )}
      </section>

      {/* En el celular lo abierto va ARRIBA de la lista (no al final de 24 clientes); en la PC, al lado. */}
      <div className="order-first lg:order-none lg:sticky lg:top-4 lg:self-start">
        {panel?.tipo === "ficha" ? (
          <FichaDelCliente key={panel.id} almacen={almacen} clienteId={panel.id} onCerrar={cerrar} onSeFue={soltar} />
        ) : panel?.tipo === "alta" ? (
          <AltaDeCliente almacen={almacen} onListo={(id) => setPanel({ tipo: "ficha", id })} onCerrar={cerrar} />
        ) : (
          <p className="hidden rounded-lg border border-dashed border-line-strong p-4 text-sm text-body lg:block">
            Tocá un cliente para ver su ficha: sus datos, su cuenta corriente y lo que debe.
          </p>
        )}
      </div>
    </div>
  );
}
