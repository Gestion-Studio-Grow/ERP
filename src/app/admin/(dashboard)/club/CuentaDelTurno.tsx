"use client";

// ============================================================================
// LA CUENTA DEL TURNO — la cancha y los cargos de cada jugador, en un solo lugar.
// ============================================================================
//
// Lo que se abre al tocar un turno (pedido del club, validado con el dueño). De arriba abajo, en el
// orden en que se usa con gente en el mostrador:
//   1. quién y qué cancha, y los totales: la cancha, los cargos y lo que falta cobrar;
//   2. cómo paga (efectivo, Mercado Pago, transferencia, débito y, si tiene, los créditos del cliente,
//      con el paso previo de confirmación): vale para todos los cobros;
//   3. una fila por jugador con lo suyo y su botón «Cobrar $X», y sus «a cargo de» (la cancha y los
//      cargos: el que invita paga lo del otro);
//   4. los cierres: «Cobrar la seña», «Cobrar todo», «Cobrar la cancha y cerrarla · la mesa sigue» y, con
//      la cancha cerrada, «Cobrar y cerrar los cargos» o pasarlos a cuenta corriente;
//   5. sumar un cargo del buffet a un jugador (por código del lector o por nombre): a su cuenta o cobrado.
// Ola 1 de paridad (cuenta-piezas.tsx): la nota del turno arriba; «Sólo la cancha $X» por jugador; la «Cuenta de la
// cancha» (cobrar un monto, o cerrarla a cuenta corriente) y «Sumar un jugador» (por nombre o con su ficha).
// Paridad del UAT del torneo: cada jugador que debe sus cargos los pasa a su cuenta corriente o pide el OK del dueño
// para fiar ahí mismo (`PedidoDelDuenio`, el mismo panel que el Buffet), y con la cancha cerrada la mesa sigue cargando.
// Lo que pasó se anuncia en la barra de avisos del club (con «Deshacer»). Nada se anima: se toca cien
// veces por día.
//
// La vista sale de `armarCuenta` y cada toque va a `ejecutar` (cuenta-core.ts) por el almacén: la
// pantalla no suma ni decide nada de plata.

import { memo, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { Marca } from "@/components/ui/Marca";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen, Desenlace } from "./almacen";
import { productosParaCargar } from "./buffet-core";
import {
  DESHACIBLE,
  armarCuenta,
  compartirCuenta,
  confirmarCreditos,
  ejecutar,
  revisarConfirmacion,
  textoCierre,
  type AccionCuenta,
  type CobroConCreditos,
  type FilaJugador,
  type MedioCaja,
  type MedioCobro,
  type VistaCuenta,
} from "./cuenta-core";
import { pedirFiado } from "./credito-core";
import { CobroDeLaCancha, SumarJugador } from "./cuenta-piezas";
import PedidoDelDuenio from "./pedido-del-duenio";
import { ComoPaga, ConfirmarCreditos, type DatosConfirmacion } from "./piezas";
import CicloDelTurno from "./CicloDelTurno";
import { useSeleccion } from "./usar-almacen";

