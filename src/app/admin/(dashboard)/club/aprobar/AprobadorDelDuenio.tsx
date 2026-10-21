"use client";

// ============================================================================
// EL APROBADOR DEL DUEÑO — el pedido del link, su PIN y el código para mandarle a recepción (en el celular).
// ============================================================================
//
// Paridad con `dialogoAprobar` del club vanilla: arriba, quién pide qué; abajo, quién aprueba, su PIN y el monto
// (lo puede cambiar). Con el PIN bueno sale el código de 6 letras, grande, con «Mandar el código por WhatsApp» (al
// WhatsApp del club cargado en Configuración; en la demo, para elegir el chat). El PIN se prueba con el tope del
// bloqueo (5 mal → 30 s, 2 min, 10 min; en el real, guardado por negocio en este equipo, como el bloqueo).
// Las reglas están en ../aprobar-core.ts. Pensado para el celular: una columna, campos de 44 px, foco al resultado.

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { cn } from "@/components/ui/cn";
import { LARGO_PIN, generarDemo } from "@/lib/club/motor.mjs";
import type { DatosAprobacion, EstadoClub } from "@/lib/club/motor.mjs";
import { descomprimir, leerSobre } from "@/lib/club/foto";
import { MINUTO_DEMO, claveDeLaDemo, leerDemo } from "../almacen";
import { duenosQueAprueban, enlaceDelCodigo, leerPedidoDelLink, pinesDeEjemplo, probarAprobacion, queSePide, situacionDelPedido, textoDelPedido } from "../aprobar-core";
import { claveDeIntentosDelBloqueo, guardaDelBloqueo, type GuardaDelBloqueo } from "../bloqueo-core";
import type { RespuestaLeerFoto } from "../estado-actions";
import { fechaLocal } from "../reloj-del-club";
import { BotonWhatsApp } from "../WhatsAppDelClub";

const tarjeta = "flex min-w-0 flex-col gap-3 rounded-lg border border-line bg-surface-raised p-4";
const etiqueta = "text-sm font-medium text-strong";

