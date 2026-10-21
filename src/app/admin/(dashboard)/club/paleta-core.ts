// LA PALETA DEL CLUB (Ctrl/⌘+K o «/») — buscar y hacer desde cualquier pantalla, como la del club de hoy
// (public/previews/breakpoint/club/app.mjs, `itemsPaleta`). PURO: arma la lista; ClubDemo ejecuta lo elegido.
//
// Sin texto: lo de todos los días (nuevo turno, abrir cuenta, ir a hoy y a cada solapa, con su tecla). Con texto:
// turnos de hoy y del día que se mira, clientes (en rojo «debe $X» si deben), cuentas abiertas del buffet y las
// acciones que coinciden. Sólo lo que quien opera puede abrir (las solapas que ve).

import { buscarClientes, cancha as canchaDe, cuentasAbiertas, hhmm, pesos, saldoCuenta } from "@/lib/club/motor.mjs";
import type { EstadoClub } from "@/lib/club/motor.mjs";

export type AccionPaleta =
  | { tipo: "solapa"; id: string }
  | { tipo: "hoy" }
  | { tipo: "nuevoTurno" }
  | { tipo: "abrirCuenta" }
  | { tipo: "turno"; id: string }
  | { tipo: "cliente"; id: string }
  | { tipo: "atajos"; prender: boolean };

export interface ItemPaleta {
  clave: string;
  grupo: "Hacer" | "Ir a" | "Turno" | "Cliente" | "Buffet" | "Ajustes";
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
    ...(ve("buffet") ? [item("a-cuenta", "Hacer", "Abrir cuenta del buffet", { tipo: "abrirCuenta" }, { atajo: atajos ? "C" : "" })] : []),
    ...(ve("agenda") ? [item("a-hoy", "Ir a", "Agenda de hoy", { tipo: "hoy" }, { atajo: atajos ? "T" : "" })] : []),
    ...solapas.map((s, i) => item(`t-${s.id}`, "Ir a", s.etiqueta, { tipo: "solapa", id: s.id }, { atajo: atajos && i < 9 ? String(i + 1) : "" })),
    // WCAG 2.1.4: los atajos de una tecla se pueden apagar (quedan Ctrl/⌘+K y la L de bloquear, que es de seguridad).
    item("a-atajos", "Ajustes", atajos ? "Apagar los atajos de una tecla" : "Prender los atajos de una tecla", { tipo: "atajos", prender: !atajos }),
  ].filter((a) => coincide(a.titulo, a.grupo));
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
  return [...turnos, ...clientes, ...cuentas, ...hacer].slice(0, MAXIMO);
}
