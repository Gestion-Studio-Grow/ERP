"use client";

// ============================================================================
// LA JORNADA — cómo va lo guardado, descargar el respaldo, restaurar desde un archivo y archivar días cerrados.
// ============================================================================
//
// Lo primero de Configuración (como la tarjeta «Jornada real» del vanilla). Las reglas están en configuracion-core.ts:
//   · Restaurar: se elige el archivo, se ve DE CUÁNDO ES y qué trae, y que reemplaza lo de ahora; con el PIN de un
//     dueño se restaura por `almacen.restaurar` (copia lo de antes en este equipo; sin lugar para esa copia, no
//     restaura; sin «Deshacer», como el vanilla). El anexo suelto se explica (no es un respaldo).
//   · Lo que ocupa (KB) se lee de `useEstadoDelGuardado`: el almacén lo avisa al archivar y al restaurar.
//   · Archivar: el contrato del almacén (`prepararArchivo` → UNA descarga → elegir ese archivo → `confirmar`). Un doble
//     clic se ignora; si algo de esos días cambió en el medio, vuelve al paso 1. Nada se achica sin el archivo elegido.
//   · Empezar otra jornada en blanco (sólo la jornada real y sólo si quien opera es un dueño): la zona de peligro de
//     abajo, como la limpieza del go-live — UNA descarga del respaldo de ahora, elegir ese archivo y el PIN; se
//     verifica que es la jornada de ahora (`autorizarEnBlanco`) y recién ahí `almacen.empezarEnBlanco` (copia en este
//     equipo, club sin configurar, sin operador: aparece la consola de primera vez). Con otro archivo, nada.

