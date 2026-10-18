"use client";

// ============================================================================
// MESA COMPLEJA — repartir los cargos de una cuenta y cargar a mano (con descuento firmado por el dueño).
// ============================================================================
//
// La `mesaCompleja` del club vanilla, dentro de cada cuenta del buffet (plegada: se usa poco):
//   · «Pasar un cargo a otra cuenta»: qué cargo, cuántos (vacío = todos) y a la cuenta de quién;
//   · «Cargo manual»: concepto, cargo o descuento, monto y, para un descuento, el PIN del dueño. El PIN lo valida el
//     motor (buffet-mesa-core.ts); la pantalla no lo deja escrito después de probarlo. En la DEMO se muestran los PIN
//     de ejemplo de los dueños, rotulados: en la jornada real no existen acá.
// Lo que pasa lo dice la barra de avisos del club (con «Deshacer»).

import { useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Field";
import { pesos } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import type { VistaCuentaBuffet } from "./buffet-core";
import {
  DESHACIBLE_MESA,
  claveDeIntentosDePin,
  descuentoConTope,
  ejecutarMesa,
  guardaDeIntentos,
  pinesDeEjemplo,
  type AccionMesa,
  type DesenlaceMesa,
  type GuardaDeIntentos,
} from "./buffet-mesa-core";
import { leerMonto } from "./montos-core";

// Los intentos de PIN son del mostrador, no de la tarjeta: cerrar y abrir la cuenta no los borra, y con el negocio
// quedan guardados en el equipo (recargar tampoco). Sin negocio o sin almacenamiento, en memoria.
const guardas = new WeakMap<Almacen, GuardaDeIntentos>();
function guardaDe(almacen: Almacen, negocio: string | undefined): GuardaDeIntentos {
  let g = guardas.get(almacen);
  if (!g) {
    let almacenamiento: Storage | null = null;
    try {
      almacenamiento = typeof window !== "undefined" ? window.localStorage : null;
    } catch {
      almacenamiento = null;
    }
    g = guardaDeIntentos(almacenamiento, negocio?.trim() ? claveDeIntentosDePin(negocio) : null);
    guardas.set(almacen, g);
  }
  return g;
}

function correr(almacen: Almacen, accion: AccionMesa): DesenlaceMesa {
  let d: DesenlaceMesa = { ok: false, mensaje: "", pin: null };
  almacen.ejecutar(
    (e, ahora, auth) => {
      d = ejecutarMesa(e, accion, ahora, auth);
      return d;
    },
    { deshacible: DESHACIBLE_MESA[accion.tipo] },
  );
  return d;
}

function PasarCargo({ almacen, cuenta }: { almacen: Almacen; cuenta: VistaCuentaBuffet }) {
  const items = cuenta.items.filter((i) => i.transferible);
  const [item, setItem] = useState("");
  const [cant, setCant] = useState("");
  const [destino, setDestino] = useState("");
  const ids = { item: useId(), cant: useId(), destino: useId() };
  if (!items.length) return null;
  if (!cuenta.destinos.length) {
    return <p className="text-sm text-muted">Para pasar un cargo hace falta otra cuenta abierta: abrí la de la otra persona en «Abrir una cuenta» y volvé.</p>;
  }
  const elegido = items.find((i) => String(i.idx) === item) ?? items[0];
  const aCuenta = cuenta.destinos.some((x) => x.id === destino) ? destino : cuenta.destinos[0].id;
  const n = cant.trim() ? Math.round(Number(cant)) : null;
  return (
    <form
      aria-label={`Pasar un cargo de ${cuenta.titular} a otra cuenta`}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (correr(almacen, { tipo: "pasarCargo", cuentaId: cuenta.id, itemIdx: elegido.idx, aCuentaId: aCuenta, cant: n }).ok) {
          setItem("");
          setCant("");
        }
      }}
    >
      <h4 className="text-sm font-semibold text-strong">Pasar un cargo a otra cuenta</h4>
      <Field label="Cargo" htmlFor={ids.item}>
        <Select id={ids.item} value={String(elegido.idx)} onChange={(e) => setItem(e.target.value)}>
          {items.map((i) => (
            <option key={i.idx} value={i.idx}>
              {i.cant} × {i.nombre} · {pesos(i.importe)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-[6rem_1fr] gap-2">
        <Field label="Cuántos" htmlFor={ids.cant}>
          <Input id={ids.cant} inputMode="numeric" autoComplete="off" placeholder="Todos" value={cant} onChange={(e) => setCant(e.target.value)} />
        </Field>
        <Field label="A la cuenta de" htmlFor={ids.destino}>
          <Select id={ids.destino} value={aCuenta} onChange={(e) => setDestino(e.target.value)}>
            {cuenta.destinos.map((x) => (
              <option key={x.id} value={x.id}>
                {x.titular}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Button type="submit" variant="outline" size="md">
        Pasar el cargo
      </Button>
      <p className="text-xs text-muted">«Cuántos» vacío pasa el cargo entero. Cada uno paga lo suyo, como quieran repartirlo.</p>
    </form>
  );
}

function CargoManual({ almacen, cuenta, negocio }: { almacen: Almacen; cuenta: VistaCuentaBuffet; negocio?: string }) {
  const [concepto, setConcepto] = useState("");
  const [tipo, setTipo] = useState<"cargo" | "descuento">("cargo");
  const [monto, setMonto] = useState("");
  const [pin, setPin] = useState("");
  const ids = { concepto: useId(), tipo: useId(), monto: useId(), pin: useId() };
  const descuento = tipo === "descuento";
  const demo = descuento && almacen.modo() === "demo" ? pinesDeEjemplo(almacen.estado()) : [];
  return (
    <form
      aria-label={`Cargo manual a ${cuenta.titular}`}
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const accion: AccionMesa = { tipo: "cargoManual", cuentaId: cuenta.id, concepto, monto: leerMonto(monto), descuento, pin };
        let d: DesenlaceMesa;
        if (descuento) {
          const r = descuentoConTope(guardaDe(almacen, negocio), Date.now(), () => correr(almacen, accion));
          if (r.trabado) almacen.informar(r.desenlace);
          d = r.desenlace;
        } else {
          d = correr(almacen, accion);
        }
        // El PIN no queda escrito después de probarlo, salga bien o mal.
        setPin("");
        if (d.ok) {
          setConcepto("");
          setMonto("");
        }
      }}
    >
      <h4 className="text-sm font-semibold text-strong">Cargo manual (excepción)</h4>
      <Field label="Concepto" htmlFor={ids.concepto}>
        <Input id={ids.concepto} maxLength={60} autoComplete="off" placeholder="Ej.: torta de cumpleaños" value={concepto} onChange={(e) => setConcepto(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Tipo" htmlFor={ids.tipo}>
          <Select id={ids.tipo} value={tipo} onChange={(e) => setTipo(e.target.value === "descuento" ? "descuento" : "cargo")}>
            <option value="cargo">Cargo</option>
            <option value="descuento">Descuento</option>
          </Select>
        </Field>
        <Field label="Monto" htmlFor={ids.monto}>
          <Input id={ids.monto} importe inputMode="numeric" autoComplete="off" placeholder="$" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </Field>
      </div>
      {descuento && (
        <Field label="PIN del dueño" htmlFor={ids.pin} hint="Un descuento lo autoriza un dueño con su PIN, aunque cargue recepción.">
          <Input id={ids.pin} type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value)} />
        </Field>
      )}
      {demo.length > 0 && (
        <p className="rounded-md bg-surface-sunken p-2 text-xs text-body">
          <span className="font-semibold text-strong">Sólo en la demo:</span> PIN de ejemplo de los dueños: {demo.map((u) => `${u.nombre} ${u.pin}`).join(" · ")}. En la jornada real cada dueño tiene el suyo y no se muestra.
        </p>
      )}
      <Button type="submit" variant="outline" size="md" disabled={!concepto.trim() || !monto.trim()}>
        {descuento ? "Aplicar el descuento" : "Sumar el cargo"}
      </Button>
    </form>
  );
}

/** `negocio`: para guardar los intentos de PIN en el equipo por negocio (sin él, quedan en memoria). */
export default function MesaCompleja({ almacen, cuenta, negocio }: { almacen: Almacen; cuenta: VistaCuentaBuffet; negocio?: string }) {
  return (
    <details className="rounded-md border border-line">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
        Mesa compleja: repartir o cargar a mano
      </summary>
      <div className="flex flex-col gap-4 border-t border-line p-3">
        <PasarCargo almacen={almacen} cuenta={cuenta} />
        <CargoManual almacen={almacen} cuenta={cuenta} negocio={negocio} />
      </div>
    </details>
  );
}
