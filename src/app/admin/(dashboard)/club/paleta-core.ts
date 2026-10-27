// LA PALETA DEL CLUB (Ctrl/⌘+K o «/») — buscar y hacer desde cualquier pantalla, como la del club de hoy
// (public/previews/breakpoint/club/app.mjs, `itemsPaleta`). PURO: arma la lista; ClubDemo ejecuta lo elegido.
//
// Sin texto: lo de todos los días (nuevo turno, vender, abrir cuenta, ir a hoy y a cada solapa, con su tecla). Con texto:
// turnos de hoy y del día que se mira, clientes (en rojo «debe $X» si deben), cuentas abiertas del buffet y las
// acciones que coinciden. Sólo lo que quien opera puede abrir (las solapas que ve).
// Tanda 2B: con texto, también la PLATA PENDIENTE de cualquier día que coincide por nombre o celular («Pablo · debe la
// falta del 15/10 · $ 42.000 · Cobrar»); elegirla lleva a la Caja, donde se resuelve con el medio.

import { buscarClientes, cancha as canchaDe, cuentasAbiertas, hhmm, pesos, saldoCuenta } from "@/lib/club/motor.mjs";
import type { EstadoClub, PlataPendiente } from "@/lib/club/motor.mjs";
import { plataQueCoincide } from "./plata-pendiente-core";

export type AccionPaleta =
  | { tipo: "solapa"; id: string }
  | { tipo: "hoy" }
  | { tipo: "nuevoTurno" }
  /** La hoja global «Vender» (lo mismo que el botón de la barra y la tecla V). */
  | { tipo: "vender" }
  | { tipo: "abrirCuenta" }
  | { tipo: "turno"; id: string }
  | { tipo: "cliente"; id: string }
  | { tipo: "atajos"; prender: boolean }
  | { tipo: "ayudaAtajos" };

export interface ItemPaleta {
  clave: string;
  grupo: "Hacer" | "Ir a" | "Plata" | "Turno" | "Cliente" | "Buffet" | "Ajustes" | "Ayuda";
  titulo: string;
  detalle: string;
  /** Debe plata: el detalle va en rojo. */
  rojo: boolean;
  atajo: string;
  accion: AccionPaleta;
}

const normalizar = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const ddmm = (f: string) => `${Number(f.slice(8))}/${Number(f.slice(5, 7))}`;
const MAXIMO = 14;

/** «debe la falta del 15/10 · $ 42.000 · Cobrar» (lo que se lee en la paleta, al lado del nombre). */
export function detalleDePlata(x: PlataPendiente): string {
  const del = x.fecha ? ` del ${ddmm(x.fecha)}` : "";
  switch (x.tipo) {
    case "falta_sin_ficha":
      return `debe la falta${del} · ${pesos(x.monto)} · Cobrar`;
    case "devolucion":
      return `hay que devolverle ${pesos(x.monto)} (turno${del}) · Devolver`;
    case "sena_vencida":
      return `venció la seña${del} · ${pesos(x.monto)} · Cobrar`;
    case "fiado":
      return x.estadoFiado === "aprobado" ? `fiado aprobado ${pesos(x.monto)} · Pasar a su cuenta corriente` : x.estadoFiado === "rechazado" ? `fiado no aprobado · ${pesos(x.monto)} · Cobrar` : `fiado ${pesos(x.monto)} · esperando el OK`;
  }
}

