"use client";

// ============================================================================
// EL BUFFET — mesas que siguen cargando, cuentas abiertas, cargar productos y fiar con el OK del dueño.
// ============================================================================
//
// De arriba abajo, lo que recepción hace en el buffet:
//   1. «Mesas que siguen cargando»: la cancha ya se cerró y la mesa sigue; cada una lleva a la cuenta de su turno.
//   2. Cargar: a qué cuenta y qué producto (el lector o el nombre), con cuántos.
//   3. Las cuentas abiertas, cada una con sus cargos (− / +), lo que debe y cómo se cierra: cobrar (con el medio
//      elegido o con sus créditos, con el paso previo), pasar a su cuenta corriente o, si no tiene, pedir el OK del
//      dueño para fiar y tipear el código de 6 letras que manda (5 intentos).
//   4. Abrir una cuenta sin turno (alguien que viene al bar).
// Ola 1 de paridad: en cada cuenta, la «Mesa compleja» (buffet-mesa-compleja.tsx): pasar un cargo a otra cuenta y
// cargo manual, con descuento firmado por el dueño.
// Cada tarjeta es un `memo`: cargar en una cuenta repinta sólo esa tarjeta (compartirBuffet).
// Tanda 2D (reingeniería de Break Point): la mesa que sigue vive ACÁ con sus comensales (`MesaQueSigue`): «+ plato» al
// comensal elegido, cada uno paga lo suyo con su medio de un toque, «Cobrar todo y cerrar la mesa» o a cuenta corriente,
// sin saltar a la Agenda. Sus cuentas no se repiten en «Cuentas abiertas»: van dentro de la mesa («Más»).
// Una sola venta de mostrador: la hoja global «Vender» (tecla V, Tanda 2A, VentaDeMostrador.tsx). Acá queda su acceso de
// un toque (`onVender`, lo mismo que la tecla V: lo monta ClubDemo). La «Venta rápida» de la Tanda 1 ya no existe.
// Piel del club de hoy: cada cuenta es una tarjeta RESUMIDA (quién, cuánto debe, qué lleva) y «Cargar / cobrar» la
// despliega con el − / + de cada cargo y los «+ Plato»; cobrar, cuenta corriente, fiar y la mesa compleja siguen a la
// vista. Los colores de Break Point van en piel/buffet.css (bajo [data-estetica="breakpoint"], por `data-buffet`).

