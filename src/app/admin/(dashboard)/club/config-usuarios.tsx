"use client";

// ============================================================================
// USUARIOS Y ACCESOS — PIN inicial de los dueños, alta, PIN nuevo, sacar acceso y cambiar mi PIN.
// ============================================================================
//
// Como `vistaAjustes` + `vistaConsola` del vanilla. Lo que da o saca acceso pide el PIN de quien opera y no se
// deshace. El PIN que genera el motor se muestra UNA vez (`PinDeUnaVez`), nunca en el aviso; un PIN ajeno no se
// muestra nunca. Los pedidos de acceso se dan desde el Tablero (no se duplica la pantalla): acá se avisa y se lleva.

import { useCallback, useId, useState } from "react";
import { Button } from "@/components/ui/Button";
import { usuario as usuarioDe } from "@/lib/club/motor.mjs";
import type { EstadoClub, Rol } from "@/lib/club/motor.mjs";
import type { Almacen } from "./almacen";
import { Campo, CampoPin, Opciones } from "./formulario-del-club";
import { armarUsuarios, type DesenlaceConfig, type FilaUsuario } from "./configuracion-core";
import { PinDeUnaVez, Seccion, subtarjeta, useHacerConfig } from "./config-piezas";
import { porFirma, useOperador, useSeleccion } from "./usar-almacen";

const ROLES_ALTA: readonly { valor: Rol; etiqueta: string }[] = [
  { valor: "recepcion", etiqueta: "Recepción" },
  { valor: "duenio", etiqueta: "Dueño/a" },
];

type Abierta = { tipo: "pinNuevo" | "sacar"; usuarioId: string } | null;

/** Un PIN de 2 números que no se ve ni se autocompleta (para el PIN inicial y el nuevo). */
function CampoPinNuevo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return <Campo label={label} type="password" inputMode="numeric" maxLength={2} value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} className="sm:w-28" />;
}

function PinInicial({ id, nombre, hacer }: { id: string; nombre: string; hacer: ReturnType<typeof useHacerConfig> }) {
  const [pin, setPin] = useState("");
  const [repetido, setRepetido] = useState("");
  return (
    <form
      aria-label={`PIN de ${nombre}`}
      className="flex flex-col gap-2 sm:flex-row sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        hacer({ tipo: "pinInicial", usuarioId: id, pin, repetido });
        setPin("");
        setRepetido("");
      }}
    >
      <p className="font-semibold text-strong sm:w-40 sm:self-center">{nombre}</p>
      <CampoPinNuevo label="PIN (2 números)" value={pin} onChange={setPin} />
      <CampoPinNuevo label="Repetilo" value={repetido} onChange={setRepetido} />
      <Button type="submit" variant="solid" size="md">
        Guardar PIN
      </Button>
    </form>
  );
}