function almacenamiento(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** La demo de ESTE equipo y esta persona (la misma que abre /admin/club), o una de ejemplo de hoy. */
function estadoDeLaDemo(negocio: string, usuario: string): EstadoClub {
  const hoy = fechaLocal(new Date());
  return leerDemo(almacenamiento(), claveDeLaDemo(negocio, usuario), hoy) ?? generarDemo(hoy, MINUTO_DEMO);
}

/** La jornada guardada en la base (BP-3), o null si no hay / no se pudo leer (el PIN lo verifica la compu del club). */
async function estadoDeLaBase(leerFoto: () => Promise<RespuestaLeerFoto>): Promise<EstadoClub | null> {
  try {
    const r = await leerFoto();
    if (!r.ok || !r.foto) return null;
    const l = leerSobre(await descomprimir(r.foto.gzip));
    return l.ok ? l.estado : null;
  } catch {
    return null;
  }
}

type Resultado = { codigo: string; monto: number; aprobo: string | null; pinViejo: boolean };

function ElCodigo({ pedido, r, estado, modo, onOtroMonto }: { pedido: DatosAprobacion; r: Resultado; estado: EstadoClub | null; modo: "demo" | "real"; onOtroMonto: () => void }) {
  const id = useId();
  const titulo = useRef<HTMLHeadingElement>(null);
  useEffect(() => titulo.current?.focus(), []);
  return (
    <section aria-labelledby={`${id}-t`} className={cn(tarjeta, "border-accent")}>
      <h2 id={`${id}-t`} ref={titulo} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
        Mandale este código a {pedido.p}
      </h2>
      <p className="text-4xl font-semibold tracking-widest text-strong tabular-nums">
        {r.codigo}
      </p>
      <p className="text-sm text-body">
        Vale para {queSePide(pedido, r.monto)}.{" "}
        {r.aprobo ? `Lo aprobás como ${r.aprobo}.` : "Si el PIN que pusiste no es el tuyo, el código no va a servir: lo controla la compu del club."}
      </p>
      {r.pinViejo && (
        <p className="text-sm text-strong">Tu PIN de dueño ahora es de {LARGO_PIN.duenio} números: la próxima vez que entres desde el puesto del dueño (tu compu, con tu usuario del ERP) te va a pedir que elijas uno nuevo.</p>
      )}
      <BotonWhatsApp enlace={enlaceDelCodigo(estado, pedido, r.codigo, r.monto, modo)} variante="solid">
        Mandar el código por WhatsApp
      </BotonWhatsApp>
      {modo === "demo" && <p className="text-sm text-body">En la demo, el código se tipea en Clientes → la ficha del cliente → «Esperando al dueño».</p>}
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="md" onClick={onOtroMonto} className="max-sm:w-full">
          Cambiar el monto
        </Button>
        <ButtonLink href="/admin/club" variant="ghost" size="md" className="max-sm:w-full">
          Listo, volver al club
        </ButtonLink>
      </div>
    </section>
  );
}

function FormularioDeAprobacion({
  pedido,
  estado,
  guarda,
  modo,
  onCodigo,
}: {
  pedido: DatosAprobacion;
  estado: EstadoClub | null;
  guarda: GuardaDelBloqueo;
  modo: "demo" | "real";
  onCodigo: (r: Resultado) => void;
}) {
  const duenos = duenosQueAprueban(estado);
  const [quien, setQuien] = useState<string | null>(duenos[0]?.id ?? null);
  const [pin, setPin] = useState("");
  const [monto, setMonto] = useState(String(pedido.m));
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  // Input no reenvía `ref`: el PIN se enfoca por su id.
  const enfocarPin = useCallback(() => document.getElementById(`${id}-pin`)?.focus(), [id]);
  const ejemplo = pinesDeEjemplo(estado, modo);
  // Al abrir el link, directo al PIN (como el vanilla): en el celular sube el teclado numérico.
  useEffect(enfocarPin, [enfocarPin]);
  return (
    <form
      className={tarjeta}
      aria-labelledby={`${id}-t`}
      onSubmit={(ev) => {
        ev.preventDefault();
        const r = probarAprobacion({ estado, pedido, duenioId: quien, pin, monto, intentos: guarda.leer(), ahoraMs: Date.now() });
        if (r.tipo === "malo" || r.tipo === "codigo") guarda.guardar(r.intentos);
        if (r.tipo === "codigo") {
          setError(null);
          onCodigo({ codigo: r.codigo, monto: r.monto, aprobo: r.aprobo, pinViejo: r.pinViejo });
          return;
        }
        setError(r.mensaje);
        if (r.tipo === "malo") setPin("");
        enfocarPin();
      }}
    >
      <h2 id={`${id}-t`} className="text-lg font-semibold text-strong">
        ¿Lo aprobás?
      </h2>
      {duenos.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className={cn(etiqueta, "mb-1")}>¿Quién aprueba?</legend>
          <div className="flex flex-wrap gap-2">
            {duenos.map((u) => (
              <label
                key={u.id}
                className={cn(
                  "inline-flex min-h-11 min-w-11 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-strong has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus",
                  quien === u.id ? "border-accent bg-accent-soft font-semibold" : "border-line-strong bg-surface-raised",
                )}
              >
                <input type="radio" name={`${id}-quien`} value={u.id} checked={quien === u.id} onChange={() => setQuien(u.id)} className="size-4 accent-current" />
                {u.nombre}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      {duenos.length === 1 && <p className="text-sm text-body">Aprobás como {duenos[0].nombre}.</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${id}-pin`} className={etiqueta}>
            Tu PIN ({LARGO_PIN.duenio} números)
          </label>
          <Input
            id={`${id}-pin`}
            type="password"
            inputMode="numeric"
            autoComplete="off"
            maxLength={LARGO_PIN.duenio}
            placeholder={"•".repeat(LARGO_PIN.duenio)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <label htmlFor={`${id}-monto`} className={etiqueta}>
            Monto que aprobás
          </label>
          <Input id={`${id}-monto`} inputMode="numeric" importe autoComplete="off" value={monto} onChange={(e) => setMonto(e.target.value)} />
        </div>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm font-medium text-danger">
          {error}
        </p>
      )}
      {ejemplo && <p className="text-sm text-body">En la demo, los PIN de ejemplo son: {ejemplo}.</p>}
      {!estado && <p className="text-sm text-body">Este celular no tiene la jornada del club: tu PIN lo controla la compu del club cuando recepción tipea el código.</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="solid" size="md" className="max-sm:w-full">
          Aprobar y ver el código
        </Button>
        <ButtonLink href="/admin/club" variant="ghost" size="md" className="max-sm:w-full">
          Ahora no
        </ButtonLink>
      </div>
      <p className="text-xs text-body">¿No querés aprobarlo? No mandes nada: sin tu código, recepción no puede fiar.</p>
    </form>
  );
}

export default function AprobadorDelDuenio({
  negocio,
  usuario,
  modo,
  leerFoto,
}: {
  negocio: string;
  usuario: string;
  modo: "demo" | "real";
  /** Sólo en el real: la lectura de la jornada en la base (`leerFotoDelClub`). */
  leerFoto?: () => Promise<RespuestaLeerFoto>;
}) {
  // Esta pantalla baja sólo en el navegador (ssr: false): el fragmento se lee al montar.
  const [pedido] = useState<DatosAprobacion | null>(() => leerPedidoDelLink(window.location.hash));
  const [estado, setEstado] = useState<EstadoClub | null | undefined>(() => (modo === "demo" ? estadoDeLaDemo(negocio, usuario) : leerFoto ? undefined : null));
  const [guarda] = useState(() => guardaDelBloqueo(almacenamiento(), modo === "real" ? claveDeIntentosDelBloqueo(negocio) : null));
  const [resultado, setResultado] = useState<Resultado | null>(null);

  // El pedido sale de la barra de direcciones apenas se lee (como el vanilla): no queda a la vista ni en el historial.
  useEffect(() => {
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
  }, []);
  useEffect(() => {
    if (modo !== "real" || !leerFoto) return;
    let vivo = true;
    estadoDeLaBase(leerFoto).then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, [modo, leerFoto]);
  const otroMonto = useCallback(() => setResultado(null), []);

  if (!pedido) {
    return (
      <section className={tarjeta} aria-label="Sin pedido">
        <p role="alert" className="text-sm font-medium text-strong">
          No hay un pedido para aprobar en este link.
        </p>
        <p className="text-sm text-body">
          Abrí el link que te mandó recepción por WhatsApp. Si tuviste que entrar con tu clave, volvé al chat y tocá el link de nuevo; si sigue sin andar,
          pediles que te lo vuelvan a mandar.
        </p>
        <ButtonLink href="/admin/club" variant="outline" size="md" className="self-start max-sm:w-full">
          Ir al club
        </ButtonLink>
      </section>
    );
  }
  const situacion = estado === undefined ? "desconocido" : situacionDelPedido(estado, pedido);
  return (
    <div className="flex flex-col gap-4">
      <section aria-label="El pedido" className={cn(tarjeta, "border-warning/40 bg-warning-soft")}>
        <p className="text-xs font-semibold tracking-wide text-strong uppercase">{pedido.t === "fiado" ? "Fiado" : "Cuenta corriente"}</p>
        <p className="text-base text-strong">{textoDelPedido(pedido)}</p>
      </section>
      {situacion === "resuelto" ? (
        <p role="alert" className={cn(tarjeta, "text-sm font-medium text-strong")}>
          Este pedido ya se resolvió en el club: no hace falta el código.
        </p>
      ) : estado === undefined ? (
        <p role="status" className="text-sm text-body">
          Buscando los dueños del club…
        </p>
      ) : resultado ? (
        <ElCodigo pedido={pedido} r={resultado} estado={estado} modo={modo} onOtroMonto={otroMonto} />
      ) : (
        <FormularioDeAprobacion pedido={pedido} estado={estado} guarda={guarda} modo={modo} onCodigo={setResultado} />
      )}
    </div>
  );
}