import { memo, useCallback, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { clientesQueCoinciden } from "./alta-core";
import { DESHACIBLE_BUFFET, armarBuffet, compartirBuffet, confirmarCreditosCuenta, productosParaCargar, type AccionBuffet, type VistaBuffet, type VistaCuentaBuffet } from "./buffet-core";
import MesaCompleja from "./buffet-mesa-compleja";
import { compartirMesas, mesasDelBuffet, textoCerrarMesa, type MesaDelBuffet } from "./buffet-mesa-core";
import PedidoDelDuenio from "./pedido-del-duenio";
import { DESHACIBLE, ETIQUETA_MEDIO, MEDIOS_CAJA, MEDIO_CORTO, revisarConfirmacion, type AccionCuenta, type MedioCobro } from "./cuenta-core";
import { ComoPaga, ConfirmarCreditos, type DatosConfirmacion } from "./piezas";
import { useSeleccion } from "./usar-almacen";
import "./piel/buffet.css";

const seleccionarBuffet = (e: EstadoClub, a: Ahora) => armarBuffet(e, a);
const seleccionarMesas = (e: EstadoClub) => mesasDelBuffet(e);

/** «Cargar / cobrar», como el botón de la tarjeta del club de hoy: despliega los platos y el − / + de cada cargo. */
function CargarCobrar({ abierta, detalle, titular, onCambiar }: { abierta: boolean; detalle: string; titular: string; onCambiar: () => void }) {
  return (
    <Button variant="outline" size="md" className="group" data-buffet="cargar-cobrar" aria-expanded={abierta} aria-controls={detalle} onClick={onCambiar}>
      Cargar / cobrar
      <span className="sr-only"> a {titular}</span>
      <span aria-hidden="true" className="transition-transform duration-150 group-aria-expanded:rotate-180 motion-reduce:transition-none">
        ▾
      </span>
    </Button>
  );
}

const TarjetaCuenta = memo(function TarjetaCuenta({
  cuenta,
  almacen,
  medio,
  onAccion,
  negocio,
  platos,
}: {
  /** Los «+ Plato» de un toque (la misma lista para todas las cuentas: no cambia la memo). */
  platos: VistaBuffet["platos"];
  cuenta: VistaCuentaBuffet;
  almacen: Almacen;
  medio: MedioCobro;
  onAccion: (a: AccionBuffet) => void;
  /** Para guardar en el equipo los intentos de PIN del descuento (sobreviven a recargar). */
  negocio?: string;
}) {
  const [confirmando, setConfirmando] = useState<DatosConfirmacion | null>(null);
  // Como el club de hoy: la tarjeta es un resumen (quién, cuánto, qué lleva) y «Cargar / cobrar» la despliega para
  // sumar platos y ajustar cantidades. Cobrar, pasar a cuenta corriente y fiar quedan siempre a la vista.
  const [abierta, setAbierta] = useState(false);
  const titulo = useId();
  const detalle = useId();
  const cobrar = () => {
    if (medio !== "monedero") return onAccion({ tipo: "cobrar", cuentaId: cuenta.id, medio });
    const c = confirmarCreditosCuenta(almacen.estado(), cuenta.id);
    if (!c.ok) return almacen.informar({ ok: false, mensaje: c.motivo });
    setConfirmando(c);
  };
  return (
    <li>
      <article aria-labelledby={titulo} data-buffet="cuenta" data-abierta={abierta || undefined} className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
        <header className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h3 id={titulo} className="truncate font-semibold text-strong">
              {cuenta.titular}
            </h3>
            <p className="text-xs text-muted">
              {cuenta.origen}
              {cuenta.creditos > 0 ? ` · créditos ${pesos(cuenta.creditos)}` : ""}
            </p>
          </div>
          <p data-buffet="total" className="shrink-0 text-lg font-bold tabular-nums text-strong">
            {pesos(cuenta.aCobrar)}
          </p>
        </header>
        <div id={detalle} data-buffet="detalle" className="flex flex-col gap-2">
          {cuenta.items.length === 0 ? (
            <p className="text-sm text-muted">Sin cargos todavía.</p>
          ) : abierta ? (
            <ul aria-label={`Cargos de ${cuenta.titular}`} data-buffet="cargos" className="flex flex-col gap-1 text-sm tabular-nums">
              {cuenta.items.map((i) => (
                <li key={i.idx} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {i.nombre}
                    {i.nota && <span className="text-xs text-muted"> · {i.nota}</span>}
                  </span>
                  {i.ajustable ? (
                    <span className="flex items-center gap-1">
                      <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno menos de ${i.nombre}`} onClick={() => onAccion({ tipo: "ajustar", cuentaId: cuenta.id, itemIdx: i.idx, delta: -1 })}>
                        −
                      </Button>
                      <span className="w-6 text-center font-semibold">{i.cant}</span>
                      <Button variant="outline" size="md" className="w-11 px-0!" aria-label={`Uno más de ${i.nombre}`} onClick={() => onAccion({ tipo: "ajustar", cuentaId: cuenta.id, itemIdx: i.idx, delta: 1 })}>
                        +
                      </Button>
                    </span>
                  ) : (
                    <span>{i.cant} ×</span>
                  )}
                  <span className="w-20 text-right">{pesos(i.importe)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <ul aria-label={`Cargos de ${cuenta.titular}`} data-buffet="resumen" className="flex flex-col gap-0.5 text-sm tabular-nums">
              {cuenta.items.map((i) => (
                <li key={i.idx} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    {i.cant} × {i.nombre}
                    {i.nota && <span className="text-xs text-muted"> · {i.nota}</span>}
                  </span>
                  <span className="shrink-0 text-right">{pesos(i.importe)}</span>
                </li>
              ))}
            </ul>
          )}
          {abierta && platos.length > 0 && (
            <div role="group" aria-label={`Cargar un plato a ${cuenta.titular}`} data-buffet="platos" className="flex flex-wrap gap-1.5">
              {platos.map((p) => (
                <Button key={p.id} variant="outline" size="md" onClick={() => onAccion({ tipo: "cargar", cuentaId: cuenta.id, productoId: p.id, cant: 1 })}>
                  + {p.nombre}
                </Button>
              ))}
            </div>
          )}
        </div>
        {cuenta.pagaDe.length > 0 && <p className="text-xs text-muted">Paga también lo de {cuenta.pagaDe.join(", ")}.</p>}
        {cuenta.pagaOtro && <p className="text-sm text-muted">Estos cargos los paga {cuenta.pagaOtro}: se cobran con su cuenta.</p>}
        {cuenta.pagaOtro ? (
          <div className="mt-auto flex flex-wrap gap-2">
            <CargarCobrar abierta={abierta} detalle={detalle} titular={cuenta.titular} onCambiar={() => setAbierta((a) => !a)} />
          </div>
        ) : (
          <div className="mt-auto flex flex-col gap-2">
            {confirmando && (
              <ConfirmarCreditos
                datos={confirmando}
                onSi={() => {
                  const r = revisarConfirmacion(confirmando, confirmarCreditosCuenta(almacen.estado(), cuenta.id));
                  if (r.tipo === "otra") {
                    setConfirmando(r.datos);
                    return almacen.informar({ ok: false, mensaje: `El monto cambió: ahora son ${pesos(r.datos.usa)}. Confirmá de nuevo.` });
                  }
                  setConfirmando(null);
                  if (r.tipo === "no") return almacen.informar({ ok: false, mensaje: r.motivo });
                  onAccion({ tipo: "cobrar", cuentaId: cuenta.id, medio: "monedero" });
                }}
                onNo={() => setConfirmando(null)}
              />
            )}
            <div className="flex flex-wrap gap-2">
              <CargarCobrar abierta={abierta} detalle={detalle} titular={cuenta.titular} onCambiar={() => setAbierta((a) => !a)} />
              {cuenta.aCobrar > 0 ? (
                <Button variant="solid" size="md" onClick={cobrar}>
                  Cobrar {pesos(cuenta.aCobrar)}
                  <span className="sr-only"> a {cuenta.titular}</span>
                </Button>
              ) : (
                <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "cerrarEnCero", cuentaId: cuenta.id })}>
                  Cerrar la cuenta
                </Button>
              )}
              {cuenta.aCobrar > 0 && cuenta.aCuenta.ok && cuenta.clienteId && (
                <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "aCuenta", cuentaId: cuenta.id })}>
                  A su cuenta corriente
                </Button>
              )}
              {cuenta.aCobrar > 0 && !cuenta.aCuenta.ok && cuenta.aCuenta.puedePedirFiado && (
                <Button variant="outline" size="md" onClick={() => almacen.comando("fiado", [{ tipo: "pedir", cuentaId: cuenta.id }])}>
                  Pedir OK para fiar {pesos(cuenta.aCobrar)}
                </Button>
              )}
            </div>
            {cuenta.aCobrar > 0 && !cuenta.aCuenta.ok && !cuenta.pedidoPendiente && <p className="text-xs text-muted">{cuenta.aCuenta.motivo}</p>}
            {cuenta.pedidoPendiente && <PedidoDelDuenio almacen={almacen} novedadId={cuenta.pedidoPendiente.id} />}
          </div>
        )}
        <MesaCompleja almacen={almacen} cuenta={cuenta} negocio={negocio} />
      </article>
    </li>
  );
});

/**
 * Una mesa que sigue (la cancha ya se cerró): sus comensales con lo que lleva cada uno y su cobro de un toque, los «+ plato»
 * al comensal elegido y el cierre de la mesa. Todo por la cuenta del turno (comando «cuenta»): la plata la decide el motor.
 */
const MesaQueSigue = memo(function MesaQueSigue({
  mesa,
  almacen,
  platos,
  cuentas,
  medio,
  negocio,
  onAccionBuffet,
  onVerTurno,
}: {
  mesa: MesaDelBuffet;
  almacen: Almacen;
  platos: VistaBuffet["platos"];
  /** Las tarjetas de sus cuentas, para «Más» (repartir, cargar a mano, fiar). */
  cuentas: VistaCuentaBuffet[];
  medio: MedioCobro;
  negocio?: string;
  onAccionBuffet: (a: AccionBuffet) => void;
  onVerTurno: (reservaId: string) => void;
}) {
  const [para, setPara] = useState(mesa.comensales[0]?.idx ?? 0);
  const [texto, setTexto] = useState("");
  const [mas, setMas] = useState(false);
  const titulo = useId();
  const idPara = useId();
  const idBusca = useId();
  const idMas = useId();
  const elegido = mesa.comensales.find((c) => c.idx === para) ?? mesa.comensales[0];
  const accion = (a: AccionCuenta) => almacen.comando("cuenta", [mesa.reservaId, a], { deshacible: DESHACIBLE[a.tipo] });
  const cargar = (productoId: string) => {
    if (!elegido) return;
    accion({ tipo: "cargo", idx: elegido.idx, productoId, cant: 1, modo: "cuenta", medio: "efectivo" });
    setTexto("");
  };
  const { porCodigo, productos } = productosParaCargar(almacen.estado(), texto);
  return (
    <li>
      <article aria-labelledby={titulo} data-buffet="mesa" className="flex h-full flex-col gap-3 rounded-lg border border-line bg-surface-raised p-3">
        <header className="flex items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h3 id={titulo} className="truncate font-semibold text-strong">
              {mesa.titulo}
            </h3>
            <p className="text-xs text-muted">{mesa.detalle}</p>
          </div>
          <p data-buffet="total" className="shrink-0 text-lg font-bold tabular-nums text-strong">
            {pesos(mesa.total)}
          </p>
        </header>

        {/* Sumar: a quién (chips, un toque) y qué (los platos de un toque, o el lector / el nombre). */}
        <fieldset className="flex flex-col gap-1">
          <legend id={idPara} className="mb-1 text-xs font-medium text-muted">
            Sumar a
          </legend>
          <div className="flex flex-wrap gap-1.5">
            {mesa.comensales.map((c) => (
              <label
                key={c.idx}
                className={cn(
                  "inline-flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
                  elegido?.idx === c.idx ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong text-body",
                )}
              >
                <input type="radio" name={idPara} value={c.idx} checked={elegido?.idx === c.idx} onChange={() => setPara(c.idx)} className="sr-only" />
                {c.nombre}
              </label>
            ))}
          </div>
        </fieldset>
        {platos.length > 0 && elegido && (
          <div role="group" aria-label={`Sumarle un plato a ${elegido.nombre}`} data-buffet="platos" className="flex flex-wrap gap-1.5">
            {platos.map((p) => (
              <Button key={p.id} variant="outline" size="md" onClick={() => cargar(p.id)}>
                + {p.nombre}
              </Button>
            ))}
          </div>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor={idBusca} className="text-xs font-medium text-muted">
            Otro producto (pasá el lector o escribí)
          </label>
          <Input
            id={idBusca}
            value={texto}
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && productos.length === 1 && (porCodigo || texto.trim())) {
                e.preventDefault();
                cargar(productos[0].id);
              }
            }}
          />
        </div>
        {texto.trim() !== "" && (
          <ul aria-label={`Productos para ${elegido?.nombre ?? "la mesa"}`} className="grid grid-cols-1 gap-1">
            {productos.length === 0 && <li className="text-sm text-muted">No hay productos con eso.</li>}
            {productos.map((p) => (
              <li key={p.id}>
                <Button variant="ghost" size="md" className="w-full justify-between!" onClick={() => cargar(p.id)}>
                  <span className="truncate">1 × {p.nombre}</span>
                  <span className="tabular-nums text-muted">{pesos(p.precio)}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}

        {/* Cada comensal con lo suyo y sus 4 medios: cobra de un toque, nada queda elegido para el que sigue. */}
        <ul aria-label={`Comensales de la ${mesa.titulo.toLowerCase()}`} data-buffet="comensales" className="flex flex-col">
          {mesa.comensales.map((c) => (
            <li key={c.idx} data-buffet="comensal" className="flex flex-col gap-1.5 border-t border-line py-2 first:border-t-0">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-strong">{c.nombre}</span>
                  {c.lleva.length > 0 && <span className="block text-xs text-muted">{c.lleva.join(" · ")}</span>}
                </span>
                {c.aPagar > 0 ? (
                  <span className="shrink-0 font-semibold tabular-nums text-strong">{pesos(c.aPagar)}</span>
                ) : (
                  <span className="shrink-0 text-sm text-muted">{c.situacion === "al día" ? "✔ al día" : c.situacion}</span>
                )}
              </div>
              {c.aPagar > 0 && (
                <div role="group" aria-label={`Cobrarle ${pesos(c.aPagar)} a ${c.nombre}`} className="flex flex-wrap gap-1.5">
                  {MEDIOS_CAJA.map((m) => (
                    <Button key={m} variant="outline" size="md" className="min-w-11 px-3" aria-label={`${c.nombre} paga ${pesos(c.aPagar)} en ${ETIQUETA_MEDIO[m]}`} onClick={() => accion({ tipo: "cobrarJugador", idx: c.idx, medio: m })}>
                      {MEDIO_CORTO[m]}
                    </Button>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>

        {/* Cerrar la mesa: todo con un medio, o a cuenta corriente; en cero, cerrarla. */}
        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-3">
          {mesa.total > 0 ? (
            <div role="group" aria-label={textoCerrarMesa(mesa.total)} className="flex flex-col gap-1.5">
              <p className="text-sm font-semibold text-strong">{textoCerrarMesa(mesa.total)}:</p>
              <div className="flex flex-wrap gap-1.5">
                {MEDIOS_CAJA.map((m) => (
                  <Button key={m} variant="outline" size="md" className="min-w-11 px-3" aria-label={`${textoCerrarMesa(mesa.total)} en ${ETIQUETA_MEDIO[m]}`} onClick={() => accion({ tipo: "cerrarCargos", medio: m })}>
                    {MEDIO_CORTO[m]}
                  </Button>
                ))}
                {mesa.aCuentaCorriente && (
                  <Button variant="ghost" size="md" onClick={() => accion({ tipo: "cargosACuenta" })}>
                    A cuenta corriente
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <Button variant="solid" size="md" className="self-start" onClick={() => accion({ tipo: "cerrarCargos", medio: "efectivo" })}>
              {textoCerrarMesa(0)}
              <span className="sr-only"> ({mesa.titulo})</span>
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            {cuentas.length > 0 && (
              <Button variant="ghost" size="md" aria-expanded={mas} aria-controls={idMas} onClick={() => setMas((x) => !x)}>
                Más: repartir, cargar a mano, fiar
              </Button>
            )}
            <Button variant="ghost" size="md" onClick={() => onVerTurno(mesa.reservaId)}>
              Ver la cuenta del turno
              <span className="sr-only"> ({mesa.titulo})</span>
            </Button>
          </div>
          {mas && cuentas.length > 0 && (
            <ul id={idMas} aria-label={`Cuentas de la ${mesa.titulo.toLowerCase()}`} className="grid grid-cols-1 gap-3">
              {cuentas.map((c) => (
                <TarjetaCuenta key={c.id} cuenta={c} almacen={almacen} medio={medio} onAccion={onAccionBuffet} negocio={negocio} platos={platos} />
              ))}
            </ul>
          )}
        </div>
      </article>
    </li>
  );
});

function Cargar({ almacen, cuentas, onAccion }: { almacen: Almacen; cuentas: VistaCuentaBuffet[]; onAccion: (a: AccionBuffet) => void }) {
  const [cuentaId, setCuentaId] = useState(cuentas[0]?.id ?? "");
  const [texto, setTexto] = useState("");
  const [cant, setCant] = useState("1");
  const ids = { cuenta: useId(), busca: useId(), cant: useId() };
  const elegida = cuentas.some((c) => c.id === cuentaId) ? cuentaId : (cuentas[0]?.id ?? "");
  const { porCodigo, productos } = productosParaCargar(almacen.estado(), texto);
  const n = Math.max(1, Math.round(Number(cant)) || 1);
  const cargar = (productoId: string) => {
    onAccion({ tipo: "cargar", cuentaId: elegida, productoId, cant: n });
    setTexto("");
    setCant("1");
  };
  if (!cuentas.length) return null;
  return (
    <section aria-labelledby={`${ids.busca}-t`} data-buffet="cargar" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <h2 id={`${ids.busca}-t`} className="font-semibold text-strong">
        Cargar productos
      </h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_6rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cuenta} className="text-xs font-medium text-muted">
            A la cuenta de
          </label>
          <Select id={ids.cuenta} value={elegida} onChange={(e) => setCuentaId(e.target.value)}>
            {cuentas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.titular} · {c.origen}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.busca} className="text-xs font-medium text-muted">
            Código o producto (pasá el lector o escribí)
          </label>
          <Input
            id={ids.busca}
            value={texto}
            autoComplete="off"
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && productos.length === 1 && (porCodigo || texto.trim())) {
                e.preventDefault();
                cargar(productos[0].id);
              }
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.cant} className="text-xs font-medium text-muted">
            Cantidad
          </label>
          <Input id={ids.cant} inputMode="numeric" value={cant} onChange={(e) => setCant(e.target.value)} />
        </div>
      </div>
      {texto.trim() !== "" && (
        <ul aria-label="Productos para cargar" className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {productos.length === 0 && <li className="text-sm text-muted">No hay productos con eso.</li>}
          {productos.map((p) => (
            <li key={p.id}>
              <Button variant="ghost" size="md" className="w-full justify-between!" onClick={() => cargar(p.id)}>
                <span className="truncate">
                  {n} × {p.nombre}
                </span>
                <span className="tabular-nums text-muted">
                  {pesos(n * p.precio)} · {p.stock}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AbrirCuenta({ almacen, onAccion }: { almacen: Almacen; onAccion: (a: AccionBuffet) => void }) {
  const [titular, setTitular] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const id = useId();
  const fichas = clienteId ? [] : clientesQueCoinciden(almacen.estado(), titular);
  return (
    <section aria-labelledby={`${id}-t`} data-ui="abrir-cuenta" data-buffet="abrir" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
      <h2 id={`${id}-t`} className="font-semibold text-strong">
        Abrir una cuenta
      </h2>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          onAccion({ tipo: "abrir", titular, clienteId });
          setTitular("");
          setClienteId(null);
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-xs font-medium text-muted">
            A nombre de (si tiene ficha, elegila)
          </label>
          <Input
            id={id}
            value={titular}
            autoComplete="off"
            onChange={(e) => {
              setTitular(e.target.value);
              setClienteId(null);
            }}
          />
        </div>
        <Button type="submit" variant="outline" size="md" disabled={!titular.trim()}>
          Abrir la cuenta
        </Button>
      </form>
      {fichas.length > 0 && (
        <ul aria-label="Fichas que coinciden" className="grid grid-cols-1 gap-1">
          {fichas.map((f) => (
            <li key={f.id}>
              <Button
                variant="ghost"
                size="md"
                className="w-full justify-between!"
                onClick={() => {
                  setTitular(f.nombre);
                  setClienteId(f.id);
                }}
              >
                <span className="truncate">{f.nombre}</span>
                <span className="text-xs text-muted">{f.detalle || "ficha"}</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BuffetDelClub({
  almacen,
  onVerTurno,
  negocio,
  onVender,
  atajos = true,
}: {
  almacen: Almacen;
  onVerTurno: (reservaId: string) => void;
  negocio?: string;
  /** Abre la hoja global «Vender» (lo mismo que la tecla V, 2A): la única venta de mostrador. */
  onVender: () => void;
  /** Los atajos de una tecla prendidos: el botón anuncia (y muestra) la V sólo si anda. */
  atajos?: boolean;
}) {
  const vista = useSeleccion(almacen, seleccionarBuffet, compartirBuffet);
  const mesas = useSeleccion(almacen, seleccionarMesas, compartirMesas);
  const [medio, setMedio] = useState<MedioCobro>("efectivo");
  const onAccion = useCallback(
    (a: AccionBuffet) => {
      almacen.comando("buffet", [a], { deshacible: DESHACIBLE_BUFFET[a.tipo] });
    },
    [almacen],
  );
  // Las cuentas de una mesa que sigue van dentro de la mesa (con sus comensales): no se repiten abajo.
  const { sueltas, deLaMesa } = useMemo(() => {
    const deLaMesa = new Map<string, VistaCuentaBuffet[]>();
    const enMesa = new Set<string>();
    for (const m of mesas) {
      deLaMesa.set(m.reservaId, vista.cuentas.filter((c) => m.cuentas.includes(c.id)));
      for (const id of m.cuentas) enMesa.add(id);
    }
    return { sueltas: vista.cuentas.filter((c) => !enMesa.has(c.id)), deLaMesa };
  }, [mesas, vista.cuentas]);
  const sinCobrar = sueltas.reduce((s, c) => s + c.saldo, 0);
  const creditos = Math.max(0, ...vista.cuentas.map((c) => c.creditos));
  const seccionMesas = (
    <section aria-labelledby="club-mesas" data-buffet="mesas" className="flex flex-col gap-2">
      <h2 id="club-mesas" className="text-lg font-semibold text-strong">
        Mesas que siguen cargando
      </h2>
      {mesas.length === 0 ? (
        <p className="text-sm text-muted">Ninguna: cuando se cierre una cancha y la mesa siga, aparece acá con sus comensales.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {mesas.map((m) => (
            <MesaQueSigue key={m.reservaId} mesa={m} almacen={almacen} platos={vista.platos} cuentas={deLaMesa.get(m.reservaId) ?? []} medio={medio} negocio={negocio} onAccionBuffet={onAccion} onVerTurno={onVerTurno} />
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div className="flex flex-col gap-4">
      {/* Las mesas que siguen arriba cuando hay (es lo que se cobra cuando se van); después las cuentas abiertas como
          tarjetas, la venta de mostrador y abrir una cuenta a mano. */}
      {mesas.length > 0 && seccionMesas}
      <section aria-labelledby="club-cuentas" data-pantalla-tarjeta className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="club-cuentas" data-pantalla className="text-lg font-semibold text-strong">
            Cuentas abiertas
          </h2>
          <p className="text-sm tabular-nums text-muted">
            {sueltas.length} {sueltas.length === 1 ? "cuenta" : "cuentas"} · {pesos(sinCobrar)} sin cobrar
          </p>
        </div>
        <ComoPaga medio={medio} onElegir={setMedio} conCreditos={creditos} leyenda="Cómo pagan (para «Cobrar»)" />
        <ul data-buffet="cuentas" className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3")}>
          {sueltas.map((c) => (
            <TarjetaCuenta key={c.id} cuenta={c} almacen={almacen} medio={medio} onAccion={onAccion} negocio={negocio} platos={vista.platos} />
          ))}
        </ul>
      </section>

      {mesas.length === 0 && seccionMesas}

      {/* La venta de mostrador es la hoja global «Vender» (tecla V, desde cualquier solapa): acá, el acceso de un toque. */}
      <section aria-labelledby="club-vender" data-buffet="vender" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised p-3">
        <div className="min-w-0">
          <h2 id="club-vender" className="font-semibold text-strong">
            Venta de mostrador
          </h2>
          <p className="text-sm text-muted">Alguien que compra y se va: se cobra al toque, sin abrir cuenta.</p>
        </div>
        <Button variant="solid" size="md" aria-keyshortcuts={atajos ? "V" : undefined} onClick={onVender}>
          Vender
          {atajos && (
            <kbd aria-hidden="true" className="ml-2 rounded-sm border border-current px-1 text-xs font-semibold">
              V
            </kbd>
          )}
        </Button>
      </section>

      <Cargar almacen={almacen} cuentas={vista.cuentas} onAccion={onAccion} />

      <AbrirCuenta almacen={almacen} onAccion={onAccion} />
    </div>
  );
}