function FilaDeUsuario({ f, abierta, onAbrir, onCerrar, quien, hacer, onPin }: { f: FilaUsuario; abierta: Abierta; onAbrir: (a: Abierta) => void; onCerrar: () => void; quien: string | null; hacer: ReturnType<typeof useHacerConfig>; onPin: (d: DesenlaceConfig) => void }) {
  const [pin, setPin] = useState("");
  const accion = abierta?.usuarioId === f.id ? abierta.tipo : null;
  return (
    <li className="flex flex-col gap-2 border-b border-line py-3 last:border-b-0">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-semibold text-strong">
            {f.nombre}
            {f.esVos ? " (vos)" : ""} · <span className="font-normal">{f.rolTexto}</span>
          </p>
          <p className="text-sm text-body">{f.puede}</p>
          {!f.tienePin && <p className="text-sm font-semibold text-strong">Todavía no tiene PIN.</p>}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" size="md" aria-expanded={accion === "pinNuevo"} onClick={() => onAbrir(accion === "pinNuevo" ? null : { tipo: "pinNuevo", usuarioId: f.id })}>
            PIN nuevo<span className="sr-only"> para {f.nombre}</span>
          </Button>
          {f.puedeSacar && (
            <Button variant="outline" size="md" aria-expanded={accion === "sacar"} onClick={() => onAbrir(accion === "sacar" ? null : { tipo: "sacar", usuarioId: f.id })}>
              Sacar acceso<span className="sr-only"> a {f.nombre}</span>
            </Button>
          )}
        </div>
      </div>
      {accion && (
        <form
          aria-label={accion === "pinNuevo" ? `PIN nuevo para ${f.nombre}` : `Sacarle el acceso a ${f.nombre}`}
          className="flex flex-col gap-2 rounded-md border border-line-strong p-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            const r = hacer(accion === "pinNuevo" ? { tipo: "pinNuevo", usuarioId: f.id, pin } : { tipo: "sacarAcceso", usuarioId: f.id, pin });
            setPin("");
            if (r.ok) {
              onCerrar();
              onPin(r);
            }
          }}
        >
          <p className="text-sm text-strong sm:max-w-56">{accion === "pinNuevo" ? `Se le arma un PIN nuevo a ${f.nombre}; el de ahora deja de andar.` : `${f.nombre} no va a poder entrar más.`}</p>
          <CampoPin quien={quien} value={pin} onChange={setPin} />
          <Button type="submit" variant={accion === "sacar" ? "danger" : "solid"} size="md">
            {accion === "pinNuevo" ? "Armar PIN nuevo" : "Sacar acceso"}
          </Button>
          <Button variant="outline" size="md" onClick={onCerrar}>
            Cancelar
          </Button>
        </form>
      )}
    </li>
  );
}

function AltaDeUsuario({ quien, hacer, onPin }: { quien: string | null; hacer: ReturnType<typeof useHacerConfig>; onPin: (d: DesenlaceConfig) => void }) {
  const [nombre, setNombre] = useState("");
  const [rol, setRol] = useState<Rol>("recepcion");
  const [pin, setPin] = useState("");
  return (
    <form
      aria-labelledby="club-config-t-alta"
      className={subtarjeta}
      onSubmit={(e) => {
        e.preventDefault();
        const r = hacer({ tipo: "alta", nombre, rol, pin });
        setPin("");
        if (r.ok) {
          setNombre("");
          onPin(r);
        }
      }}
    >
      <h3 id="club-config-t-alta" className="font-semibold text-strong">
        Dar de alta a alguien
      </h3>
      <Campo label="Nombre" placeholder="Ej.: Lu (tarde)" maxLength={40} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <Opciones leyenda="Qué puede hacer" opciones={ROLES_ALTA} valor={rol} onElegir={setRol} />
      <CampoPin quien={quien} value={pin} onChange={setPin} />
      <p className="text-sm text-body">El sistema le arma un PIN de 2 números que se ve una sola vez: anotalo y dáselo.</p>
      <Button type="submit" variant="solid" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal">
        Dar de alta
      </Button>
    </form>
  );
}

function CambiarMiPin({ almacen, hacer }: { almacen: Almacen; hacer: ReturnType<typeof useHacerConfig> }) {
  const [actual, setActual] = useState("");
  const [nuevo, setNuevo] = useState("");
  const [repetido, setRepetido] = useState("");
  return (
    <form
      aria-labelledby="club-config-t-mipin"
      className={subtarjeta}
      onSubmit={(e) => {
        e.preventDefault();
        const r = hacer({ tipo: "cambiarMiPin", actual, nuevo, repetido });
        const op = almacen.operador();
        // Quien opera sigue siendo el mismo, ahora con su PIN nuevo (si no, lo próximo con PIN fallaría).
        if (r.ok && op) almacen.cambiarOperador(usuarioDe(almacen.estado(), op.usuario.id) ?? op.usuario, { usuarioId: op.usuario.id, pin: nuevo.trim() });
        setActual("");
        setNuevo("");
        setRepetido("");
      }}
    >
      <h3 id="club-config-t-mipin" className="font-semibold text-strong">
        Cambiar mi PIN
      </h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <CampoPinNuevo label="Tu PIN actual" value={actual} onChange={setActual} />
        <CampoPinNuevo label="PIN nuevo" value={nuevo} onChange={setNuevo} />
        <CampoPinNuevo label="Repetí el nuevo" value={repetido} onChange={setRepetido} />
      </div>
      <Button type="submit" variant="outline" size="md" className="self-start max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:py-2 max-sm:whitespace-normal">
        Cambiar mi PIN
      </Button>
    </form>
  );
}

