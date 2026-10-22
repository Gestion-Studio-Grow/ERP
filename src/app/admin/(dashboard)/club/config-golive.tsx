"use client";

// ============================================================================
// LIMPIEZA PARA EL GO-LIVE — después del día de prueba: se borra lo de la prueba y se conserva lo maestro.
// ============================================================================
//
// Lo que la frena (lo lista el motor: canchas en juego, cuentas abiertas, cajas sin cerrar…), dos casillas (saldos y
// stock), el PIN de un dueño y, ANTES de limpiar, el respaldo de ahora: UNA descarga y elegir ese archivo. Se compara
// con la jornada de ahora (configuracion-core.ts: `verificarRespaldoElegido`): si cambió algo en el medio, se descarga
// de nuevo. Así no se repite el B1 del vanilla (limpiaba confiando en una descarga que el navegador pudo frenar).

import { useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import type { Ahora, EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { CampoPin } from "./formulario-del-club";
import { armarGoLive, duenioConPin, huellaDelElegido, respaldoAntesDeLimpiar, type DesenlaceLimpieza, type DuenioConPin, type RespaldoAntesDeLimpiar } from "./configuracion-core";
import { Casilla, ErrorDeSeccion, Seccion, campoArchivo, conElTopeDelEquipo, descargarTexto, despuesDePintar, sinDesborde, textoElegido } from "./config-piezas";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

const seleccionarGoLive = (e: EstadoClub, a: Ahora) => armarGoLive(e, a);

/** `negocio`: el PIN de la limpieza cuenta en el tope del equipo (el del bloqueo). */
export function LimpiezaGoLive({ almacen, negocio }: { almacen: Almacen; negocio?: string }) {
  const v = useSeleccion(almacen, seleccionarGoLive, porFirma);
  const operador = useOperador(almacen);
  const quien = operador ? operador.usuario.nombre.split(" ")[0] : null;
  const [saldos, setSaldos] = useState(true);
  const [stock, setStock] = useState(true);
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [bajado, setBajado] = useState<Pick<RespaldoAntesDeLimpiar, "huella" | "nombre"> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const idCampo = useId();

  const olvidar = () => {
    setBajado(null);
    if (campo.current) campo.current.value = "";
  };
  const cerrar = () => {
    olvidar();
    setAbierto(false);
    setPin("");
    setError("");
  };

  const descargar = () => {
    setError("");
    if (almacen.rol() !== "OWNER") return setError("La limpieza la hace un dueño.");
    const d: DuenioConPin = conElTopeDelEquipo(almacen, negocio, () => duenioConPin(almacen.estado(), almacen.auth(), pin, "La limpieza"));
    const duenioId = d.usuarioId;
    if (!d.ok || !duenioId) return setError(d.mensaje);
    const r = respaldoAntesDeLimpiar(almacen.estado(), duenioId, Date.now());
    descargarTexto(r.texto, r.nombre);
    setBajado({ huella: r.huella, nombre: r.nombre });
  };

  const limpiar = async () => {
    if (ocupado) return;
    setError("");
    const texto = await textoElegido(campo.current);
    if (texto == null) return setError("Elegí el respaldo que descargaste (paso 2): sin eso no se limpia nada.");
    setOcupado(true);
    await despuesDePintar();
    let r: DesenlaceLimpieza;
    try {
      // El archivo se mira acá (que sea un respaldo que se puede restaurar); el comando lleva sólo su huella, y al correr
      // (o al re-aplicarse sobre la base) mira que sea la de la jornada de ahora.
      const elegido = huellaDelElegido(texto);
      if (!elegido.ok) {
        almacen.informar({ ok: false, mensaje: elegido.motivo });
        return;
      }
      r = almacen.comando("golive", [{ conservarSaldos: saldos, conservarStock: stock, pin, descargado: bajado, huellaElegida: elegido.huella, rol: almacen.rol() }], {
        envolver: (correr) => conElTopeDelEquipo(almacen, negocio, correr) as DesenlaceLimpieza,
      });
    } finally {
      setOcupado(false);
    }
    // El aviso de abajo dice qué pasó (y si salió mal, por qué).
    if (r.causa === "cambio") return olvidar();
    if (!r.ok) return;
    almacen.guardarYa();
    cerrar();
  };

  return (
    <Seccion
      id="club-config-golive"
      titulo="Limpieza para el go-live"
      extra={v.hecha ? <span className="rounded-full border border-success/40 bg-success-soft px-3 py-1 text-xs font-semibold text-strong">{v.hecha}</span> : undefined}
      bajada="Después del día de prueba: borra turnos jugados, cuentas de cargos, caja, pedidos, créditos pendientes y novedades enviadas. Se conserva lo maestro: canchas, horarios, precios, productos, usuarios y PIN, clientes, proveedores y turnos fijos. Los turnos por jugar quedan, con su seña."
    >
      <Casilla checked={saldos} onChange={setSaldos}>
        Conservar los saldos (cuenta corriente, créditos y faltas de los clientes; deuda con proveedores). Destildalo sólo si la prueba fue de mentira.
      </Casilla>
      <Casilla checked={stock} onChange={setStock}>
        Conservar el stock contado
      </Casilla>
      {v.pendientes.length > 0 ? (
        <div className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning-soft p-3 text-sm text-strong">
          <p className="font-semibold">Antes de limpiar hay que resolver:</p>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {v.pendientes.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-body">No hay nada pendiente: se puede limpiar.</p>
      )}
      {!abierto ? (
        <Button variant="danger" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" onClick={() => setAbierto(true)}>
          Hacer la limpieza para el go-live
        </Button>
      ) : (
        <div role="group" aria-labelledby="club-config-golive" className="flex flex-col gap-3 rounded-md border border-danger/40 p-3">
          <p className="text-sm font-semibold text-strong">{saldos ? "Se conservan los saldos." : "⚠ Los saldos de los clientes y la deuda con proveedores quedan en CERO."} Esto no se deshace.</p>
          <CampoPin quien={quien} rol={operador?.usuario.rol} value={pin} onChange={setPin} />
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-body">
            <li className="flex flex-col gap-2">
              <span>
                <strong className="text-strong">Descargá el respaldo de ahora.</strong> Si algo sale mal, con ese archivo se vuelve atrás («Restaurar desde un archivo»).
              </span>
              <Button variant={bajado ? "outline" : "solid"} size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" disabled={ocupado} onClick={descargar}>
                {bajado ? "Descargar de nuevo" : "Descargar el respaldo de antes de limpiar"}
              </Button>
              {bajado && (
                <span className={sinDesborde}>
                  Se pidió la descarga de <strong className="text-strong">{bajado.nombre}</strong>. Fijate que esté en Descargas.
                </span>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span>
                <strong className="text-strong">Elegí ese archivo</strong> para comprobar que se guardó y que es la jornada de ahora. Recién ahí se limpia.
              </span>
              <label htmlFor={idCampo} className="text-sm font-medium text-strong">
                Respaldo descargado
              </label>
              <input ref={campo} id={idCampo} type="file" accept=".json,application/json" className={campoArchivo} disabled={!bajado} />
            </li>
          </ol>
          <ErrorDeSeccion texto={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" size="md" disabled={!bajado || ocupado} onClick={() => void limpiar()}>
              {ocupado ? "Verificando…" : "Ya lo guardé: limpiar"}
            </Button>
            <Button variant="outline" size="md" disabled={ocupado} onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </Seccion>
  );
}
