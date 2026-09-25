"use client";

// Raíz de la demo de Rendí: estado único, selector de rol siempre visible y recorrido guiado.
//
// Hidratación sin sorpresas: la página es estática (se arma en el build con el escenario
// inicial). Lo que la persona hizo antes vive en SU navegador (localStorage). Para no mezclar
// los dos en la hidratación, el árbol se monta primero con el escenario (igual que el HTML
// estático) y, ya en el navegador, se vuelve a montar leyendo lo guardado. `useSyncExternalStore`
// da `false` en el servidor y en la hidratación, y `true` después: esa es la llave.

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import ThemeToggle from "@/app/admin/(dashboard)/ThemeToggle";
import { Badge, Button, PageContainer, cn } from "@/components/ui";
import type { RolRendi } from "@/lib/rendiciones";
import { escenarioDemo } from "./escenario";
import { estadoInicial, guardarEstado, leerEstadoGuardado, reducirDemo, type EstadoDemo } from "./estado";
import { evaluarTodos, resumirRendiciones } from "./derivados";
import { ProveedorDemo, type ValorDemo } from "./contexto";
import { IconoCandado, IconoPlay, IconoReiniciar, Pestanas, idPanel, idPestana, type OpcionPestana } from "./piezas";
import Recorrido, { armarPasos, type PasoRecorrido } from "./Recorrido";
import RolRinde from "./RolRinde";
import RolAprueba from "./RolAprueba";
import RolTesoreria from "./RolTesoreria";
import RolContador from "./RolContador";

const ROLES: OpcionPestana<RolRendi>[] = [
  { id: "rinde", texto: "Quien rinde", textoCorto: "Rinde" },
  { id: "aprueba", texto: "Quien aprueba", textoCorto: "Aprueba" },
  { id: "tesoreria", texto: "Tesorería" },
  { id: "contador", texto: "Contador" },
];

const ID_ROLES = "rendi-rol";
const ID_REINICIAR = "rendi-reiniciar";

function sinSuscripcion() {
  return () => {};
}

export default function DemoRendi() {
  const enNavegador = useSyncExternalStore(sinSuscripcion, () => true, () => false);
  return <DemoConEstado key={enNavegador ? "navegador" : "estatico"} restaurar={enNavegador} />;
}

function iniciar(restaurar: boolean): EstadoDemo {
  return (restaurar ? leerEstadoGuardado() : null) ?? estadoInicial();
}

function DemoConEstado({ restaurar }: { restaurar: boolean }) {
  const [estado, despachar] = useReducer(reducirDemo, restaurar, iniciar);
  // null = recorrido cerrado · -1 = pregunta "¿arrancamos de cero?" · 0..n = paso.
  const [paso, setPaso] = useState<number | null>(null);

  // El montaje estático no escribe: si lo hiciera, pisaría lo guardado antes de leerlo.
  useEffect(() => {
    if (restaurar) guardarEstado(estado);
  }, [estado, restaurar]);

  const { datos, vista } = estado;
  const evaluaciones = useMemo(
    () => evaluarTodos(datos.comprobantes, datos.rendiciones),
    [datos.comprobantes, datos.rendiciones],
  );
  const resumenes = useMemo(
    () => resumirRendiciones(datos.rendiciones, datos.comprobantes, evaluaciones),
    [datos.rendiciones, datos.comprobantes, evaluaciones],
  );
  const pasos = useMemo(() => armarPasos(datos, evaluaciones, resumenes), [datos, evaluaciones, resumenes]);
  const destacado = paso !== null && paso >= 0 ? (pasos[paso]?.marca ?? null) : null;

  const valor: ValorDemo = useMemo(
    () => ({ datos, vista, evaluaciones, resumenes, despachar, destacado }),
    [datos, vista, evaluaciones, resumenes, destacado],
  );

  const irAlPaso = (n: number, lista: PasoRecorrido[] = pasos) => {
    setPaso(n);
    const destino = lista[n]?.vista;
    if (destino) despachar({ tipo: "ir", vista: destino });
  };

  const empezarRecorrido = () => (datos.modificada ? setPaso(-1) : irAlPaso(0));

  // Después de reiniciar, los pasos se arman sobre el escenario inicial (los de este render
  // todavía miran los datos modificados).
  const reiniciarYEmpezar = () => {
    const inicial = estadoInicial();
    const ev = evaluarTodos(inicial.datos.comprobantes, inicial.datos.rendiciones);
    const lista = armarPasos(inicial.datos, ev, resumirRendiciones(inicial.datos.rendiciones, inicial.datos.comprobantes, ev));
    despachar({ tipo: "reiniciar" });
    irAlPaso(0, lista);
  };

  const reiniciar = () => {
    despachar({ tipo: "reiniciar" });
    setPaso(null);
  };

  const recorridoAbierto = paso !== null;

  return (
    <ProveedorDemo valor={valor}>
      {/* Con el recorrido abierto, en el celular la barra de acciones del teléfono deja de ir
          pegada abajo (la tarjeta del recorrido la taparía): ver estilos.tsx. */}
      <div className="flex flex-1 flex-col" data-recorrido-abierto={recorridoAbierto ? "" : undefined}>
        <a
          href="#rendi-contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-md focus:bg-surface-raised focus:px-3 focus:py-2 focus:text-sm focus:text-strong focus:shadow-overlay"
        >
          Saltar al contenido
        </a>

        <Encabezado
          rol={vista.rol}
          alCambiarRol={(rol) => despachar({ tipo: "ir", vista: { rol } })}
          onRecorrido={empezarRecorrido}
        />

        <PageContainer className={cn("flex-1", recorridoAbierto && "pb-72 sm:pb-72 lg:pb-9")}>
          <div id="rendi-contenido" tabIndex={-1} className="outline-none">
            <div role="tabpanel" id={idPanel(ID_ROLES, vista.rol)} aria-labelledby={idPestana(ID_ROLES, vista.rol)}>
              {vista.rol === "rinde" ? <RolRinde /> : null}
              {vista.rol === "aprueba" ? <RolAprueba /> : null}
              {vista.rol === "tesoreria" ? <RolTesoreria /> : null}
              {vista.rol === "contador" ? <RolContador /> : null}
            </div>
          </div>
        </PageContainer>

        <footer className="border-t border-line px-4 py-6 text-center text-xs text-muted">
          <p>Rendí · demo sin conexión a SAP ni a ARCA · {escenarioDemo.empresa.razonSocial} es una empresa ficticia</p>
          <p className="mt-1">Elaborado por Gestión Studio Grow</p>
        </footer>
      </div>

      <ConfirmarReinicio onReiniciar={reiniciar} />

      {paso !== null ? (
        <Recorrido
          pasos={pasos}
          paso={paso}
          onIr={(n) => irAlPaso(n)}
          onCerrar={() => setPaso(null)}
          onReiniciarYEmpezar={reiniciarYEmpezar}
        />
      ) : null}
    </ProveedorDemo>
  );
}

