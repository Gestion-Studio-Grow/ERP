"use client";

// ============================================================================
// LA CAJA DE 12 A 12 — cuánto hay, el fondo, los movimientos, los egresos y el cierre con lo contado.
// ============================================================================
//
// Arriba, en rojo, si quedó una caja con movimientos sin cerrar (la de la mañana, la de ayer): se cierra desde
// ahí con lo contado. Después, la caja de hoy: el efectivo que tiene que haber en el cajón (el fondo más lo
// cobrado en efectivo menos los egresos y lo devuelto en mano), lo cobrado por medio, el fondo (lo ajusta un dueño)
// y TODOS los movimientos de esta caja, de a 40. Abajo, anotar un egreso (con concepto) y cerrar la caja. Una caja
// se cierra una sola vez; lo cobrado después entra en la siguiente. Los créditos de los clientes no entran a la caja.
//
// Egreso y cierre piden el PIN de quien opera, como el club vanilla: la sesión del ERP es el puesto, el PIN es la
// persona. Lo valida el motor (permiso + PIN); la pantalla sólo lo pide, no lo muestra y lo borra después de cada
// intento. En la demo, los PIN de ejemplo están a la vista, rotulados.

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { pesos } from "@/lib/club/motor.mjs";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { MOVIMIENTOS_POR_PAGINA, armarCaja, pinesDeEjemplo, puedeAjustarFondo, type AccionCaja, type CierreDeHoy, type VistaCaja } from "./caja-core";
import { conTopeDePin, guardaDelPin } from "./tope-de-pin";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";
import { operadorActual } from "./operador-del-club";
import { permisosProveedores } from "./proveedores-core";
import { RegistrarRemito } from "./remito-del-club";
import "./piel/caja.css";

const ddmm = (d: string) => `${Number(d.slice(8))}/${Number(d.slice(5, 7))}`;

/** El PIN: numérico, sin mostrarse, sin autocompletar. */
function CampoPin({ id, quien, value, onChange }: { id: string; quien: string | null; value: string; onChange: (pin: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-strong">
        {quien ? `PIN de ${quien}` : "Tu PIN"}
      </label>
      <Input id={id} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="sm:w-28" />
    </div>
  );
}

/** El nombre de pila de quien opera (para «PIN de Lu»), por su propio canal. */
function useQuienOpera(almacen: Almacen): string | null {
  const operador = useOperador(almacen);
  return operador ? operador.usuario.nombre.split(" ")[0] : null;
}

function CerrarCaja({ almacen, etiqueta, boton, esperado, onCerrar }: { almacen: Almacen; etiqueta: string; boton: string; esperado: number; onCerrar: (contado: string, pin: string) => boolean }) {
  const [contado, setContado] = useState("");
  const [pin, setPin] = useState("");
  const quien = useQuienOpera(almacen);
  const ids = { contado: useId(), pin: useId(), ayuda: useId() };
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (onCerrar(contado, pin)) setContado("");
        setPin("");
      }}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
        <div className="flex flex-col gap-1">
          <label htmlFor={ids.contado} className="text-sm font-medium text-strong">
            {etiqueta}
          </label>
          <Input id={ids.contado} inputMode="numeric" importe value={contado} autoComplete="off" aria-describedby={ids.ayuda} onChange={(e) => setContado(e.target.value)} />
        </div>
        <CampoPin id={ids.pin} quien={quien} value={pin} onChange={setPin} />
      </div>
      {/* text-body: este formulario va también sobre fondos de aviso, donde text-muted no llega a 4,5:1. */}
      <p id={ids.ayuda} className="text-sm text-body">
        Tendría que haber {pesos(esperado)} en efectivo (con el fondo).
      </p>
      <Button type="submit" variant="solid" size="md">
        {boton}
      </Button>
    </form>
  );
}