function SelectorACargo({
  id,
  etiqueta,
  elegido,
  opciones,
  onCambiar,
}: {
  id: string;
  etiqueta: string;
  elegido: string;
  opciones: { valor: string; etiqueta: string }[];
  onCambiar: (valor: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted">
        {etiqueta}
      </label>
      <Select
        id={id}
        value={elegido}
        onChange={(e) => onCambiar(e.target.value)}
      >
        {opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.etiqueta}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Los cargos de un jugador a crédito: a su cuenta corriente si le da; si no, el OK del dueño para fiar. */
function CreditoDelJugador({ almacen, fila, onAccion }: { almacen: Almacen; fila: FilaJugador; onAccion: (a: AccionCuenta) => void }) {
  const c = fila.credito;
  if (!c) return null;
  if (c.aCuenta) {
    return (
      <Button variant="outline" size="md" className="self-start" onClick={() => onAccion({ tipo: "cargosACuentaDe", cuentaId: c.cuentaId })}>
        Sus cargos a su cuenta corriente {pesos(c.monto)}
        <span className="sr-only"> ({fila.nombre})</span>
      </Button>
    );
  }
  if (c.pedidoId) return <PedidoDelDuenio almacen={almacen} novedadId={c.pedidoId} />;
  if (c.pedirFiado) {
    return (
      <div className="flex flex-col gap-1">
        <Button
          variant="outline"
          size="md"
          className="self-start"
          // Pedir el OK no se deshace (tampoco en el vanilla): se resuelve con el código o lo rechaza el dueño.
          onClick={() => almacen.ejecutar((e, ahora, auth) => pedirFiado(e, c.cuentaId, auth, ahora))}
        >
          Pedir OK para fiar {pesos(c.monto)}
          <span className="sr-only"> a {fila.nombre}</span>
        </Button>
        <p className="text-xs text-muted">{c.motivo}</p>
      </div>
    );
  }
  // Sin ficha no hay a quién fiarle: se cobra (o se le da de alta en Clientes). No se repite el aviso en cada fila.
  return null;
}

const FilaDeJugador = memo(function FilaDeJugador({
  almacen,
  fila,
  reservaId,
  onCobrar,
  onCobrarParte,
  onAccion,
}: {
  almacen: Almacen;
  fila: FilaJugador;
  reservaId: string;
  onCobrar: (idx: number) => void;
  onCobrarParte: (idx: number) => void;
  onAccion: (a: AccionCuenta) => void;
}) {
  const base = `${reservaId}-${fila.idx}`;
  return (
    <li className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-strong">
            {fila.nombre}
            {fila.deudor && <span className="ml-2 text-xs font-semibold text-danger">⚠ cuenta con deuda</span>}
          </p>
          <p className="text-sm tabular-nums text-muted">
            {fila.detalle}
            {fila.creditos > 0 ? ` · créditos ${pesos(fila.creditos)}` : ""}
          </p>
        </div>
        {fila.aPagar > 0 ? (
          <div className="flex flex-wrap gap-2">
            {fila.soloCancha !== null && (
              <Button variant="ghost" size="md" onClick={() => onCobrarParte(fila.idx)}>
                Sólo la cancha {pesos(fila.soloCancha)}
                <span className="sr-only"> de {fila.nombre}</span>
              </Button>
            )}
            <Button variant="outline" size="md" onClick={() => onCobrar(fila.idx)}>
              Cobrar {pesos(fila.aPagar)}
              <span className="sr-only"> a {fila.nombre}</span>
            </Button>
          </div>
        ) : (
          <span className="pt-2 text-sm text-muted">{fila.situacion === "al día" ? "✔ al día" : fila.situacion}</span>
        )}
      </div>
      {(fila.cancha || fila.cargos) && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {fila.cancha && (
            <SelectorACargo
              id={`cancha-${base}`}
              etiqueta={`Parte de la cancha de ${fila.nombre}`}
              elegido={fila.cancha.elegido}
              opciones={fila.cancha.opciones}
              onCambiar={(de) => onAccion({ tipo: "aCargoCancha", idx: fila.idx, de })}
            />
          )}
          {fila.cargos && (
            <SelectorACargo
              id={`cargos-${base}`}
              etiqueta={`Cargos de ${fila.nombre}`}
              elegido={fila.cargos.elegido}
              opciones={fila.cargos.opciones}
              onCambiar={(de) => onAccion({ tipo: "aCargoCargos", cuentaId: fila.cargos!.cuentaId, de })}
            />
          )}
        </div>
      )}
      {fila.items.length > 0 && (
        <ul aria-label={`Cargos de ${fila.nombre}`} className="text-sm tabular-nums">
          {fila.items.map((i, k) => (
            <li key={k} className="flex justify-between gap-2 text-muted">
              <span className="min-w-0 truncate">
                {i.cant} × {i.nombre}
              </span>
              <span>{pesos(i.importe)}</span>
            </li>
          ))}
        </ul>
      )}
      <CreditoDelJugador almacen={almacen} fila={fila} onAccion={onAccion} />
    </li>
  );
});

function Totales({ vista }: { vista: VistaCuenta }) {
  const T = vista.totales;
  return (
    // Sobre el fondo hundido los rótulos van en text-body: text-muted ahí no llega a 4,5:1 (PERFORMANCE-TERMINALES.md, ronda 3).
    <dl aria-label="Totales del turno" className="grid grid-cols-3 gap-2 rounded-md bg-surface-sunken p-3 tabular-nums">
      <div>
        <dt className="text-xs text-body">Cancha</dt>
        <dd className="font-semibold text-strong">{pesos(T.cancha)}</dd>
      </div>
      <div>
        <dt className="text-xs text-body">Cargos</dt>
        <dd className="font-semibold text-strong">{pesos(T.cargos)}</dd>
      </div>
      <div>
        <dt className="text-xs text-body">Falta cobrar</dt>
        <dd className={cn("text-lg font-bold", T.pendiente > 0 ? "text-strong" : "text-success")}>{pesos(T.pendiente)}</dd>
      </div>
    </dl>
  );
}

/**
 * Sumar un cargo del buffet a un jugador. El campo acepta lo que pasa el lector (código + Enter: con el foco en el
 * campo, cualquier lector de teclado anda) o un nombre; Enter con un código exacto carga directo.
 */
function SumarCargo({ almacen, vista, medio, onAccion }: { almacen: Almacen; vista: VistaCuenta; medio: MedioCobro; onAccion: (a: AccionCuenta) => void }) {
  const [jugador, setJugador] = useState(0);
  const [texto, setTexto] = useState("");
  const [cant, setCant] = useState("1");
  const [modo, setModo] = useState<"cuenta" | "cobrar">("cuenta");
  const idBusca = useId();
  const idCant = useId();
  const idJug = useId();
  const nombreModo = useId();
  const { porCodigo, productos } = productosParaCargar(almacen.estado(), texto);
  const n = Math.max(1, Math.round(Number(cant)) || 1);
  const medioCaja: MedioCaja = medio === "monedero" ? "efectivo" : medio;
  const cargar = (productoId: string) => {
    onAccion({ tipo: "cargo", idx: jugador, productoId, cant: n, modo, medio: medioCaja });
    setTexto("");
    setCant("1");
  };
  return (
    <section aria-labelledby={`${idBusca}-t`} className="flex flex-col gap-2 border-t border-line pt-3">
      <h3 id={`${idBusca}-t`} className="text-sm font-semibold text-strong">
        Sumar un cargo del buffet
      </h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_6rem]">
        <div className="flex flex-col gap-1">
          <label htmlFor={idJug} className="text-xs font-medium text-muted">
            Para quién
          </label>
          <Select
            id={idJug}
            value={jugador}
            onChange={(e) => setJugador(Number(e.target.value))}
          >
            {vista.jugadores.map((j) => (
              <option key={j.idx} value={j.idx}>
                {j.nombre}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={idCant} className="text-xs font-medium text-muted">
            Cantidad
          </label>
          <Input id={idCant} inputMode="numeric" value={cant} onChange={(e) => setCant(e.target.value)} />
        </div>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="sr-only">Cómo se carga</legend>
        {(
          [
            ["cuenta", "Sumar a su cuenta"],
            ["cobrar", `Cobrar ahora (${medio === "monedero" ? "efectivo" : "el medio de arriba"})`],
          ] as const
        ).map(([v, t]) => (
          <label
            key={v}
            className={cn(
              "flex min-h-11 cursor-pointer items-center rounded-md border px-3 text-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus",
              modo === v ? "border-accent bg-accent-soft font-semibold text-strong" : "border-line-strong bg-surface-raised",
            )}
          >
            <input type="radio" name={nombreModo} value={v} checked={modo === v} onChange={() => setModo(v)} className="sr-only" />
            {t}
          </label>
        ))}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor={idBusca} className="text-xs font-medium text-muted">
          Código o producto (pasá el lector o escribí)
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
          aria-describedby={`${idBusca}-r`}
        />
      </div>
      <p id={`${idBusca}-r`} className="sr-only" aria-live="polite">
        {texto.trim() ? (productos.length ? `${productos.length} productos` : "No hay productos con eso") : ""}
      </p>
      {texto.trim() !== "" && (
        <ul aria-label="Productos para cargar" className="grid grid-cols-1 gap-1">
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

export default function CuentaDelTurno({ almacen, reservaId, onVolver }: { almacen: Almacen; reservaId: string; onVolver: () => void }) {
  const seleccionar = useCallback((e: EstadoClub) => armarCuenta(e, reservaId), [reservaId]);
  const vista = useSeleccion(almacen, seleccionar, compartirCuenta);
  const [medio, setMedio] = useState<MedioCobro>("efectivo");
  const [confirmando, setConfirmando] = useState<{ datos: DatosConfirmacion; accion: AccionCuenta & CobroConCreditos } | null>(null);
  const titulo = useRef<HTMLHeadingElement>(null);
  const seccion = useRef<HTMLElement>(null);
  const idTitulo = useId();

  // Al abrir otro turno, el foco va a su cuenta (en el celular, además, la trae a la vista).
  useEffect(() => {
    titulo.current?.focus();
  }, [reservaId]);

  const onAccion = useCallback(
    (a: AccionCuenta): Desenlace => {
      setConfirmando(null);
      const d = almacen.ejecutar((estado, ahora, auth) => ejecutar(estado, reservaId, a, ahora, auth), { deshacible: DESHACIBLE[a.tipo] });
      // Si la tecla tocada desapareció (ya no hay nada que cobrar), el foco no se pierde en la página:
      // vuelve al título de la cuenta.
      requestAnimationFrame(() => {
        if (seccion.current && !seccion.current.contains(document.activeElement)) titulo.current?.focus();
      });
      return d;
    },
    [almacen, reservaId],
  );

  // Con «Créditos del cliente» se cobra jugador por jugador, su parte de la cancha, un monto de la cancha o la seña,
  // y SIEMPRE con el paso previo.
  const pedirCreditos = useCallback(
    (accion: AccionCuenta & CobroConCreditos) => {
      const c = confirmarCreditos(almacen.estado(), reservaId, accion);
      if (!c.ok) {
        almacen.informar({ ok: false, mensaje: c.motivo });
        return;
      }
      setConfirmando({ datos: c, accion });
    },
    [almacen, reservaId],
  );
  const onCobrar = useCallback(
    (idx: number) => (medio === "monedero" ? pedirCreditos({ tipo: "cobrarJugador", idx, medio }) : onAccion({ tipo: "cobrarJugador", idx, medio })),
    [medio, onAccion, pedirCreditos],
  );
  const onCobrarParte = useCallback(
    (idx: number) => (medio === "monedero" ? pedirCreditos({ tipo: "cobrarParte", idx, medio }) : onAccion({ tipo: "cobrarParte", idx, medio })),
    [medio, onAccion, pedirCreditos],
  );
  const onCobrarCancha = useCallback(
    (monto: number): Desenlace | null => {
      if (medio !== "monedero") return onAccion({ tipo: "cobrarCancha", monto, medio });
      pedirCreditos({ tipo: "cobrarCancha", monto, medio });
      return null;
    },
    [medio, onAccion, pedirCreditos],
  );

  if (!vista) {
    return (
      <section aria-label="Cuenta del turno" className="rounded-lg border border-line bg-surface-raised p-4">
        <p className="text-sm text-muted">Ese turno ya no tiene cuenta para cobrar.</p>
        <Button variant="outline" size="md" className="mt-3" onClick={onVolver}>
          Volver a la agenda
        </Button>
      </section>
    );
  }

  const { cierres } = vista;
  const hayQueCobrar = vista.totales.pendiente > 0 || cierres.cobrarSena !== null;
  const creditos = Math.max(vista.creditosTitular, ...vista.jugadores.map((j) => j.creditos));
  const conCreditos = medio === "monedero";
  const medioCaja = medio as MedioCaja;
  return (
    <section
      ref={seccion}
      aria-labelledby={idTitulo}
      onKeyDown={(e) => {
        if (e.key === "Escape") onVolver();
      }}
      className="flex flex-col gap-4 rounded-lg border border-line bg-surface-raised p-4"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-[0.06em] text-muted">Cuenta del turno</p>
          <h2 id={idTitulo} ref={titulo} tabIndex={-1} className="truncate text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
            {vista.titular}
          </h2>
          <p className="text-sm text-muted">{vista.descripcion}</p>
          {vista.notas && (
            <p className="mt-1 text-sm text-body">
              <span className="font-semibold text-strong">Nota del turno:</span> {vista.notas}
            </p>
          )}
        </div>
        <Button variant="ghost" size="md" onClick={onVolver}>
          Volver a la agenda
        </Button>
      </header>

      {vista.mesaAbierta && <Marca tipo="medias">Cancha cerrada · la mesa sigue</Marca>}
      <Totales vista={vista} />
      {vista.sena && (
        <p className="text-sm text-muted">
          Seña {pesos(vista.sena.monto)}: {vista.sena.pagada ? "✔ pagada" : <strong className="text-strong">pendiente</strong>}
        </p>
      )}

      {hayQueCobrar && <ComoPaga medio={medio} onElegir={(m) => {
            setMedio(m);
            setConfirmando(null);
          }} conCreditos={creditos} angosto />}
      {confirmando && (
        <ConfirmarCreditos datos={confirmando.datos} onSi={() => {
            const a = confirmando.accion;
            const ahora = confirmarCreditos(almacen.estado(), reservaId, a);
            const r = revisarConfirmacion(confirmando.datos, ahora);
            if (r.tipo === "seguir") return onAccion(a);
            if (r.tipo === "no") {
              setConfirmando(null);
              return almacen.informar({ ok: false, mensaje: r.motivo });
            }
            setConfirmando({ datos: r.datos, accion: a });
            almacen.informar({ ok: false, mensaje: `El monto cambió: ahora son ${pesos(r.datos.usa)}. Confirmá de nuevo.` });
          }} onNo={() => {
            setConfirmando(null);
            setMedio("efectivo");
          }} />
      )}

      {/* Cobrar y cerrar ARRIBA, debajo de cómo paga (como el diálogo del club de hoy): sin scroll en cada cobro. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {cierres.cobrarSena !== null && (
          <Button
            variant="solid"
            size="md"
            onClick={() => (conCreditos ? pedirCreditos({ tipo: "cobrarSena", medio }) : onAccion({ tipo: "cobrarSena", medio }))}
          >
            Cobrar la seña {pesos(cierres.cobrarSena)}
          </Button>
        )}
        {cierres.cobrarTodo !== null && !conCreditos && (
          <Button variant={cierres.cobrarSena !== null ? "outline" : "solid"} size="md" onClick={() => onAccion({ tipo: "cobrarTodo", medio: medioCaja })}>
            {textoCierre("cobrarTodo", cierres.cobrarTodo)}
          </Button>
        )}
        {cierres.cerrarCancha && (
          <Button variant="solid" size="md" onClick={() => onAccion({ tipo: "cerrarCancha" })}>
            Cerrar la cancha
          </Button>
        )}
        {cierres.abrirCancha && (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "abrirCancha" })}>
            Abrir la cancha
          </Button>
        )}
        {cierres.cerrarYSeguir !== null && !conCreditos && (
          <Button variant="outline" size="md" className="h-auto! min-h-11 whitespace-normal! py-2" onClick={() => onAccion({ tipo: "cerrarYSeguir", medio: medioCaja })}>
            {textoCierre("cerrarYSeguir", cierres.cerrarYSeguir)}
          </Button>
        )}
        {cierres.cerrarCargos !== null && !conCreditos && (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "cerrarCargos", medio: medioCaja })}>
            {textoCierre("cerrarCargos", cierres.cerrarCargos)}
          </Button>
        )}
        {cierres.cargosACuenta && (
          <Button variant="outline" size="md" onClick={() => onAccion({ tipo: "cargosACuenta" })}>
            Cargos a cuenta corriente
          </Button>
        )}
      </div>
      {conCreditos && <p className="text-sm text-muted">Con créditos se cobra jugador por jugador (o la seña): elegí a quién.</p>}
      {cierres.cerrarYSeguir !== null && !conCreditos && (
        <p className="text-sm text-muted">
          «La mesa sigue»: se cobra la cancha y queda libre para el turno siguiente. Los cargos siguen abiertos y se cobran cuando se van.
        </p>
      )}
      <ul aria-label="Jugadores del turno">
        {vista.jugadores.map((f) => (
          <FilaDeJugador key={f.idx} almacen={almacen} fila={f} reservaId={vista.reservaId} onCobrar={onCobrar} onCobrarParte={onCobrarParte} onAccion={onAccion} />
        ))}
      </ul>
      {vista.deOtraMesa && <p className="text-sm text-muted">{vista.deOtraMesa}</p>}

      {vista.cancha && (
        <CobroDeLaCancha
          key={`${vista.cancha.saldo}-${vista.cancha.sugerido}`}
          cancha={vista.cancha}
          titular={vista.titular}
          onCobrar={onCobrarCancha}
          onACuenta={() => onAccion({ tipo: "canchaACuenta" })}
        />
      )}
      {vista.sumarJugador && <SumarJugador almacen={almacen} reservaId={vista.reservaId} onAccion={onAccion} />}
      {vista.sumarCargo && <SumarCargo almacen={almacen} vista={vista} medio={medio} onAccion={onAccion} />}
      <CicloDelTurno
        almacen={almacen}
        reservaId={vista.reservaId}
        onAntes={() => setConfirmando(null)}
        onListo={() => {
          // Si el turno salió de la grilla (cancelado, no vino), la cuenta ya no tiene nada que mostrar.
          if (!armarCuenta(almacen.estado(), reservaId)) onVolver();
        }}
      />
    </section>
  );
}
