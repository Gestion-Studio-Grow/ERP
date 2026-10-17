"use client";

// ============================================================================
// PRIMERA VEZ: ARMÁ EL CLUB — la consola del primer arranque (paridad con `vistaConsola` del vanilla y con «Cómo se
// arranca» de docs/tenants/breakpoint/DIA-DE-PRUEBA.md).
// ============================================================================
//
// Sólo en la jornada real con el club sin configurar (`config.configurado === false`). En el orden que exige el almacén:
//   1. Cada dueño arma su PIN (2 números, repetido, distintos entre sí): `almacen.arranque` (sin auth, como el motor).
//   2. Con un dueño con PIN: «Entrar como <dueño>» con ese PIN (`probarPin` del bloqueo: 5 mal → espera) →
//      `cambiarOperador`. Desde ahí la consola es la solapa Configuración de siempre (ClubDemo muestra las solapas).
//   3. Ya adentro, lo opcional con las secciones de siempre (`ejecutar`): avisos, recepción, precios y fondo.
//   4. «Abrir el club» (`abrirElClub` → `terminarConfiguracion`): por `ejecutar` con quien entró, o por `arranque` si
//      nadie entró. Después nadie opera: el club queda bloqueado y se entra con el PIN, como el vanilla.
// Nunca se muestra un PIN. La lógica está en configuracion-core.ts (`armarArranque`, `abrirElClub`).

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/components/ui/cn";
import type { EstadoClub } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { SIN_INTENTOS_DEL_BLOQUEO, bloquearElClub, probarPin, type IntentosDelBloqueo } from "./bloqueo-core";
import { abrirElClub, armarArranque, ejecutarConfiguracion, type DuenioDelArranque } from "./configuracion-core";
import { subtarjeta, tarjeta } from "./config-piezas";
import { Campo } from "./formulario-del-club";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

const seleccionar = (e: EstadoClub) => armarArranque(e);
const ID_TITULO = "club-config-arranque";
const boton = "self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal";

/** 2 números que no se ven ni se autocompletan. */
function CampoDosNumeros({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Campo label={label} type="password" inputMode="numeric" maxLength={2} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="sm:w-28" />;
}

/** Al entrar, ClubDemo sigue en Configuración mientras el club no esté configurado (fc862025): el foco va al título. */
function enfocarTitulo() {
  requestAnimationFrame(() => document.getElementById(ID_TITULO)?.focus());
}

function ArmarPin({ almacen, d }: { almacen: Almacen; d: DuenioDelArranque }) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  return (
    <form
      aria-label={`PIN de ${d.nombre}`}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        // El aviso (abajo) dice si salió; si no (no coinciden, ya lo usa el otro dueño), se vuelve a escribir.
        almacen.arranque((estado, ahora) => ejecutarConfiguracion(estado, { tipo: "pinInicial", usuarioId: d.id, pin, repetido }, ahora, {}));
        setPin("");
        setRepetido("");
      }}
    >
      <p className="font-semibold text-strong sm:w-40 sm:self-center">{d.nombre}</p>
      <CampoDosNumeros label="PIN (2 números)" value={pin} onChange={setPin} />
      <CampoDosNumeros label="Repetilo" value={repetido} onChange={setRepetido} />
      <Button type="submit" variant="solid" size="md" className={boton}>
        Guardar el PIN de {d.corto}
      </Button>
    </form>
  );
}

function Entrar({ almacen, d, intentos, onIntentos }: { almacen: Almacen; d: DuenioDelArranque; intentos: IntentosDelBloqueo; onIntentos: (i: IntentosDelBloqueo) => void }) {
  const [pin, setPin] = useState("");
  return (
    <form
      aria-label={`Entrar como ${d.corto}`}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        const p = probarPin(almacen.estado(), d.id, pin, intentos, Date.now());
        setPin("");
        if (p.tipo === "bueno") {
          onIntentos(p.intentos);
          almacen.cambiarOperador(p.usuario, { usuarioId: p.usuario.id, pin: p.pin });
          almacen.informar({ ok: true, mensaje: `Hola, ${d.corto}. Cargá lo que quieras y, cuando esté, «Abrir el club».` });
          enfocarTitulo();
          return;
        }
        if (p.tipo === "malo") onIntentos(p.intentos);
        almacen.informar({ ok: false, mensaje: p.mensaje });
      }}
    >
      <CampoDosNumeros label={`PIN de ${d.corto}`} value={pin} onChange={setPin} />
      <Button type="submit" variant="solid" size="md" className={boton}>
        Entrar como {d.corto}
      </Button>
    </form>
  );
}

function AbrirElClub({ almacen, conOperador }: { almacen: Almacen; conOperador: boolean }) {
  const abrir = () => {
    const d = conOperador ? almacen.ejecutar((e, ahora, auth) => abrirElClub(e, ahora, auth)) : almacen.arranque((e, ahora) => abrirElClub(e, ahora));
    // Abierto: nadie opera. El club queda bloqueado («Elegí quién entra y poné su PIN») y se entra con el PIN. Sin
    // nadie adentro (abierto por `arranque`) ya está así.
    if (d.ok) bloquearElClub(almacen, "cambio");
  };
  return (
    <Button variant="solid" size="md" className={boton} onClick={abrir}>
      Abrir el club
    </Button>
  );
}