export function UsuariosDelClub({ almacen, irASolapa }: { almacen: Almacen; irASolapa: (id: string) => void }) {
  const operador = useOperador(almacen);
  const opId = operador?.usuario.id ?? null;
  const quien = operador ? operador.usuario.nombre.split(" ")[0] : null;
  const seleccionar = useCallback((e: EstadoClub) => armarUsuarios(e, opId), [opId]);
  const v = useSeleccion(almacen, seleccionar, porFirma);
  const hacer = useHacerConfig(almacen);
  const [abierta, setAbierta] = useState<Abierta>(null);
  const [pinNuevo, setPinNuevo] = useState<DesenlaceConfig["pinNuevo"] | null>(null);
  const listaId = useId();

  const alPin = (d: DesenlaceConfig) => {
    if (!d.pinNuevo) return;
    setPinNuevo(d.pinNuevo);
    // Si se armó un PIN nuevo para quien opera, sigue operando con ése.
    const op = almacen.operador();
    const yo = op && usuarioDe(almacen.estado(), op.usuario.id);
    if (op && yo?.pin && yo.pin !== op.auth.pin) almacen.cambiarOperador(yo, { usuarioId: yo.id, pin: yo.pin });
  };

  return (
    <Seccion id="club-config-usuarios" titulo="Usuarios y accesos" bajada="El acceso es con PIN de 2 números. Lo que da o saca acceso vuelve a pedir tu PIN.">
      {pinNuevo && (
        <PinDeUnaVez
          acceso={pinNuevo}
          onListo={() => {
            setPinNuevo(null);
            requestAnimationFrame(() => document.getElementById(listaId)?.focus());
          }}
        />
      )}
      {v.duenosSinPin.length > 0 && (
        <div className="flex flex-col gap-3 rounded-md border border-warning/40 bg-warning-soft p-3">
          <h3 className="font-semibold text-strong">Los dueños arman su PIN</h3>
          <p className="text-sm text-strong">2 números que sólo sepa cada uno (no pueden ser iguales). Con ese PIN se entra, se desbloquea la pantalla y se autorizan créditos y accesos.</p>
          {v.duenosSinPin.map((d) => (
            <PinInicial key={d.id} id={d.id} nombre={d.nombre} hacer={hacer} />
          ))}
        </div>
      )}
      {v.pedidosDeAcceso > 0 && (
        <div className="flex flex-col gap-2 rounded-md border border-line-strong p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-strong">
            {v.pedidosDeAcceso === 1 ? "Hay 1 pedido de acceso esperando." : `Hay ${v.pedidosDeAcceso} pedidos de acceso esperando.`} Se dan desde el Tablero.
          </p>
          <Button variant="outline" size="md" onClick={() => irASolapa("tablero")}>
            Ver en el Tablero
          </Button>
        </div>
      )}
      {!operador && <p className="text-sm font-semibold text-strong">Para dar de alta, armar PIN o sacar accesos, entrá con tu PIN.</p>}
      <ul id={listaId} tabIndex={-1} aria-label="Usuarios con acceso" className="flex flex-col focus-visible:outline-2 focus-visible:outline-focus">
        {v.filas.map((f) => (
          <FilaDeUsuario key={f.id} f={f} abierta={abierta} onAbrir={setAbierta} onCerrar={() => setAbierta(null)} quien={quien} hacer={hacer} onPin={alPin} />
        ))}
      </ul>
      <AltaDeUsuario quien={quien} hacer={hacer} onPin={alPin} />
      {operador && <CambiarMiPin almacen={almacen} hacer={hacer} />}
    </Seccion>
  );
}
