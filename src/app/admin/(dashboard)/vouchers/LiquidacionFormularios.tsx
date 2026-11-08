"use client";

// VOUCHERS · formularios de la liquidación del lunes y de la cuenta de la administración del
// country (regla del dueño del 08/11/2026, src/lib/vouchers/liquidacion-core.ts). Cada uno llama
// a su Server Action (liquidacion-actions.ts), que vuelve a mirar permiso, interruptor y negocio.
// El doble clic no duplica: el botón se apaga mientras corre y el servidor tiene sus árbitros
// (semana única, ABIERTA→CONCILIADA una sola vez, clave del pago a cuenta).

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Select } from "@/components/ui";
import { bajaDeImpago, conciliarLiquidacion, confirmarAcreditacion, descartarLiquidacion, generarLiquidacion, pagoACuenta } from "@/lib/vouchers/liquidacion-actions";
import type { EstadoAcreditacion } from "@/lib/vouchers/acreditacion-core";
import { ETIQUETA_MEDIO_ADMINISTRACION, MEDIOS_DE_PAGO_ADMINISTRACION } from "@/lib/vouchers/liquidacion-core";
import { textoAlCentavo } from "@/lib/dinero/redondeo";

const ROTULO = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";
const FALLO = "No se pudo y no quedó nada a medias. Probá de nuevo; si sigue, avisá.";

function MensajeError({ id, texto }: { id: string; texto: string }) {
  if (!texto) return null;
  return (
    <p id={id} role="alert" className="text-sm text-danger">
      {texto}
    </p>
  );
}

function Medio({ id }: { id: string }) {
  return (
    <div>
      <label htmlFor={id} className={ROTULO}>
        Cómo pagó
      </label>
      <Select id={id} name="medio" defaultValue="TRANSFERENCIA">
        {MEDIOS_DE_PAGO_ADMINISTRACION.map((m) => (
          <option key={m} value={m}>
            {ETIQUETA_MEDIO_ADMINISTRACION[m]}
          </option>
        ))}
      </Select>
    </div>
  );
}