function Encabezado({
  rol,
  alCambiarRol,
  onRecorrido,
}: {
  rol: RolRendi;
  alCambiarRol: (rol: RolRendi) => void;
  onRecorrido: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur-md">
      <p className="flex items-center justify-center gap-1.5 border-b border-line bg-surface-sunken px-4 py-1 text-center text-[11.5px] font-medium text-muted">
        <IconoCandado className="size-3.5" />
        Demo con datos ficticios · nada sale de este navegador
      </p>
      <div className="mx-auto flex max-w-[1240px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-8">
        <div className="mr-auto flex min-w-0 items-center gap-2.5">
          <MarcaRendi />
          <h1 className="text-[17px] font-semibold tracking-tight text-strong">
            Rendí<span className="sr-only"> — rendición de gastos integrada a SAP (demo)</span>
          </h1>
          <Badge tone="accent">Demo</Badge>
          <span className="hidden truncate text-sm text-muted lg:inline">{escenarioDemo.empresa.razonSocial}</span>
        </div>
        <Pestanas
          etiqueta="Ver la demo como"
          opciones={ROLES}
          valor={rol}
          alCambiar={alCambiarRol}
          idBase={ID_ROLES}
          variante="segmentado"
          className="order-last w-full md:order-none md:w-auto"
        />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onRecorrido} aria-label="Recorrido guiado">
            <IconoPlay />
            <span className="hidden xl:inline">Recorrido guiado</span>
          </Button>
          <Button variant="ghost" size="sm" popoverTarget={ID_REINICIAR} aria-label="Reiniciar demo">
            <IconoReiniciar />
            <span className="hidden xl:inline">Reiniciar demo</span>
          </Button>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}

/** Confirmación nativa (popover): foco, Escape y clic afuera los resuelve el navegador. */
function ConfirmarReinicio({ onReiniciar }: { onReiniciar: () => void }) {
  return (
    <div
      id={ID_REINICIAR}
      popover="auto"
      role="dialog"
      aria-labelledby={`${ID_REINICIAR}-titulo`}
      className="rendi-popover m-auto w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface-raised p-5 text-body shadow-overlay"
    >
      <p id={`${ID_REINICIAR}-titulo`} className="text-base font-semibold text-strong">
        ¿Reiniciar la demo?
      </p>
      <p className="mt-1.5 text-sm text-muted">
        Todo vuelve a como estaba al principio: rendiciones, comprobantes cargados, aprobaciones y contabilizaciones.
      </p>
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="ghost" size="sm" popoverTarget={ID_REINICIAR} popoverTargetAction="hide">
          Cancelar
        </Button>
        <Button variant="danger" size="sm" popoverTarget={ID_REINICIAR} popoverTargetAction="hide" onClick={onReiniciar}>
          Sí, reiniciar
        </Button>
      </div>
    </div>
  );
}

function MarcaRendi() {
  return (
    <span aria-hidden="true" className="grid size-8 place-items-center rounded-[9px] bg-accent text-on-accent shadow-xs">
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 3.5h9l3 3v14l-2.2-1.4-1.9 1.4-1.9-1.4-1.9 1.4-1.9-1.4L6 20.5z" />
        <path d="m9 12.5 2 2 4-4.5" />
      </svg>
    </span>
  );
}