/** Las cajas que quedaron con movimientos sin cerrar: el aviso en rojo y UN formulario para cerrar la que se elija. */
function CajasAtrasadas({ almacen, atrasadas, hacer }: { almacen: Almacen; atrasadas: VistaCaja["atrasadas"]; hacer: (a: AccionCaja) => boolean }) {
  const [dia, setDia] = useState(atrasadas[0].dia);
  const id = useId();
  const elegida = atrasadas.find((a) => a.dia === dia) ?? atrasadas[0];
  return (
    <section aria-labelledby={`${id}-t`} className="flex flex-col gap-3 rounded-lg border border-danger/40 bg-danger-soft p-3">
      <h2 id={`${id}-t`} role="alert" className="font-semibold text-danger">
        {atrasadas.length === 1 ? elegida.texto : `Quedaron ${atrasadas.length} cajas sin cerrar: ${atrasadas.map((a) => ddmm(a.dia)).join(", ")}.`}
      </h2>
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          Caja para cerrar
        </label>
        <Select id={id} value={elegida.dia} onChange={(e) => setDia(e.target.value)}>
          {atrasadas.map((a) => (
            <option key={a.dia} value={a.dia}>
              Caja del {ddmm(a.dia)} · tendría que haber {pesos(a.efectivoEsperado)} en efectivo
            </option>
          ))}
        </Select>
      </div>
      <CerrarCaja
        key={elegida.dia}
        almacen={almacen}
        etiqueta={`Efectivo contado de la caja del ${ddmm(elegida.dia)}`}
        boton="Cerrar esa caja"
        esperado={elegida.efectivoEsperado}
        onCerrar={(contado, pin) => hacer({ tipo: "cerrar", contado, dia: elegida.dia, pin })}
      />
    </section>
  );
}

/** Quién opera y, en la demo, los PIN de ejemplo (rotulados: en el club cada uno tiene el suyo). */
function OperaComo({ almacen }: { almacen: Almacen }) {
  const operador = useOperador(almacen);
  const demo = almacen.modo() === "demo";
  return (
    <div className="flex flex-col gap-1 text-sm text-muted">
      <p>
        {operador
          ? `Operás como ${operador.usuario.nombre}. El egreso y el cierre piden tu PIN y quedan a tu nombre.`
          : "Todavía no entró nadie a operar: el egreso y el cierre de caja piden quién los hace y su PIN."}
      </p>
      {demo && (
        <details>
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">¿Probando la demo? Ver los PIN de ejemplo</summary>
          <p className="tabular-nums text-body">
            {pinesDeEjemplo(almacen.estado())}. Son de ejemplo, sólo de la demo: en el club cada uno tiene el suyo.
          </p>
        </details>
      )}
    </div>
  );
}

/** El fondo de caja (el cambio del cajón): lo ajusta quien puede configurar, un dueño. */
function FondoDeCaja({ almacen, fondo, hacer }: { almacen: Almacen; fondo: number; hacer: (a: AccionCaja) => boolean }) {
  const operador = useOperador(almacen);
  const [monto, setMonto] = useState(String(fondo));
  const id = useId();
  if (!puedeAjustarFondo(almacen.estado(), operador?.usuario.id)) return null;
  return (
    <form
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        hacer({ tipo: "fondo", monto });
      }}
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={id} className="text-sm font-medium text-strong">
          Fondo de caja (cambio en el cajón)
        </label>
        <Input id={id} inputMode="numeric" importe value={monto} autoComplete="off" onChange={(e) => setMonto(e.target.value)} className="sm:w-40" />
      </div>
      <Button type="submit" variant="outline" size="md">
        Guardar el fondo
      </Button>
    </form>
  );
}