import { useCallback, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { EstadoClub, Ahora } from "@/lib/club/motor.mjs";
import type { Almacen, ArchivoPreparado } from "./almacen";
import { CampoPin } from "./formulario-del-club";
import {
  armarArchivo,
  QUE_PASA_EN_BLANCO,
  avisoDeEnBlanco,
  avisoDeRestaurado,
  ddmm,
  despuesDeConfirmar,
  duenioConPin,
  empezarEnBlancoConPin,
  kb,
  leerRespaldo,
  nombreDelArchivoParaArchivar,
  nombreDelRespaldo,
  prepararArchivoConPin,
  respaldoAntesDeBlanco,
  restaurarConPin,
  textoDelRespaldo,
  vistaDelGuardado,
  type ArchivoConPin,
  type DuenioConPin,
  type RespaldoParaRestaurar,
  type RespaldoParaVerificar,
} from "./configuracion-core";
import { ErrorDeSeccion, Seccion, campoArchivo, conElTopeDelEquipo, descargarTexto, despuesDePintar, sinDesborde, subtarjeta, textoElegido } from "./config-piezas";
import { porFirma, useEstadoDelGuardado, useOperador, useSeleccion } from "./usar-almacen";

const seleccionarArchivo = (e: EstadoClub, a: Ahora) => armarArchivo(e, a);

/** `negocio` (en las tres): el PIN de quien opera cuenta en el tope del equipo (el del bloqueo). */
function Restaurar({ almacen, quien, negocio }: { almacen: Almacen; quien: string | null; negocio?: string }) {
  const campo = useRef<HTMLInputElement>(null);
  const idCampo = useId();
  const [previa, setPrevia] = useState<RespaldoParaRestaurar | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const turnosAhora = almacen.estado().reservas.length;

  const elegir = async () => {
    setError("");
    setPrevia(null);
    const texto = await textoElegido(campo.current);
    if (texto == null) return;
    const r = leerRespaldo(texto);
    if (!r.ok) return setError(r.mensaje);
    setPrevia(r.respaldo);
  };
  const cancelar = () => {
    setPrevia(null);
    setPin("");
    if (campo.current) campo.current.value = "";
  };
  const restaurar = () => {
    if (!previa) return;
    setError("");
    // El dueño que opera, con el PIN que tipeó ahora: el almacén lo vuelve a controlar (rol OWNER + PIN de un dueño).
    // Copia lo de ahora al lado, reemplaza, apaga «Deshacer», guarda en el acto y revisa a quien opera: si ya no existe
    // o cambió su PIN en lo restaurado, queda sin operador y el bloqueo pide el PIN solo. Con el tope del equipo.
    const r = conElTopeDelEquipo(almacen, negocio, () => restaurarConPin(almacen, previa.foto, pin));
    setPin("");
    if (!r.ok) return setError(r.mensaje);
    const aviso = avisoDeRestaurado(previa.antesDeArchivar);
    if (aviso) almacen.informar({ ok: true, mensaje: aviso });
    cancelar();
  };

  return (
    <div className={subtarjeta}>
      <h3 className="font-semibold text-strong">Restaurar desde un archivo</h3>
      <p className="text-sm text-body">
        Sirve el respaldo de siempre («breakpoint-jornada-….json») o el archivo que bajaste al archivar («breakpoint-respaldo-y-archivo-….json»). Antes de
        restaurar vas a ver de cuándo es.
      </p>
      <div className="flex flex-col gap-1">
        <label htmlFor={idCampo} className="text-sm font-medium text-strong">
          Elegí el respaldo
        </label>
        <input ref={campo} id={idCampo} type="file" accept=".json,application/json" className={campoArchivo} onChange={() => void elegir()} />
      </div>
      <ErrorDeSeccion texto={error} />
      {previa && (
        <form
          aria-label="Restaurar este respaldo"
          className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-soft p-3"
          onSubmit={(e) => {
            e.preventDefault();
            restaurar();
          }}
        >
          <p className="text-sm text-strong">
            <strong>Respaldo del {previa.cuando ?? "(el archivo no dice de cuándo es)"}</strong>
            {previa.club ? ` · ${previa.club}` : ""} · {previa.turnos} turnos, {previa.clientes} clientes y {previa.usuarios} usuarios.
          </p>
          <p className="text-sm font-semibold text-strong">
            ⚠ Reemplaza la jornada de ahora ({turnosAhora} turnos): lo que se cargó después de esa fecha se pierde. Si querés quedarte con lo de ahora, primero
            «Descargar respaldo».
          </p>
          {previa.antesDeArchivar && <p className="text-sm text-strong">Es la jornada de antes de archivar: vuelven los días archivados (si avisa que se llena, archivá de nuevo).</p>}
          <CampoPin quien={quien} value={pin} onChange={setPin} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" variant="danger" size="md">
              Restaurar este respaldo
            </Button>
            <Button variant="outline" size="md" onClick={cancelar}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

type Preparado = { p: ArchivoPreparado; nombre: string };

function Archivar({ almacen, quien, bytes, negocio }: { almacen: Almacen; quien: string | null; bytes: number; negocio?: string }) {
  const v = useSeleccion(almacen, seleccionarArchivo, porFirma);
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [paso1, setPaso1] = useState<{ nombre: string; guardaAnexo: boolean } | null>(null);
  const preparado = useRef<Preparado | null>(null);
  const [ocupado, setOcupado] = useState<"preparando" | "verificando" | null>(null);
  const [error, setError] = useState("");
  const [hecho, setHecho] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const resultado = useRef<HTMLParagraphElement>(null);
  const idCampo = useId();

  const olvidar = useCallback(() => {
    preparado.current = null;
    setPaso1(null);
    if (campo.current) campo.current.value = "";
  }, []);
  const cerrar = () => {
    olvidar();
    setAbierto(false);
    setPin("");
    setError("");
    requestAnimationFrame(() => document.getElementById("club-config-archivar")?.focus());
  };

  const descargar = async () => {
    if (ocupado) return;
    setError("");
    setOcupado("preparando");
    await despuesDePintar();
    try {
      // El PIN, con el tope del equipo; el almacén lo vuelve a controlar (rol OWNER + PIN de un dueño).
      const d: ArchivoConPin = conElTopeDelEquipo(almacen, negocio, () => prepararArchivoConPin(almacen, pin));
      const r = d.resultado;
      if (!r || !r.ok) {
        if (r?.causa !== "repetido") setError(d.mensaje);
        return;
      }
      if (!("confirmar" in r)) {
        olvidar();
        setAbierto(false);
        setHecho(`No hay nada para archivar hasta el ${ddmm(r.hasta)}: ya está archivado o esas cajas no se cerraron (cerralas en Caja).`);
        return;
      }
      const nombre = nombreDelArchivoParaArchivar(Date.now());
      descargarTexto(r.textoDelArchivo, nombre);
      preparado.current = { p: r, nombre };
      setPaso1({ nombre, guardaAnexo: r.guardaAnexo });
    } finally {
      setOcupado(null);
    }
  };

  const confirmar = async () => {
    const actual = preparado.current;
    if (!actual || ocupado) return;
    setError("");
    let archivoElegido: string | undefined;
    if (!actual.p.guardaAnexo) {
      const t = await textoElegido(campo.current);
      if (t == null) return setError("Elegí el archivo que descargaste (paso 2): sin eso no se achica nada.");
      archivoElegido = t;
    }
    setOcupado("verificando");
    await despuesDePintar();
    let d: ReturnType<typeof despuesDeConfirmar>;
    try {
      d = despuesDeConfirmar(await actual.p.confirmar({ archivoElegido }), actual.nombre);
    } finally {
      setOcupado(null);
    }
    if (d.tipo === "ignorar") return;
    if (d.tipo === "volver") {
      olvidar();
      return setError(d.motivo);
    }
    if (d.tipo === "error") return setError(d.motivo);
    olvidar();
    setAbierto(false);
    setPin("");
    setHecho(d.mensaje);
    requestAnimationFrame(() => resultado.current?.focus());
  };

  return (
    <div className={subtarjeta}>
      <h3 id="club-config-t-archivo" className="font-semibold text-strong">
        Archivar días cerrados
      </h3>
      <p className="text-sm text-body">
        {bytes > 0 ? (
          <>
            En este equipo la jornada ocupa <strong className="tabular-nums text-strong">{kb(bytes)}</strong>, de unos 5.000 KB que guarda el navegador.{" "}
          </>
        ) : (
          "El navegador guarda unos 5.000 KB por sitio. "
        )}
        Para que no se
        llene, lo de los días con la <strong className="text-strong">caja cerrada</strong> hasta el{" "}
        <strong className="tabular-nums text-strong">{ddmm(v.hasta)}</strong> (más de 3 semanas) pasa a un archivo que te descargás: turnos jugados, cuentas
        cerradas, movimientos de caja y pedidos entregados. En el sistema queda el resumen de esos días.
      </p>
      <p className="text-sm text-body">No se toca: los turnos por jugar, las mesas abiertas, las cajas sin cerrar, la cuenta corriente ni los créditos de cada cliente.</p>
      {v.ultimo && <p className="text-sm text-body">{v.ultimo}</p>}
      {v.dias.length > 0 && (
        <details className="text-sm text-body">
          <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-strong focus-visible:outline-2 focus-visible:outline-focus">
            Días archivados ({v.dias.length}): turnos y cobrado de cada uno
          </summary>
          <ul className="flex max-h-56 flex-col gap-1 overflow-auto pl-4 tabular-nums">
            {v.dias.map((d) => (
              <li key={d.dia}>{d.texto}</li>
            ))}
          </ul>
        </details>
      )}
      <p ref={resultado} tabIndex={-1} className={cn("text-sm font-medium text-strong empty:hidden focus-visible:outline-2 focus-visible:outline-focus", sinDesborde)}>
        {hecho}
      </p>
      {!abierto ? (
        <Button
          id="club-config-archivar"
          variant="solid"
          size="md"
          className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal"
          onClick={() => {
            setHecho("");
            setAbierto(true);
          }}
        >
          Archivar días cerrados
        </Button>
      ) : (
        <div role="group" aria-labelledby="club-config-t-archivo" className="flex flex-col gap-3 rounded-md border border-line-strong p-3">
          <CampoPin quien={quien} value={pin} onChange={setPin} />
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-body">
            <li className="flex flex-col gap-2">
              <span>
                <strong className="text-strong">Descargá el archivo.</strong> Es uno solo: el respaldo completo de ahora y los días que se archivan. Todavía no se achica
                nada.
              </span>
              <Button variant={paso1 ? "outline" : "solid"} size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" disabled={ocupado !== null} onClick={() => void descargar()}>
                {ocupado === "preparando" ? "Preparando…" : paso1 ? "Descargar de nuevo" : "Descargar el respaldo para archivar"}
              </Button>
              {paso1 && (
                <span className={sinDesborde}>
                  Se pidió la descarga de <strong className="text-strong">{paso1.nombre}</strong>. Fijate que esté en Descargas.
                  {paso1.guardaAnexo ? " La historia de esos días también se guarda en el sistema; igual quedate con tu copia." : ""}
                </span>
              )}
            </li>
            <li className="flex flex-col gap-2">
              {paso1?.guardaAnexo ? (
                <span>
                  <strong className="text-strong">Confirmá.</strong> Se guarda el archivo de esos días en el sistema y recién ahí se achica lo de este equipo.
                </span>
              ) : (
                <>
                  <span>
                    <strong className="text-strong">Elegí ese archivo</strong> para comprobar que se guardó bien. Recién ahí se achica lo guardado en este equipo.
                  </span>
                  <label htmlFor={idCampo} className="text-sm font-medium text-strong">
                    Archivo descargado
                  </label>
                  <input ref={campo} id={idCampo} type="file" accept=".json,application/json" className={campoArchivo} disabled={!paso1} />
                </>
              )}
            </li>
          </ol>
          <ErrorDeSeccion texto={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" size="md" disabled={!paso1 || ocupado !== null} onClick={() => void confirmar()}>
              {ocupado === "verificando" ? "Verificando…" : paso1?.guardaAnexo ? "Confirmar el archivado" : "Ya lo guardé: achicar"}
            </Button>
            <Button variant="outline" size="md" disabled={ocupado !== null} onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const configurado = (e: EstadoClub) => e.config.configurado !== false;
const elNuevo = (_: boolean | undefined, nuevo: boolean) => nuevo;

function EmpezarEnBlanco({ almacen, quien, negocio }: { almacen: Almacen; quien: string | null; negocio?: string }) {
  const [abierto, setAbierto] = useState(false);
  const [pin, setPin] = useState("");
  const [bajado, setBajado] = useState<Pick<RespaldoParaVerificar, "huella" | "nombre"> | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState("");
  const campo = useRef<HTMLInputElement>(null);
  const idCampo = useId();
  const idTitulo = useId();

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
    if (almacen.rol() !== "OWNER") return setError("Empezar en blanco lo hace un dueño.");
    const d: DuenioConPin = conElTopeDelEquipo(almacen, negocio, () => duenioConPin(almacen.estado(), almacen.auth(), pin, "Empezar en blanco"));
    const duenioId = d.usuarioId;
    if (!d.ok || !duenioId) return setError(d.mensaje);
    const r = respaldoAntesDeBlanco(almacen.estado(), duenioId, Date.now());
    descargarTexto(r.texto, r.nombre);
    setBajado({ huella: r.huella, nombre: r.nombre });
  };

  const empezar = async () => {
    if (ocupado) return;
    setError("");
    const texto = await textoElegido(campo.current);
    if (texto == null) return setError("Elegí el respaldo que descargaste (paso 2): sin eso no se empieza nada.");
    setOcupado(true);
    await despuesDePintar();
    let d: ReturnType<typeof empezarEnBlancoConPin>;
    try {
      // Verificar y empezar en el mismo momento (sin nada en el medio): la jornada no puede cambiar entre una y otra.
      // Con el tope del equipo: trabado no se verifica ni se empieza.
      d = conElTopeDelEquipo(almacen, negocio, () => empezarEnBlancoConPin(almacen, { pin, descargado: bajado, textoElegido: texto }));
    } finally {
      setOcupado(false);
    }
    if (!d.ok) {
      if (d.causa === "cambio") olvidar();
      return setError(d.mensaje);
    }
    // Sin operador y sin configurar: Configuración pasa a la consola de primera vez (esta pantalla se va).
    almacen.informar({ ok: true, mensaje: avisoDeEnBlanco(bajado?.nombre ?? "el respaldo que bajaste") });
  };

  return (
    <div className="flex min-w-0 flex-col gap-3 rounded-md border border-danger/40 bg-surface p-3">
      <h3 id={idTitulo} className="font-semibold text-strong">
        Empezar otra jornada en blanco
      </h3>
      <p className="text-sm text-body">
        Para arrancar de cero en esta compu: sin turnos, clientes, caja ni usuarios de recepción. Para pasar del día de prueba al día 1 no hace falta: usá «Limpieza para
        el go-live» (abajo), que conserva lo maestro.
      </p>
      {!abierto ? (
        <Button variant="outline" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" onClick={() => setAbierto(true)}>
          Quiero empezar en blanco
        </Button>
      ) : (
        <div role="group" aria-labelledby={idTitulo} className="flex flex-col gap-3">
          <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm font-semibold text-strong">⚠ {QUE_PASA_EN_BLANCO} Esto no se deshace.</p>
          <CampoPin quien={quien} value={pin} onChange={setPin} />
          <ol className="flex list-decimal flex-col gap-3 pl-5 text-sm text-body">
            <li className="flex flex-col gap-2">
              <span>
                <strong className="text-strong">Descargá el respaldo de ahora.</strong> Con ese archivo se vuelve a esta jornada («Restaurar desde un archivo»).
              </span>
              <Button variant={bajado ? "outline" : "solid"} size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" disabled={ocupado} onClick={descargar}>
                {bajado ? "Descargar de nuevo" : "Descargar el respaldo de antes de empezar"}
              </Button>
              {bajado && (
                <span className={sinDesborde}>
                  Se pidió la descarga de <strong className="text-strong">{bajado.nombre}</strong>. Fijate que esté en Descargas.
                </span>
              )}
            </li>
            <li className="flex flex-col gap-2">
              <span>
                <strong className="text-strong">Elegí ese archivo</strong> para comprobar que se guardó y que es la jornada de ahora. Recién ahí se empieza en blanco.
              </span>
              <label htmlFor={idCampo} className="text-sm font-medium text-strong">
                Respaldo descargado
              </label>
              <input ref={campo} id={idCampo} type="file" accept=".json,application/json" className={campoArchivo} disabled={!bajado} />
            </li>
          </ol>
          <ErrorDeSeccion texto={error} />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button variant="danger" size="md" className="max-sm:h-auto max-sm:min-h-11 max-sm:py-2 max-sm:whitespace-normal" disabled={!bajado || ocupado} onClick={() => void empezar()}>
              {ocupado ? "Verificando…" : "Ya lo guardé: empezar en blanco"}
            </Button>
            <Button variant="outline" size="md" disabled={ocupado} onClick={cerrar}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Lo delicado se hace desde el puesto del dueño (login OWNER del ERP) y con el PIN de un dueño (decisión G8). */
export const puestoDeDuenio = (almacen: Pick<Almacen, "rol">) => almacen.rol() === "OWNER";

/** Se avisa de entrada, no al tocar: en un puesto de recepción, aunque entre un dueño con su PIN. */
export function SoloEnElPuestoDelDuenio({ que }: { que: string }) {
  return (
    <p className="rounded-md border border-line bg-surface-sunken p-3 text-sm text-body" data-ui="solo-puesto-del-duenio">
      <strong className="text-strong">Esto se hace desde el puesto del dueño.</strong> {que}: desde la compu donde entró el
      usuario de dueño del ERP, y con el PIN de un dueño.
    </p>
  );
}

/** `negocio`: lo que pide el PIN de quien opera cuenta en el tope del equipo (el del bloqueo). */
export function JornadaDelClub({ almacen, negocio }: { almacen: Almacen; negocio?: string }) {
  const g = useEstadoDelGuardado(almacen);
  const operador = useOperador(almacen);
  const quien = operador ? operador.usuario.nombre.split(" ")[0] : null;
  const v = vistaDelGuardado(g, almacen.modo());
  const [bajado, setBajado] = useState("");
  // Empezar en blanco: sólo en la jornada real, ya configurada, y si quien opera es un dueño (el almacén lo vuelve a
  // controlar con el puesto y el PIN: esconderlo no es seguridad).
  const enBlanco = useSeleccion(almacen, configurado, elNuevo) && almacen.modo() === "real" && operador?.usuario.rol === "duenio";

  const descargarRespaldo = () => {
    const ms = Date.now();
    const nombre = nombreDelRespaldo(ms);
    descargarTexto(textoDelRespaldo(almacen.estado(), operador?.usuario.id ?? null, ms), nombre);
    setBajado(nombre);
  };

  return (
    <Seccion
      id="club-config-jornada"
      titulo="Jornada"
      extra={<span className={cn("rounded-full border px-3 py-1 text-xs font-semibold", v.mal ? "border-danger/40 bg-danger-soft text-strong" : "border-line-strong text-strong")}>{v.titulo}</span>}
      bajada={v.detalle}
    >
      {v.lleno && (
        <p className="rounded-md border border-danger/40 bg-danger-soft p-3 text-sm font-semibold text-strong">
          ⚠ Se está llenando: descargá un respaldo y archivá los días cerrados (abajo).
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Button variant="solid" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal" onClick={descargarRespaldo}>
          Descargar respaldo
        </Button>
        <p className={cn("text-sm text-body", sinDesborde)}>
          {bajado ? (
            <>
              Se pidió la descarga de <strong className="text-strong">{bajado}</strong>.{" "}
            </>
          ) : (
            "Al cerrar el día: cerrá la caja y descargá el respaldo. "
          )}
          Guardalo en un lugar privado: tiene los PIN y los datos de los clientes, no lo mandes a un grupo.
        </p>
      </div>
      {puestoDeDuenio(almacen) ? (
        <>
          <Restaurar almacen={almacen} quien={quien} negocio={negocio} />
          <Archivar almacen={almacen} quien={quien} bytes={g.bytes} negocio={negocio} />
          {enBlanco && <EmpezarEnBlanco almacen={almacen} quien={quien} negocio={negocio} />}
        </>
      ) : (
        <SoloEnElPuestoDelDuenio que="Restaurar un respaldo, archivar los días cerrados y empezar en blanco" />
      )}
    </Seccion>
  );
}