function Titulo() {
  return (
    <h2 id={ID_TITULO} tabIndex={-1} className="text-lg font-semibold text-strong focus-visible:outline-2 focus-visible:outline-focus">
      Primera vez: armá el club
    </h2>
  );
}

/** Sin nadie adentro: armar los PIN, entrar y (si se quiere) abrir ya. */
function Consola({ almacen }: { almacen: Almacen }) {
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const [intentos, setIntentos] = useState<IntentosDelBloqueo>(SIN_INTENTOS_DEL_BLOQUEO);
  const sinPin = v.duenos.filter((d) => !d.tienePin);
  const conPin = v.duenos.filter((d) => d.tienePin);
  return (
    <section aria-labelledby={ID_TITULO} className={tarjeta}>
      <div className="flex flex-col gap-1">
        <Titulo />
        <p className="text-sm text-body">Es la primera vez que se abre el club en este equipo. Va en este orden; lo de los pasos 3 y 4 se cambia después cuando quieras.</p>
      </div>
      <ol className="flex flex-col gap-3">
        <li className={subtarjeta}>
          <h3 className="font-semibold text-strong">1. Cada dueño arma su PIN</h3>
          <p className="text-sm text-body">2 números que sólo sepa cada uno, escritos dos veces. Los de los dos dueños no pueden ser iguales.</p>
          {conPin.map((d) => (
            <p key={d.id} className="text-sm font-semibold text-strong">
              ✔ {d.nombre} ya armó su PIN.
            </p>
          ))}
          {sinPin.map((d) => (
            <ArmarPin key={d.id} almacen={almacen} d={d} />
          ))}
        </li>
        <li className={subtarjeta}>
          <h3 className="font-semibold text-strong">2. Entrá como dueño</h3>
          {conPin.length === 0 ? (
            <p className="text-sm text-body">Cuando un dueño arme su PIN, entra acá con él.</p>
          ) : (
            conPin.map((d) => <Entrar key={d.id} almacen={almacen} d={d} intentos={intentos} onIntentos={setIntentos} />)
          )}
        </li>
        <li className={subtarjeta}>
          <h3 className="font-semibold text-strong">3. Lo que quieras cargar ya (opcional)</h3>
          <p className="text-sm text-body">
            Ya adentro: los avisos por WhatsApp (el celular de cada dueño, el del club y el alias para la seña), la recepción (cada persona con su PIN, que se ve
            una sola vez), el precio por hora y el fondo de caja.
          </p>
        </li>
        <li className={subtarjeta}>
          <h3 className="font-semibold text-strong">4. Abrir el club</h3>
          <p className="text-sm text-body">Queda bloqueado y se entra con el PIN, como todos los días.</p>
          {v.puedeAbrir ? <AbrirElClub almacen={almacen} conOperador={false} /> : <p className="text-sm text-body">Se puede abrir cuando al menos un dueño tenga su PIN.</p>}
        </li>
      </ol>
    </section>
  );
}

/** Ya adentro (un dueño entró con su PIN): cómo va lo opcional y «Abrir el club». Lo de cargar está abajo. */
function Checklist({ almacen, quien }: { almacen: Almacen; quien: string }) {
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const faltan = v.duenos.filter((d) => !d.tienePin).map((d) => d.corto);
  const filas: { listo: boolean; texto: string }[] = [
    { listo: faltan.length === 0, texto: faltan.length ? `PIN de los dueños: falta el de ${faltan.join(" y ")} (lo arma abajo, en «Usuarios y accesos»).` : "PIN de los dueños: listos." },
    { listo: v.avisos, texto: v.avisos ? "Avisos por WhatsApp: cargados." : "Avisos por WhatsApp: sin cargar (opcional)." },
    { listo: v.recepcion.length > 0, texto: v.recepcion.length ? `Recepción: ${v.recepcion.join(", ")}.` : "Recepción: nadie todavía (opcional: «Dar de alta a alguien», abajo)." },
    { listo: true, texto: `Precio por hora: ${v.precios}. Fondo de caja: ${v.fondo}.` },
  ];
  return (
    <section aria-labelledby={ID_TITULO} className={cn(tarjeta, "border-warning/40")}>
      <div className="flex flex-col gap-1">
        <Titulo />
        <p className="text-sm text-body">Entraste como {quien}. Cargá abajo lo que quieras (todo se cambia después) y, cuando esté, abrí el club.</p>
      </div>
      <ul aria-label="Cómo va la configuración" className="flex flex-col gap-1 text-sm text-strong">
        {filas.map((f) => (
          <li key={f.texto} className="flex gap-2">
            <span aria-hidden="true">{f.listo ? "✔" : "•"}</span>
            <span>{f.texto}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-body">Al abrir, la pantalla se bloquea: entrás con tu PIN, como todos los días.</p>
      <AbrirElClub almacen={almacen} conOperador />
    </section>
  );
}

export function PrimeraVez({ almacen }: { almacen: Almacen }) {
  const operador = useOperador(almacen);
  return operador ? <Checklist almacen={almacen} quien={operador.usuario.nombre.split(" ")[0]} /> : <Consola almacen={almacen} />;
}
