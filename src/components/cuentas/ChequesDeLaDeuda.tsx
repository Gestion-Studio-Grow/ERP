"use client";

import { useRef, useState } from "react";
import { AvisoError, Input, buttonClasses, fmtMoneyARS } from "@/components/ui";
import { ETIQUETA_CHEQUE, pasosDelCheque, type ChequeStatus, type PasoDeCheque } from "@/lib/debts/cheque";
import { leerImporte } from "@/lib/pos-peso";
import type { EstadoFormularioCuenta } from "@/lib/debts/formularios";
import { useAccionDirecta, type AccionDeCuenta } from "./useAccionDirecta";

// LOS CHEQUES PROPIOS de una deuda con un proveedor: cargarlos y seguirlos hasta que el banco
// los debita. `addChequeToPayable` y `transitionCheque` existían sin pantalla: la dueña que
// pagaba con cheque no tenía dónde anotarlo, y el flujo de fondos no sabía cuándo salía esa
// plata.
//
// Lo que no tiene vuelta atrás (debitado, rebotado, anulado) pide confirmar en el lugar, con
// lo que va a pasar dicho antes. Entregar el cheque es de todos los días: un toque.

export interface ChequeVista {
  id: string;
  numero: string;
  banco: string;
  monto: number;
  /** "31/10/2026": el día que se puede cobrar. */
  fecha: string;
  estado: ChequeStatus;
}

export type AccionCheque = AccionDeCuenta;

const TONO: Record<ChequeStatus, string> = {
  PENDING: "bg-surface-sunken text-body",
  DELIVERED: "bg-warning-soft text-warning",
  CLEARED: "bg-success-soft text-success",
  BOUNCED: "bg-danger-soft text-danger",
  CANCELED: "bg-surface-sunken text-muted",
};

function Resultado({ estado, que }: { estado: EstadoFormularioCuenta; que: string }) {
  if (estado.estado === "ok") {
    return (
      <p role="status" className="rounded-md bg-success-soft px-3 py-2 text-sm text-success">
        {estado.mensaje}
      </p>
    );
  }
  if (estado.estado === "error") return <AvisoError titulo={que} comoSeguir={estado.mensaje} />;
  return null;
}

/** Los botones de un cheque. El paso sin vuelta atrás se confirma en el lugar. */
function PasosDelCheque({ cuentaId, cheque, enviar, pendiente, asientaEnLibro }: {
  cuentaId: string;
  cheque: ChequeVista;
  enviar: (fd: FormData) => void;
  pendiente: boolean;
  asientaEnLibro: boolean;
}) {
  const [aConfirmar, setAConfirmar] = useState<PasoDeCheque | null>(null);
  const pasos = pasosDelCheque(cheque.estado);
  if (pasos.length === 0) return null;
  const mandar = (a: ChequeStatus) => {
    const fd = new FormData();
    fd.set("id", cuentaId);
    fd.set("chequeId", cheque.id);
    fd.set("a", a);
    enviar(fd);
  };
  if (aConfirmar) {
    const texto =
      aConfirmar.a === "CLEARED" && !asientaEnLibro
        ? "Se registra el pago de la deuda por el monto del cheque. Todavía no pasa solo al libro de caja: anotalo también en el libro."
        : aConfirmar.confirmar;
    return (
      <div className="mt-3 space-y-2 rounded-md border border-line bg-surface-sunken p-3">
        <p className="text-sm text-body">
          <span className="font-medium text-strong">{aConfirmar.boton}:</span> {texto}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pendiente} onClick={() => mandar(aConfirmar.a)} className={buttonClasses("solid", "md")}>
            {pendiente ? "Guardando…" : `Sí, ${aConfirmar.boton.toLowerCase()}`}
          </button>
          <button type="button" onClick={() => setAConfirmar(null)} className={buttonClasses("outline", "md")}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {pasos.map((p) =>
        p.confirmar ? (
          <button key={p.a} type="button" onClick={() => setAConfirmar(p)} className={buttonClasses("outline", "md")}>
            {p.boton}
          </button>
        ) : (
          <button key={p.a} type="button" disabled={pendiente} onClick={() => mandar(p.a)} className={buttonClasses("solid", "md")}>
            {p.boton}
          </button>
        ),
      )}
    </div>
  );
}

