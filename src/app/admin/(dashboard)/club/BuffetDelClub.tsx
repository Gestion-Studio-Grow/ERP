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
// Ola 1 de paridad: la «Venta rápida de mostrador» (VentaDeMostrador.tsx) y, en cada cuenta, la «Mesa compleja»
// (buffet-mesa-compleja.tsx): pasar un cargo a otra cuenta y cargo manual, con descuento firmado por el dueño.
// Cada tarjeta es un `memo`: cargar en una cuenta repinta sólo esa tarjeta (compartirBuffet).

import { memo, useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { clientesQueCoinciden } from "./alta-core";
import { DESHACIBLE_BUFFET, armarBuffet, compartirBuffet, confirmarCreditosCuenta, ejecutarBuffet, productosParaCargar, type AccionBuffet, type VistaCuentaBuffet } from "./buffet-core";
import MesaCompleja from "./buffet-mesa-compleja";
import { aprobarConCodigo, codigoDeLaDemo, mensajeParaElDuenio, pedirFiado } from "./credito-core";
import { revisarConfirmacion, type MedioCobro } from "./cuenta-core";
import { ComoPaga, ConfirmarCreditos, type DatosConfirmacion } from "./piezas";
import { useSeleccion } from "./usar-almacen";
import VentaDeMostrador from "./VentaDeMostrador";

const seleccionarBuffet = (e: EstadoClub, a: Ahora) => armarBuffet(e, a);

/** El pedido de fiado de una cuenta: tipear el código del dueño (y, en la demo, verlo). */
function PedidoDelDuenio({ almacen, pedido }: { almacen: Almacen; pedido: NonNullable<VistaCuentaBuffet["pedidoPendiente"]> }) {
  const [codigo, setCodigo] = useState("");
  const [verDemo, setVerDemo] = useState(false);
  const id = useId();
  const demo = verDemo && almacen.modo() === "demo" ? codigoDeLaDemo(almacen.estado(), pedido.id) : null;
  return (
    <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning-soft p-3">
      <p className="text-sm text-strong">
        Esperando el OK del dueño para {pedido.tipo === "fiado" ? `fiar ${pesos(pedido.monto)}` : `habilitarle la cuenta corriente hasta ${pesos(pedido.monto)}`}. Mandale
        por WhatsApp: «{mensajeParaElDuenio(almacen.estado(), pedido.id)}»
      </p>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          const d = almacen.ejecutar((est, ahora, auth) => aprobarConCodigo(est, pedido.id, codigo, auth, ahora));
          if (d.ok) setCodigo("");
        }}
      >
        <div className="flex flex-1 flex-col gap-1">
          <label htmlFor={id} className="text-xs font-medium text-muted">
            Código del dueño (6 letras, ej. ABC-DEF)
          </label>
          <Input id={id} value={codigo} autoComplete="off" autoCapitalize="characters" maxLength={7} onChange={(e) => setCodigo(e.target.value)} />
        </div>
        <Button type="submit" variant="solid" size="md" disabled={pedido.trabado !== null}>
          Aprobar
        </Button>
      </form>
      <p className="text-xs text-muted">{pedido.trabado ?? `Quedan ${pedido.quedan} intentos.`}</p>
      {/* El código del dueño se muestra SÓLO en la demo: en la jornada real le llega a él y a nadie más. */}
      {almacen.modo() === "demo" && (
        <Button variant="ghost" size="md" onClick={() => setVerDemo((v) => !v)} aria-expanded={verDemo}>
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

const TarjetaCuenta = memo(function TarjetaCuenta({
  cuenta,
  almacen,
  medio,
  onAccion,
  negocio,
}: {
  cuenta: VistaCuentaBuffet;
  almacen: Almacen;
  medio: MedioCobro;
  onAccion: (a: AccionBuffet) => void;
  /** Para guardar en el equipo los intentos de PIN del descuento (sobreviven a recargar). */
  negocio?: string;
}) {
  const [confirmando, setConfirmando] = useState<DatosConfirmacion | null>(null);
  const titulo = useId();
  const cobrar = () => {
    if (medio !== "monedero") return onAccion({ tipo: "cobrar", cuentaId: cuenta.id, medio });
    const c = confirmarCreditosCuenta(almacen.estado(), cuenta.id);
    if (!c.ok) return almacen.informar({ ok: false, mensaje: c.motivo });
    setConfirmando(c);
  };
  return (
    <li>
      <article aria-labelledby={titulo} className="flex h-full flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
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
          <p className="shrink-0 text-lg font-bold tabular-nums text-strong">{pesos(cuenta.aCobrar)}</p>
        </header>
        {cuenta.items.length > 0 ? (
          <ul aria-label={`Cargos de ${cuenta.titular}`} className="flex flex-col gap-1 text-sm tabular-nums">
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
          <p className="text-sm text-muted">Sin cargos todavía.</p>
        )}
        {cuenta.pagaDe.length > 0 && <p className="text-xs text-muted">Paga también lo de {cuenta.pagaDe.join(", ")}.</p>}
        {cuenta.pagaOtro ? (
          <p className="text-sm text-muted">Estos cargos los paga {cuenta.pagaOtro}: se cobran con su cuenta.</p>
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
                <Button variant="outline" size="md" onClick={() => almacen.ejecutar((e, ahora, auth) => pedirFiado(e, cuenta.id, auth, ahora))}>
                  Pedir OK para fiar {pesos(cuenta.aCobrar)}
                </Button>
              )}
            </div>
            {cuenta.aCobrar > 0 && !cuenta.aCuenta.ok && !cuenta.pedidoPendiente && <p className="text-xs text-muted">{cuenta.aCuenta.motivo}</p>}
            {cuenta.pedidoPendiente && <PedidoDelDuenio almacen={almacen} pedido={cuenta.pedidoPendiente} />}
          </div>
        )}
        <MesaCompleja almacen={almacen} cuenta={cuenta} negocio={negocio} />
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
    <section aria-labelledby={`${ids.busca}-t`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
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
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-3">
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

export default function BuffetDelClub({ almacen, onVerTurno, negocio }: { almacen: Almacen; onVerTurno: (reservaId: string) => void; negocio?: string }) {
  const vista = useSeleccion(almacen, seleccionarBuffet, compartirBuffet);
  const [medio, setMedio] = useState<MedioCobro>("efectivo");
  const onAccion = useCallback(
    (a: AccionBuffet) => {
      almacen.ejecutar((e, ahora, auth) => ejecutarBuffet(e, a, ahora, auth), { deshacible: DESHACIBLE_BUFFET[a.tipo] });
    },
    [almacen],
  );
  const creditos = Math.max(0, ...vista.cuentas.map((c) => c.creditos));
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="club-mesas" className="flex flex-col gap-2">
        <h2 id="club-mesas" className="text-lg font-semibold text-strong">
          Mesas que siguen cargando
        </h2>
        {vista.mesas.length === 0 ? (
          <p className="text-sm text-muted">Ninguna: cuando se cierre una cancha y la mesa siga, aparece acá.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {vista.mesas.map((m) => (
              <li key={m.reservaId} className="flex items-center justify-between gap-2 rounded-lg border border-line bg-surface-raised p-3">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-strong">{m.titulo}</span>
                  <span className="text-sm tabular-nums text-muted">Deben {pesos(m.saldo)}</span>
                </span>
                <Button variant="outline" size="md" onClick={() => onVerTurno(m.reservaId)}>
                  Ver la cuenta
                  <span className="sr-only"> de {m.titulo}</span>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <VentaDeMostrador almacen={almacen} />

      <Cargar almacen={almacen} cuentas={vista.cuentas} onAccion={onAccion} />

      <section aria-labelledby="club-cuentas" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="club-cuentas" className="text-lg font-semibold text-strong">
            Cuentas abiertas
          </h2>
          <p className="text-sm tabular-nums text-muted">
            {vista.cuentas.length} {vista.cuentas.length === 1 ? "cuenta" : "cuentas"} · {pesos(vista.totalAbierto)} sin cobrar
          </p>
        </div>
        <ComoPaga medio={medio} onElegir={setMedio} conCreditos={creditos} leyenda="Cómo pagan (para «Cobrar»)" />
        <ul className={cn("grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3")}>
          {vista.cuentas.map((c) => (
            <TarjetaCuenta key={c.id} cuenta={c} almacen={almacen} medio={medio} onAccion={onAccion} negocio={negocio} />
          ))}
        </ul>
      </section>

      <AbrirCuenta almacen={almacen} onAccion={onAccion} />
    </div>
  );
}