function Movimientos({ v, onMas }: { v: VistaCaja; onMas: () => void }) {
  const faltan = v.totalMovimientos - v.movimientos.length;
  return (
    <section aria-labelledby="club-caja-movs" data-caja="movimientos" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id="club-caja-movs" className="font-semibold text-strong">
        Movimientos ({v.totalMovimientos})
      </h2>
      {v.totalMovimientos === 0 ? (
        <p className="text-sm text-muted">Todavía no entró ni salió nada en esta caja.</p>
      ) : (
        <table className="w-full text-sm tabular-nums">
          <thead>
            <tr className="border-b border-line text-left text-xs text-muted">
              <th scope="col" className="py-1.5 pr-2 font-medium">
                Hora
              </th>
              <th scope="col" className="py-1.5 pr-2 font-medium">
                Concepto
              </th>
              <th scope="col" className="py-1.5 pr-2 text-right font-medium">
                Ingreso
              </th>
              <th scope="col" className="py-1.5 text-right font-medium">
                Egreso
              </th>
            </tr>
          </thead>
          <tbody>
            {v.movimientos.map((m) => (
              <tr key={m.id} className="border-b border-line align-top last:border-b-0">
                <td className="py-1.5 pr-2 whitespace-nowrap text-muted">{m.hora}</td>
                <td className="min-w-0 py-1.5 pr-2 break-words">
                  <span className="text-strong">{m.concepto}</span>
                  <span className="block text-xs text-muted">
                    {m.medio}
                    {m.quien ? ` · ${m.quien}` : ""}
                  </span>
                </td>
                <td className="py-1.5 pr-2 text-right whitespace-nowrap text-strong">{m.tipo === "ingreso" ? pesos(m.monto) : ""}</td>
                <td className="py-1.5 text-right whitespace-nowrap text-danger">{m.tipo === "egreso" ? pesos(m.monto) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {faltan > 0 && (
        <Button variant="ghost" size="md" onClick={onMas}>
          Ver {Math.min(faltan, MOVIMIENTOS_POR_PAGINA)} movimientos más (quedan {faltan})
        </Button>
      )}
    </section>
  );
}

function Egreso({ almacen, hacer }: { almacen: Almacen; hacer: (a: AccionCaja) => boolean }) {
  const [monto, setMonto] = useState("");
  const [concepto, setConcepto] = useState("");
  const [pin, setPin] = useState("");
  const quien = useQuienOpera(almacen);
  const ids = { monto: useId(), concepto: useId(), pin: useId() };
  return (
    <section aria-labelledby="club-egreso" data-caja="egreso" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id="club-egreso" className="font-semibold text-strong">
        Anotar un egreso en efectivo
      </h2>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (hacer({ tipo: "egreso", monto, concepto, pin })) {
            setMonto("");
            setConcepto("");
          }
          setPin("");
        }}
      >
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[8rem_1fr]">
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.monto} className="text-sm font-medium text-strong">
              Monto
            </label>
            <Input id={ids.monto} inputMode="numeric" importe value={monto} autoComplete="off" onChange={(e) => setMonto(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor={ids.concepto} className="text-sm font-medium text-strong">
              Concepto (para qué salió la plata)
            </label>
            <Input id={ids.concepto} value={concepto} autoComplete="off" placeholder="Ej.: hielo, artículos de limpieza" onChange={(e) => setConcepto(e.target.value)} />
          </div>
        </div>
        <CampoPin id={ids.pin} quien={quien} value={pin} onChange={setPin} />
        <Button type="submit" variant="outline" size="md">
          Anotar el egreso
        </Button>
      </form>
    </section>
  );
}

/** Cómo dio un cierre: «cuadra», «sobran $ X» o «faltan $ X». */
const resultadoDelCierre = (diferencia: number) => (diferencia === 0 ? "cuadra" : `${diferencia > 0 ? "sobran" : "faltan"} ${pesos(Math.abs(diferencia))}`);

/** El estado del corte en una plaqueta: color y palabra (nunca sólo el color). */
const ESTADO_DEL_CORTE: Record<CierreDeHoy["tipo"], { texto: string; clase: string }> = {
  abierta: { texto: "Abierta", clase: "border-accent bg-accent-soft text-accent-ink" },
  siguiente: { texto: "Hoy ya cerró", clase: "border-warning bg-warning-soft text-warning" },
  cerrada: { texto: "Cerrada", clase: "border-success bg-success-soft text-success" },
};

/** El corte de la caja de hoy, en la tarjeta: si está abierta o cerrada y cómo dio el último cierre. */
function CorteDeHoy({ cierre, ultimo }: { cierre: CierreDeHoy; ultimo: VistaCaja["cierres"][number] | undefined }) {
  const estado = ESTADO_DEL_CORTE[cierre.tipo];
  return (
    <div data-caja="corte" className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold text-strong">Corte de la caja</h3>
      <p className="flex flex-wrap items-center gap-2 text-sm text-body">
        <span data-caja="estado" data-estado={cierre.tipo} className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold", estado.clase)}>
          {estado.texto}
        </span>
        {cierre.tipo === "abierta" ? "Se cierra una sola vez, con el efectivo contado." : cierre.tipo === "siguiente" ? `Lo cobrado después va a la caja del ${ddmm(cierre.dia)}.` : "Lo que se cobre ahora entra en la caja siguiente."}
      </p>
      {ultimo && (
        <p className="text-sm text-body tabular-nums">
          Último cierre, caja del {ddmm(ultimo.dia)}: <span className={cn("font-semibold", ultimo.diferencia === 0 ? "text-success" : "text-danger")}>{resultadoDelCierre(ultimo.diferencia)}</span>
        </p>
      )}
    </div>
  );
}

function CierreDeLaCaja({ almacen, cierre, esperado, hacer }: { almacen: Almacen; cierre: CierreDeHoy; esperado: number; hacer: (a: AccionCaja) => boolean }) {
  return (
    <section aria-labelledby="club-cierre" data-caja="cierre" className="flex flex-col gap-2 rounded-lg border border-line bg-surface-raised p-4">
      <h2 id="club-cierre" className="font-semibold text-strong">
        Cerrar la caja
      </h2>
      {cierre.tipo === "cerrada" ? (
        <p className="text-sm text-strong">{cierre.texto}</p>
      ) : (
        <>
          <p className="text-sm text-muted">
            {cierre.tipo === "siguiente" ? cierre.texto : "Contá el efectivo del cajón (con el fondo); lo digital ya está registrado. Se cierra una sola vez; lo que se cobre después va a la caja siguiente."}
          </p>
          <CerrarCaja
            almacen={almacen}
            etiqueta="Efectivo contado"
            boton="Cerrar la caja"
            esperado={esperado}
            onCerrar={(contado, pin) => hacer({ tipo: "cerrar", contado, dia: cierre.tipo === "siguiente" ? cierre.dia : null, pin })}
          />
        </>
      )}
    </section>
  );
}

/**
 * Registrar un remito desde la caja, como el vanilla: recepción recibe la mercadería en el mostrador. Deudas y pagos a
 * proveedores siguen en la solapa Proveedores (sólo dueños). El permiso lo da el motor (`remito`).
 */
function RemitoDesdeLaCaja({ almacen }: { almacen: Almacen }) {
  useOperador(almacen); // repinta si cambia quién opera (PIN)
  const [abierto, setAbierto] = useState(false);
  const puede = permisosProveedores(almacen.estado(), operadorActual(almacen).usuario?.id).remito;
  return (
    <details className="rounded-lg border border-line" open={abierto} onToggle={(e) => setAbierto((e.currentTarget as HTMLDetailsElement).open)}>
      <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-semibold text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Registrar un remito
      </summary>
      <div className="border-t border-line p-4">
        {!abierto ? null : puede ? (
          <RegistrarRemito almacen={almacen} enfocar={false} onListo={() => setAbierto(false)} onCerrar={() => setAbierto(false)} />
        ) : (
          <p className="text-sm text-body">Para cargar un remito tiene que operar alguien con permiso: entrá con tu PIN.</p>
        )}
      </div>
    </details>
  );
}

/** `negocio`: los PIN mal de la caja suman al tope del bloqueo de este equipo (tope-de-pin.ts). */
export default function CajaDelClub({ almacen, negocio }: { almacen: Almacen; negocio?: string }) {
  const [cuantos, setCuantos] = useState(MOVIMIENTOS_POR_PAGINA);
  const seleccionar = useCallback((e: EstadoClub, a: Ahora) => armarCaja(e, a, cuantos), [cuantos]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  // Egreso, cierre y fondo NO se deshacen (como en vanilla: lo que pide PIN no tiene «Deshacer»).
  // El PIN de egreso y cierre pasa por el tope compartido del equipo: trabado, no se prueba (y el aviso dice cuánto
  // esperar). El fondo no lleva PIN: no se traba.
  const hacer = useCallback(
    (a: AccionCaja) =>
      // Por comando (re-aplicable en otro puesto); el tope de PIN cuenta sólo el toque, no las re-aplicaciones.
      almacen.comando("caja", [a], a.tipo === "fondo" ? {} : { envolver: (correr) => conTopeDePin(guardaDelPin(almacen, negocio), Date.now(), correr).desenlace }).ok,
    [almacen, negocio],
  );

  return (
    <div className="flex flex-col gap-4">
      <OperaComo almacen={almacen} />
      {v.atrasadas.length > 0 && <CajasAtrasadas almacen={almacen} atrasadas={v.atrasadas} hacer={hacer} />}

      {/* La caja de hoy, la tarjeta «chapa» del club: el efectivo del cajón, lo cobrado por medio, los egresos y el
          corte. La piel de Break Point está en piel/caja.css (ganchos data-caja); sin estética, la del ERP. */}
      <section aria-labelledby="club-caja-hoy" data-pantalla-tarjeta data-caja="hoy" className="flex flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4">
        <div data-caja="cabecera">
          <h2 id="club-caja-hoy" data-pantalla className="text-lg font-semibold text-strong">
            {v.titulo}
          </h2>
        </div>
        <dl data-caja="numeros" className="grid grid-cols-2 gap-3 tabular-nums sm:grid-cols-4">
          <div data-caja="cajon" className="col-span-2 rounded-md bg-surface-sunken p-3 sm:col-span-1">
            {/* text-body: sobre el fondo hundido, text-muted no llega a 4,5:1. */}
            <dt className="text-xs text-body">Efectivo en el cajón</dt>
            <dd className="text-xl font-bold text-strong">{pesos(v.efectivoEsperado)}</dd>
          </div>
          <div className="p-3">
            <dt className="text-xs text-muted">Fondo</dt>
            <dd className="font-semibold text-strong">{pesos(v.fondo)}</dd>
          </div>
          <div data-signo="ingreso" className="p-3">
            <dt className="text-xs text-muted">Ingresos</dt>
            <dd className="font-semibold text-strong">{pesos(v.ingresos)}</dd>
          </div>
          <div data-signo="egreso" className="p-3">
            <dt className="text-xs text-muted">Egresos</dt>
            <dd className="font-semibold text-strong">{pesos(v.egresos)}</dd>
          </div>
        </dl>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div data-caja="medios" className="flex min-w-0 flex-col gap-1">
            <h3 id="club-caja-medios" className="text-sm font-semibold text-strong">
              Ingresos por medio de pago
            </h3>
            <dl aria-labelledby="club-caja-medios" className="grid grid-cols-1 gap-x-4 text-sm tabular-nums sm:grid-cols-2">
              {v.porMedio.map((m) => (
                <div key={m.medio} className="flex justify-between gap-2 border-b border-line py-1">
                  <dt className="text-muted">{m.medio}</dt>
                  <dd className="text-strong">{pesos(m.monto)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <CorteDeHoy cierre={v.cierreDeHoy} ultimo={v.cierres[0]} />
        </div>
        <FondoDeCaja key={v.fondo} almacen={almacen} fondo={v.fondo} hacer={hacer} />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Egreso almacen={almacen} hacer={hacer} />
        <CierreDeLaCaja almacen={almacen} cierre={v.cierreDeHoy} esperado={v.efectivoEsperado} hacer={hacer} />
      </div>

      <RemitoDesdeLaCaja almacen={almacen} />

      <Movimientos v={v} onMas={() => setCuantos((n) => n + MOVIMIENTOS_POR_PAGINA)} />

      {v.cierres.length > 0 && (
        <section aria-labelledby="club-cierres" className="flex flex-col gap-1">
          <h2 id="club-cierres" className="font-semibold text-strong">
            Cierres
          </h2>
          <ul className="text-sm tabular-nums">
            {v.cierres.map((c) => (
              <li key={c.dia} className="flex justify-between gap-2 border-b border-line py-1.5">
                <span className={cn("min-w-0 truncate text-muted")}>{c.texto}</span>
                <span className={cn("shrink-0 font-semibold", c.diferencia === 0 ? "text-success" : "text-danger")}>
                  {resultadoDelCierre(c.diferencia)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