export function ChequesDeLaDeuda({
  cuentaId,
  cheques,
  libre,
  agregar,
  cambiarEstado,
  asientaEnLibro,
}: {
  cuentaId: string;
  cheques: ChequeVista[];
  /** Lo que todavía no cubre ningún cheque sin debitar. */
  libre: number;
  agregar: AccionCheque;
  cambiarEstado: AccionCheque;
  asientaEnLibro: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [monto, setMonto] = useState("");
  const formRef = useRef<HTMLFormElement>(null);
  const paso = useAccionDirecta(cambiarEstado);
  // Cargado: el formulario se cierra y queda limpio; si el servidor rechaza, lo cargado queda.
  const alta = useAccionDirecta(agregar, () => {
    setMonto("");
    setAbierto(false);
    formRef.current?.reset();
  });
  const lectura = leerImporte(monto);
  const montoOk = lectura.estado === "ok" && lectura.valor > 0;

  return (
    <section aria-labelledby="cheques-titulo" className="space-y-3">
      <div>
        <h3 id="cheques-titulo" className="font-medium text-strong">Cheques propios</h3>
        <p className="text-sm text-muted">
          Los cheques que le diste (o le vas a dar) al proveedor. La deuda baja cuando el banco los debita, no antes.
        </p>
      </div>

      <Resultado estado={paso.estado} que="No se pudo cambiar el cheque" />
      <Resultado estado={alta.estado} que="No se cargó el cheque" />

      {cheques.length > 0 && (
        <ul className="space-y-2">
          {cheques.map((ch) => (
            <li key={ch.id} className="rounded-lg border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="font-medium text-strong">
                  N° {ch.numero} · {ch.banco}
                </p>
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONO[ch.estado]}`}>{ETIQUETA_CHEQUE[ch.estado]}</span>
              </div>
              <p className="mt-1 text-sm text-body">
                <span className="tabular-nums font-medium">{fmtMoneyARS(ch.monto)}</span> · se puede cobrar el {ch.fecha}
              </p>
              {/* La clave con el estado: cuando el cheque cambia, la confirmación abierta se cierra. */}
              <PasosDelCheque
                key={ch.estado}
                cuentaId={cuentaId}
                cheque={ch}
                enviar={paso.enviar}
                pendiente={paso.pendiente}
                asientaEnLibro={asientaEnLibro}
              />
            </li>
          ))}
        </ul>
      )}

      {libre > 0 ? (
        abierto ? (
          <form
            ref={formRef}
            onSubmit={(e) => {
              e.preventDefault();
              if (!montoOk || alta.pendiente) return;
              alta.enviar(new FormData(e.currentTarget));
            }}
            className="space-y-3 rounded-lg border border-line p-4"
          >
            <p className="text-sm font-medium text-strong">Cargar un cheque</p>
            <p className="text-xs text-muted">Puede cubrir hasta {fmtMoneyARS(libre)} (lo que falta pagar y no cubre otro cheque).</p>
            <input type="hidden" name="id" value={cuentaId} />
            <input type="hidden" name="monto" value={montoOk && lectura.estado === "ok" ? String(lectura.valor) : ""} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">
                <span className="mb-1 block text-muted">Número</span>
                <Input name="numero" required inputMode="numeric" autoComplete="off" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Banco</span>
                <Input name="banco" required autoComplete="off" />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Se puede cobrar el</span>
                <Input name="fecha" type="date" required />
              </label>
              <label className="text-sm">
                <span className="mb-1 block text-muted">Monto</span>
                <Input
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0,00"
                  className="text-right tabular-nums"
                  aria-invalid={monto.trim() !== "" && !montoOk}
                />
              </label>
            </div>
            <label className="flex min-h-11 items-center gap-3 text-sm text-body">
              <input type="checkbox" name="entregado" value="1" className="size-5" />
              Ya se lo entregué al proveedor
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setAbierto(false)} className={buttonClasses("outline", "md")}>
                Cancelar
              </button>
              <button type="submit" disabled={!montoOk || alta.pendiente} className={buttonClasses("solid", "md")}>
                {alta.pendiente ? "Guardando…" : "Cargar el cheque"}
              </button>
            </div>
          </form>
        ) : (
          <button type="button" onClick={() => setAbierto(true)} className={buttonClasses("outline", "md")}>
            {cheques.length === 0 ? "Pagar con cheque" : "Cargar otro cheque"}
          </button>
        )
      ) : (
        cheques.length > 0 && (
          <p className="text-sm text-muted">Lo que falta pagar ya está cubierto por cheques sin debitar.</p>
        )
      )}
    </section>
  );
}