/** Genera la liquidación de la semana que terminó el domingo elegido (por defecto, el último). */
export function GenerarLiquidacion({ domingo }: { domingo: string }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const fd = new FormData(e.currentTarget);
    setError("");
    empezar(async () => {
      try {
        const r = await generarLiquidacion(fd);
        if (!r.ok) return setError(r.error);
        router.push(`/admin/vouchers/liquidacion/${r.valor.liquidacionId}`);
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <form onSubmit={enviar} className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-end" aria-busy={pendiente || undefined}>
      <div>
        <label htmlFor={`${id}-hasta`} className={ROTULO}>
          Semana que termina el domingo
        </label>
        <Input id={`${id}-hasta`} name="hasta" type="date" defaultValue={domingo} max={domingo} required aria-describedby={`${id}-ayuda`} />
      </div>
      <Button type="submit" disabled={pendiente} estado={pendiente ? "cargando" : undefined}>
        Generar la liquidación
      </Button>
      <p id={`${id}-ayuda`} className="text-xs text-muted sm:max-w-sm">
        Toma los vouchers usados hasta ese domingo que todavía no se liquidaron (incluidos los que quedaron de semanas anteriores).
      </p>
      <MensajeError id={`${id}-error`} texto={error} />
    </form>
  );
}

/** Concilia la liquidación contra lo que transfirió la administración, voucher por voucher. */
export function ConciliarLiquidacion({ liquidacionId, total, hoy }: { liquidacionId: string; total: string; hoy: string }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const fd = new FormData(e.currentTarget);
    fd.set("liquidacionId", liquidacionId);
    setError("");
    empezar(async () => {
      try {
        const r = await conciliarLiquidacion(fd);
        if (!r.ok) return setError(r.error);
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <form onSubmit={enviar} className="grid gap-3 pt-3 sm:grid-cols-2" aria-busy={pendiente || undefined}>
      <div>
        <label htmlFor={`${id}-pagado`} className={ROTULO}>
          Cuánto pagó la administración
        </label>
        <Input id={`${id}-pagado`} name="pagado" importe inputMode="decimal" autoComplete="off" defaultValue={total} required className="text-right tabular-nums" />
      </div>
      <div>
        <label htmlFor={`${id}-fecha`} className={ROTULO}>
          Fecha del pago
        </label>
        <Input id={`${id}-fecha`} name="fecha" type="date" defaultValue={hoy} max={hoy} required />
      </div>
      <Medio id={`${id}-medio`} />
      <div>
        <label htmlFor={`${id}-ref`} className={ROTULO}>
          Referencia (opcional)
        </label>
        <Input id={`${id}-ref`} name="referencia" autoComplete="off" maxLength={120} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-rech`} className={ROTULO}>
          Vouchers que la administración no pagó (opcional)
        </label>
        <textarea
          id={`${id}-rech`}
          name="rechazados"
          rows={2}
          aria-describedby={`${id}-ayuda`}
          className="block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-strong focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <p id={`${id}-ayuda`} className="mt-1 text-xs text-muted">
          Los números, separados por coma o uno por renglón. Esos quedan como «no pagado» y siguen en el saldo a cobrar. Si el monto no coincide con lo aceptado, la diferencia queda anotada.
        </p>
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-dif`} className="flex min-h-11 items-center gap-2 text-sm text-strong">
          <input id={`${id}-dif`} name="aceptarDiferencia" type="checkbox" value="si" className="size-4" />
          Si el pago no cuadra, conciliar igual y dejar la diferencia anotada
        </label>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente} estado={pendiente ? "cargando" : undefined} className="w-full sm:w-auto">
          Conciliar con el pago
        </Button>
      </div>
      <div className="sm:col-span-2">
        <MensajeError id={`${id}-error`} texto={error} />
      </div>
    </form>
  );
}

/** Descarta una liquidación abierta mal generada: sus vouchers vuelven a «sin liquidar». */
export function DescartarLiquidacion({ liquidacionId }: { liquidacionId: string }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [pendiente, empezar] = useTransition();
  const descartar = () => {
    if (pendiente) return;
    const fd = new FormData();
    fd.set("liquidacionId", liquidacionId);
    setError("");
    empezar(async () => {
      try {
        const r = await descartarLiquidacion(fd);
        if (!r.ok) return setError(r.error);
        router.push("/admin/vouchers#liquidacion");
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <div className="space-y-2">
      {confirmar ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={descartar}>
            Sí, descartarla
          </Button>
          <Button type="button" variant="ghost" disabled={pendiente} onClick={() => setConfirmar(false)}>
            No
          </Button>
        </div>
      ) : (
        <Button type="button" variant="ghost" onClick={() => setConfirmar(true)}>
          Descartar esta liquidación
        </Button>
      )}
      <MensajeError id={`${id}-error`} texto={error} />
    </div>
  );
}

/**
 * Pago a cuenta de la administración: lo que pague de vouchers no pagados (se imputa a esos vouchers,
 * que dejan de reclamarse), de una diferencia o por adelantado (queda a favor).
 */
export function PagoACuenta({ hoy }: { hoy: string }) {
  const id = useId();
  const router = useRouter();
  const [clave, setClave] = useState(() => crypto.randomUUID());
  const [error, setError] = useState("");
  const [listo, setListo] = useState("");
  const [pendiente, empezar] = useTransition();
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("clave", clave);
    setError("");
    setListo("");
    empezar(async () => {
      try {
        const r = await pagoACuenta(fd);
        if (!r.ok) return setError(r.error);
        const v = r.valor;
        const saldados = v.imputados.filter((x) => x.saldado).map((x) => x.numero);
        const enParte = v.imputados.filter((x) => !x.saldado).map((x) => x.numero);
        setListo(
          v.duplicado
            ? "Ese pago ya estaba anotado."
            : [
                "Pago anotado en la cuenta de la administración.",
                saldados.length ? `Saldó ${saldados.join(", ")}: ya no vuelven a liquidarse.` : "",
                enParte.length ? `Pagó una parte de ${enParte.join(", ")}: la próxima liquidación reclama sólo lo que falta.` : "",
                v.sinImputar > 0 ? `Quedan $ ${textoAlCentavo(v.sinImputar).replace(".", ",")} a favor de la administración.` : "",
              ]
                .filter(Boolean)
                .join(" "),
        );
        setClave(crypto.randomUUID());
        form.reset();
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <form onSubmit={enviar} className="grid gap-3 pt-3 sm:grid-cols-2" aria-busy={pendiente || undefined}>
      <div>
        <label htmlFor={`${id}-monto`} className={ROTULO}>
          Monto
        </label>
        <Input id={`${id}-monto`} name="monto" importe inputMode="decimal" autoComplete="off" required className="text-right tabular-nums" />
      </div>
      <div>
        <label htmlFor={`${id}-fecha`} className={ROTULO}>
          Fecha
        </label>
        <Input id={`${id}-fecha`} name="fecha" type="date" defaultValue={hoy} max={hoy} required />
      </div>
      <Medio id={`${id}-medio`} />
      <div>
        <label htmlFor={`${id}-ref`} className={ROTULO}>
          Referencia (opcional)
        </label>
        <Input id={`${id}-ref`} name="referencia" autoComplete="off" maxLength={120} />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`${id}-vouchers`} className={ROTULO}>
          Vouchers no pagados que salda (opcional)
        </label>
        <textarea
          id={`${id}-vouchers`}
          name="vouchers"
          rows={2}
          aria-describedby={`${id}-ayuda-vouchers`}
          className="block w-full rounded-md border border-line bg-surface px-3 py-2 font-mono text-sm text-strong focus-visible:outline-2 focus-visible:outline-offset-2"
        />
        <p id={`${id}-ayuda-vouchers`} className="mt-1 text-xs text-muted">
          Los números, separados por coma o uno por renglón. Si no ponés ninguno, el pago salda los no pagados más viejos primero. Lo que sobre queda a favor de la administración.
        </p>
      </div>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pendiente} estado={pendiente ? "cargando" : undefined} className="w-full sm:w-auto">
          Anotar el pago
        </Button>
      </div>
      <div className="sm:col-span-2">
        <MensajeError id={`${id}-error`} texto={error} />
        {listo && (
          <p role="status" className="text-sm text-strong">
            {listo}
          </p>
        )}
      </div>
    </form>
  );
}

/** Imprimir / guardar como PDF el reporte del lunes (el diálogo del navegador). */
export function Imprimir() {
  return (
    <Button type="button" variant="outline" onClick={() => window.print()}>
      Imprimir o guardar PDF
    </Button>
  );
}

/** Motivo mínimo: el mismo tope que `darDeBajaImpago` (liquidacion-repo.ts), para avisar antes de ir al servidor. */
export const MOTIVO_MINIMO_BAJA = 5;

/**
 * «Dar de baja» un voucher NO pagado que la administración desconoce para siempre (si no, vuelve solo
 * en la próxima liquidación). Motivo obligatorio (queda en el registro) y confirmación en dos pasos.
 * La página lo muestra sólo a quien tiene `cash:manage`; la acción lo vuelve a exigir.
 */
export function DarDeBajaImpago({ numero }: { numero: string }) {
  const id = useId();
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  const enviar = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendiente) return;
    if (motivo.trim().length < MOTIVO_MINIMO_BAJA) return setError("Escribí por qué se da de baja (al menos 5 letras): queda en el registro.");
    const fd = new FormData();
    fd.set("numero", numero);
    fd.set("motivo", motivo);
    setError("");
    empezar(async () => {
      try {
        const r = await bajaDeImpago(fd);
        if (!r.ok) return setError(r.error);
        setAbierto(false);
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  if (!abierto) {
    return (
      <Button type="button" variant="ghost" size="sm" onClick={() => setAbierto(true)} aria-label={`Dar de baja el voucher ${numero}`}>
        Dar de baja
      </Button>
    );
  }
  return (
    <form onSubmit={enviar} className="flex min-w-64 flex-col gap-2 whitespace-normal" aria-busy={pendiente || undefined}>
      <label htmlFor={`${id}-motivo`} className={ROTULO}>
        Por qué se da de baja el {numero}
      </label>
      <Input
        id={`${id}-motivo`}
        name="motivo"
        value={motivo}
        onChange={(e) => setMotivo(e.target.value)}
        required
        minLength={MOTIVO_MINIMO_BAJA}
        maxLength={200}
        aria-describedby={`${id}-ayuda ${id}-error`}
      />
      <p id={`${id}-ayuda`} className="text-xs text-muted">
        La administración no lo va a pagar: deja de reclamarse y no vuelve en la próxima liquidación. No se deshace.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" size="sm" disabled={pendiente} estado={pendiente ? "cargando" : undefined}>
          Sí, darlo de baja
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={pendiente} onClick={() => (setAbierto(false), setError(""))}>
          No
        </Button>
      </div>
      <MensajeError id={`${id}-error`} texto={error} />
    </form>
  );
}

const diaDeMp = (f: string) => `${f.slice(6, 8)}/${f.slice(4, 6)}/${f.slice(0, 4)}`;

/**
 * La conciliación del pago con Mercado Pago (la cuenta bancaria del negocio): «pendiente de
 * acreditación» hasta que alguien confirma que la plata entró. Si el extracto de MP ya trae el
 * movimiento (monto + fecha + referencia), se muestra y el botón lo engancha.
 */
export function AcreditacionDelPago({ pagoId, liquidacionId, estado }: { pagoId: string; liquidacionId?: string; estado: EstadoAcreditacion }) {
  const id = useId();
  const router = useRouter();
  const [error, setError] = useState("");
  const [pendiente, empezar] = useTransition();
  if (estado.estado === "no-aplica") return <span className="text-sm text-muted">En efectivo: entró al cajón.</span>;
  if (estado.estado === "acreditado") {
    return (
      <span className="text-sm text-strong" data-testid="acreditado-mp">
        Acreditado en Mercado Pago{estado.via === "mp" ? " (enganchado al movimiento de MP)" : " (confirmado a mano)"}
      </span>
    );
  }
  const confirmar = () => {
    if (pendiente) return;
    const fd = new FormData();
    fd.set("pagoId", pagoId);
    if (liquidacionId) fd.set("liquidacionId", liquidacionId);
    if (estado.candidato) fd.set("movimientoId", estado.candidato.id);
    setError("");
    empezar(async () => {
      try {
        const r = await confirmarAcreditacion(fd);
        if (!r.ok) return setError(r.error);
        router.refresh();
      } catch {
        setError(FALLO);
      }
    });
  };
  return (
    <div className="space-y-2" data-testid="pendiente-acreditacion">
      <p className="text-sm text-body">
        <strong className="font-semibold">Pendiente de acreditación en Mercado Pago.</strong>{" "}
        {estado.candidato
          ? `En Mercado Pago hay un movimiento por el mismo monto el ${diaDeMp(estado.candidato.fecha)}: ${estado.candidato.descripcion}.`
          : estado.candidatos > 1
            ? `En Mercado Pago hay ${estado.candidatos} movimientos por el mismo monto: revisá que la plata entró y confirmá.`
            : "Todavía no aparece en el extracto de Mercado Pago. Confirmalo cuando veas la plata en la app."}
      </p>
      <Button type="button" variant="outline" disabled={pendiente} estado={pendiente ? "cargando" : undefined} onClick={confirmar} aria-describedby={error ? `${id}-error` : undefined}>
        Confirmar acreditación en Mercado Pago
      </Button>
      <MensajeError id={`${id}-error`} texto={error} />
    </div>
  );
}