export function armarPaleta(
  estado: EstadoClub,
  { texto, hoy, dia, solapas, atajos = true }: { texto: string; hoy: string; dia: string; solapas: readonly { id: string; etiqueta: string }[]; atajos?: boolean },
): ItemPaleta[] {
  const q = normalizar(texto);
  const coincide = (...t: string[]) => !q || t.some((x) => normalizar(x).includes(q));
  const ve = (id: string) => solapas.some((s) => s.id === id);
  const item = (clave: string, grupo: ItemPaleta["grupo"], titulo: string, accion: AccionPaleta, extra: Partial<ItemPaleta> = {}): ItemPaleta => ({
    clave, grupo, titulo, detalle: "", rojo: false, atajo: "", accion, ...extra,
  });
  const hacer: ItemPaleta[] = [
    ...(ve("agenda") ? [item("a-nuevo", "Hacer", "Nuevo turno", { tipo: "nuevoTurno" }, { atajo: atajos ? "N" : "" })] : []),
    // «Vender» como el botón de la barra y la tecla V: desde cualquier solapa (no depende de cuáles ve quien opera).
    item("a-vender", "Hacer", "Vender", { tipo: "vender" }, { atajo: atajos ? "V" : "", detalle: "venta de mostrador" }),
    ...(ve("buffet") ? [item("a-cuenta", "Hacer", "Abrir cuenta del buffet", { tipo: "abrirCuenta" }, { atajo: atajos ? "C" : "" })] : []),
    ...(ve("agenda") ? [item("a-hoy", "Ir a", "Agenda de hoy", { tipo: "hoy" }, { atajo: atajos ? "T" : "" })] : []),
    ...solapas.map((s, i) => item(`t-${s.id}`, "Ir a", s.etiqueta, { tipo: "solapa", id: s.id }, { atajo: atajos && i < 9 ? String(i + 1) : "" })),
    // WCAG 2.1.4: los atajos de una tecla se pueden apagar (quedan Ctrl/⌘+K y la L de bloquear, que es de seguridad).
    item("a-atajos", "Ajustes", atajos ? "Apagar los atajos de una tecla" : "Prender los atajos de una tecla", { tipo: "atajos", prender: !atajos }),
    // La lista de todos los atajos (la «?» del club de hoy), también desde acá: con los de una tecla apagados, es la entrada.
    item("a-ayuda", "Ayuda", "Atajos de teclado", { tipo: "ayudaAtajos" }, { atajo: atajos ? "?" : "" }),
  ].filter((a) => coincide(a.titulo, a.grupo, ...(a.accion.tipo === "ayudaAtajos" ? ["teclas", "teclado", "ayuda"] : a.accion.tipo === "vender" ? ["venta", "mostrador", "cobrar"] : [])));
  if (!q) return hacer;

  const turnos = estado.reservas
    .filter((r) => (r.fecha === hoy || r.fecha === dia) && ["reservada", "en_cancha", "finalizada"].includes(r.estado))
    .filter((r) => coincide(r.titular, ...r.jugadores.map((j) => j.nombre)))
    .sort((a, b) => a.fecha.localeCompare(b.fecha) || a.inicio - b.inicio)
    .slice(0, 5)
    .map((r) =>
      item(`r-${r.id}`, "Turno", r.titular, { tipo: "turno", id: r.id }, {
        detalle: `${r.fecha === hoy ? "hoy" : ddmm(r.fecha)} ${hhmm(r.inicio)} · ${canchaDe(estado, r.canchaId)?.nombre ?? ""}`,
      }),
    );
  const clientes = ve("clientes")
    ? buscarClientes(estado, texto.trim())
        .slice(0, 5)
        .map((c) =>
          item(`c-${c.id}`, "Cliente", c.nombre, { tipo: "cliente", id: c.id }, {
            detalle: c.deuda > 0 ? `debe ${pesos(c.deuda)}` : c.tel || "",
            rojo: c.deuda > 0,
          }),
        )
    : [];
  const cuentas = ve("buffet")
    ? cuentasAbiertas(estado)
        .filter((c) => c.titular !== "Mostrador" && coincide(c.titular))
        .slice(0, 3)
        .map((c) => item(`b-${c.id}`, "Buffet", `Cuenta de ${c.titular}`, c.reservaId && !c.reservaId.startsWith("mostrador") ? { tipo: "turno", id: c.reservaId } : { tipo: "solapa", id: "buffet" }, { detalle: pesos(saldoCuenta(c)) }))
    : [];
  const plata = ve("caja")
    ? plataQueCoincide(estado, texto)
        .slice(0, 4)
        .map((x) => item(`p-${x.clave}`, "Plata", x.nombre, { tipo: "solapa", id: "caja" }, { detalle: detalleDePlata(x), rojo: x.sentido === "entra" }))
    : [];
  return [...plata, ...turnos, ...clientes, ...cuentas, ...hacer].slice(0, MAXIMO);
}

/** Una fila de la ayuda de atajos: las teclas (cada una en su <kbd>) y qué hacen. */
export interface AtajoDelClub {
  teclas: readonly string[];
  que: string;
  /** Es de una sola tecla (se apaga con «Apagar los atajos de una tecla», WCAG 2.1.4). */
  unaTecla: boolean;
}

/**
 * La lista de atajos del club, como `ayudaAtajos` del club de hoy. `mac`: ⌘ en vez de Ctrl. `unaTecla`: si están
 * prendidos los de una tecla (si no, no se listan: no andan). PURA.
 */
export function atajosDelClub({ mac = false, unaTecla = true }: { mac?: boolean; unaTecla?: boolean } = {}): AtajoDelClub[] {
  const ctrl = mac ? "⌘" : "Ctrl";
  const todos: AtajoDelClub[] = [
    { teclas: [ctrl, "K"], que: "Buscar y hacer (turnos, clientes, cuentas, acciones)", unaTecla: false },
    { teclas: ["/"], que: "Lo mismo, con una sola tecla", unaTecla: true },
    { teclas: ["N"], que: "Nuevo turno", unaTecla: true },
    { teclas: ["V"], que: "Vender (la venta de mostrador, desde cualquier solapa)", unaTecla: true },
    { teclas: ["C"], que: "Abrir cuenta del buffet", unaTecla: true },
    { teclas: ["←", "→"], que: "Día anterior / siguiente en la agenda", unaTecla: true },
    { teclas: ["T"], que: "Volver a hoy", unaTecla: true },
    { teclas: ["1", "…", "9"], que: "Ir a cada solapa", unaTecla: true },
    { teclas: [ctrl, "Z"], que: "Deshacer lo último (mientras se ve el aviso con «Deshacer»)", unaTecla: false },
    { teclas: ["L"], que: "Bloquear la pantalla (en la jornada real)", unaTecla: false },
    { teclas: ["?"], que: "Esta lista de atajos", unaTecla: true },
    { teclas: ["Esc"], que: "Cerrar la ventana", unaTecla: false },
  ];
  return unaTecla ? todos : todos.filter((a) => !a.unaTecla);
}
