// ============================================================================
// DAR UN TURNO en el orden de la llamada — lo que se decide sin DOM. PURO, client-safe.
// ============================================================================
//
// La recepcionista atiende el teléfono: «Hola, soy Camila Ortiz, quería un peeling para el jueves».
// El orden de esa frase es el del alta: QUIÉN → QUÉ → CUÁNDO (cualquier profesional que lo haga) →
// CON QUIÉN, si hay más de una libre. El alta de siempre pedía primero la profesional y después el
// servicio, y la fecha y el horario de UNA profesional: para ofrecer «el jueves hay a las 15 con
// Carla o a las 16 con Marina» había que probar profesional por profesional.
//
// Acá: los servicios del negocio (una vez cada uno, con quién lo hace), los horarios libres de todas
// las que lo hacen juntos, y los CAMPOS que viajan a `createManualAppointment`, los mismos que el
// alta de siempre (alta-core.test.ts los compara con los que lee la acción).

import { importeParaFormulario } from "@/lib/pos-peso";
import { businessWallTimeToUtc } from "@/lib/datetime";
import { normalizarTelefono } from "@/lib/clientes/telefono";
import type { FichaParaAlta } from "@/lib/clientes/ficha-por-telefono";
import { METODO_LABEL, type MetodoDePago } from "@/lib/turnos/cobros";
import { linkWhatsApp, mensajeConfirmacion, mensajePedidoDeSenia, pesosEnTexto } from "@/lib/turnos/mensajes-whatsapp";
import type { Campos } from "./campos";

export type ServicioDeProfesional = {
  id: string;
  name: string;
  durationMin: number;
  price: number;
  residentPrice: number | null;
  depositAmount: number | null;
};

export type ProfesionalDelAlta = {
  id: string;
  name: string;
  box: { name: string } | null;
  cobraEnMostrador?: boolean;
  services: ServicioDeProfesional[];
};

export type ServicioDelNegocio = ServicioDeProfesional & { profesionales: string[] };

/** Cada servicio una vez, con las profesionales que lo hacen, por nombre. */
export function serviciosDelNegocio(profesionales: readonly ProfesionalDelAlta[]): ServicioDelNegocio[] {
  const porId = new Map<string, ServicioDelNegocio>();
  for (const p of profesionales) {
    for (const s of p.services) {
      const ya = porId.get(s.id);
      if (ya) ya.profesionales.push(p.id);
      else porId.set(s.id, { ...s, profesionales: [p.id] });
    }
  }
  return [...porId.values()].sort((a, b) => a.name.localeCompare(b.name, "es"));
}

export type HorarioLibre = { inicio: string; profesionales: string[] };

/**
 * Los horarios libres de todas las profesionales juntos: cada horario una vez, con quiénes están
 * libres a esa hora, en el orden de las profesionales que se pasaron (la primera es la propuesta).
 */
export function horariosLibres(porProfesional: Readonly<Record<string, readonly string[]>>, orden: readonly string[]): HorarioLibre[] {
  const porHora = new Map<string, string[]>();
  for (const id of orden) {
    for (const inicio of porProfesional[id] ?? []) {
      const lista = porHora.get(inicio);
      if (lista) lista.push(id);
      else porHora.set(inicio, [id]);
    }
  }
  return [...porHora.entries()]
    .map(([inicio, profesionales]) => ({ inicio, profesionales }))
    .sort((a, b) => new Date(a.inicio).getTime() - new Date(b.inicio).getTime());
}

export type Franja = "De mañana" | "De tarde" | "De noche";

/**
 * Los horarios libres partidos en renglones por franja, en orden y sin franjas vacías. La hora se
 * lee con el MISMO formateador que dibuja el botón (la del negocio, «HH:MM»), así un horario nunca
 * cae en una franja que no coincide con lo que dice: antes de las 13 es mañana, antes de las 19 es
 * tarde, de ahí en más noche.
 */
export function franjasDeHorarios<H extends { inicio: string }>(horarios: readonly H[], hora: (inicio: string) => string): { franja: Franja; horarios: H[] }[] {
  const franjas: { franja: Franja; horarios: H[] }[] = [
    { franja: "De mañana", horarios: [] },
    { franja: "De tarde", horarios: [] },
    { franja: "De noche", horarios: [] },
  ];
  for (const h of horarios) {
    const hhmm = hora(h.inicio);
    franjas[hhmm < "13:00" ? 0 : hhmm < "19:00" ? 1 : 2].horarios.push(h);
  }
  return franjas.filter((f) => f.horarios.length > 0);
}

/** Los próximos días para elegir con un toque (hoy incluido). */
export function diasParaElegir(hoy: string, cuantos: number): string[] {
  const base = new Date(`${hoy}T12:00:00.000Z`);
  return Array.from({ length: cuantos }, (_, i) => new Date(base.getTime() + i * 86_400_000).toISOString().slice(0, 10));
}

export type AltaParaMandar = {
  profesionalId: string;
  servicioId: string;
  /** ISO del horario elegido (el que devolvió `getAvailableSlots`). */
  inicio: string;
  nombre: string;
  telefono: string;
  deLaZona: boolean;
  cupon: string;
  /** Cobrar algo en el acto: el monto y el medio. `null` = no se cobra nada ahora. */
  cobro: { monto: number; metodo: string } | null;
  estado: "PENDING" | "CONFIRMED";
  notas: string;
};

/**
 * Los campos de `createManualAppointment`, con los nombres de siempre (`senaCobrar`/`senaMonto`/
 * `senaMetodo` aunque se cobre el total: así los lee el servidor). «De la zona» viaja sólo tildado,
 * como un checkbox; el monto, en la forma canónica.
 */
export function camposDelAlta(a: AltaParaMandar): Campos {
  const c: [string, string][] = [
    ["professionalId", a.profesionalId],
    ["serviceId", a.servicioId],
    ["startsAt", a.inicio],
    ["clientName", a.nombre.trim()],
    ["clientPhone", a.telefono.trim()],
  ];
  if (a.deLaZona) c.push(["isResident", "on"]);
  c.push(["couponCode", a.cupon.trim()]);
  if (a.cobro && a.cobro.monto > 0) {
    c.push(["senaCobrar", "on"], ["senaMonto", importeParaFormulario(a.cobro.monto)], ["senaMetodo", a.cobro.metodo]);
  }
  c.push(["status", a.estado], ["notes", a.notas]);
  return c;
}

/** ¿Qué falta para poder dar el turno? (en el orden de la llamada). `null` = nada. */
export function queFalta(p: { nombre: string; telefono: string; servicioId: string; inicio: string; profesionalId: string }): string | null {
  if (!p.nombre.trim() || !p.telefono.trim()) return "Falta quién: el nombre y el teléfono.";
  if (!p.servicioId) return "Falta qué servicio.";
  if (!p.inicio) return "Falta el día y la hora.";
  if (!p.profesionalId) return "Falta con quién.";
  return null;
}

// ============================================================================
// REINGENIERÍA CH · TANDA 2 — «Dar turno» en ≤ 7 toques (ch-DISENO.md §2.3, §3.1).
// ============================================================================
//
// Qué → Cuándo (7 días con cuántos huecos tiene cada uno, mañana / tarde, «primer hueco libre») →
// Con quién (sólo si a esa hora hay más de una) → Quién (UN campo: buscar o «+ Nueva») → Seña en
// tres teclas (Ya la mandó · Pedírsela por WhatsApp · Sin seña) → Listo ✓ con el WhatsApp armado.
// Todo lo que se decide sin pantalla vive acá, con test (alta-core.test.ts).

/** Los horarios libres de varios días: profesional → día «YYYY-MM-DD» → inicios ISO. */
export type HuecosPorProfesional = Readonly<Record<string, Readonly<Record<string, readonly string[]>>>>;

/** Los horarios de UN día, de todas las profesionales juntas (cada hora una vez, con quiénes). */
export function horariosDelDia(huecos: HuecosPorProfesional, orden: readonly string[], dia: string): HorarioLibre[] {
  const porProfesional: Record<string, readonly string[]> = {};
  for (const id of orden) porProfesional[id] = huecos[id]?.[dia] ?? [];
  return horariosLibres(porProfesional, orden);
}

/** Cuántos horarios distintos hay cada día (lo que dice el chip: «jue 24 · 6»). */
export function conteoPorDia(huecos: HuecosPorProfesional, orden: readonly string[], dias: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of dias) out[d] = horariosDelDia(huecos, orden, d).length;
  return out;
}

/** El primer hueco libre de los días dados (en orden), con quiénes están libres. `null` si no hay. */
export function primerHuecoLibre(
  huecos: HuecosPorProfesional,
  orden: readonly string[],
  dias: readonly string[],
): { dia: string; horario: HorarioLibre } | null {
  for (const dia of dias) {
    const [primero] = horariosDelDia(huecos, orden, dia);
    if (primero) return { dia, horario: primero };
  }
  return null;
}

/** Sólo los horarios de una franja («De tarde»); sin franja, todos. */
export function filtrarPorFranja<H extends { inicio: string }>(horarios: readonly H[], franja: Franja | null, hora: (inicio: string) => string): H[] {
  if (!franja) return [...horarios];
  return franjasDeHorarios(horarios, hora).find((f) => f.franja === franja)?.horarios ?? [];
}

/** El instante (ISO) de una hora de pared del negocio: «2026-10-24» + «16:00». "" si no se puede. */
export function inicioDeLaHora(dia: string, hora: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia) || !/^\d{2}:\d{2}$/.test(hora)) return "";
  const d = businessWallTimeToUtc(dia, hora);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

/**
 * El horario que pidió el hueco tocado (CH-029): si está entre los libres y la profesional del
 * hueco está libre a esa hora, se elige solo con ella. Si no (el servicio no entra ahí), `null`.
 */
export function horarioDelHueco(horarios: readonly HorarioLibre[], inicio: string, profesionalId: string): { inicio: string; profesionalId: string } | null {
  if (!inicio) return null;
  const t = new Date(inicio).getTime();
  const h = horarios.find((x) => new Date(x.inicio).getTime() === t);
  if (!h) return null;
  if (profesionalId) return h.profesionales.includes(profesionalId) ? { inicio: h.inicio, profesionalId } : null;
  return { inicio: h.inicio, profesionalId: h.profesionales[0] ?? "" };
}

/**
 * «Atender ahora» (CH-019): el comienzo de la franja en la que cae el reloj. Las franjas son de 30′
 * (el paso del motor de horarios) y la zona del negocio tiene horas enteras de diferencia con UTC,
 * así que cortar el instante cada 30′ da 11:00 a las 11:05.
 */
export function franjaDeAhora(ahora: Date, pasoMin = 30): string {
  const paso = pasoMin * 60_000;
  return new Date(Math.floor(ahora.getTime() / paso) * paso).toISOString();
}

// ── Quién: un solo campo ─────────────────────────────────────────────────────

/** Sin tildes, en minúscula, espacios simples: «Laura  Gómez» → «laura gomez». */
export function nombreComparable(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Las fichas que coinciden con lo tipeado: por nombre (todas las palabras, sin tildes) o por
 * teléfono (3 o más dígitos seguidos del número normalizado). Primero las que empiezan igual o
 * coinciden por teléfono, después las de más turnos. Vacío → ninguna.
 */
export function buscarFichas(fichas: readonly FichaParaAlta[], texto: string, max = 6): FichaParaAlta[] {
  const q = nombreComparable(texto);
  if (!q) return [];
  const digitos = texto.replace(/\D/g, "");
  const palabras = q.split(" ");
  const puntaje = (f: FichaParaAlta): number => {
    const nombre = nombreComparable(f.nombre);
    if (digitos.length >= 3 && digitos.length === texto.replace(/[\s()+-]/g, "").length) {
      const tel = normalizarTelefono(f.telefono);
      const clave = normalizarTelefono(digitos);
      if (clave && tel.includes(clave)) return 3;
      if (tel.includes(digitos)) return 2;
      return 0;
    }
    if (!palabras.every((p) => nombre.includes(p))) return 0;
    return nombre.startsWith(q) || nombre.split(" ").some((w) => w.startsWith(palabras[0])) ? 2 : 1;
  };
  return fichas
    .map((f) => ({ f, p: puntaje(f) }))
    .filter((x) => x.p > 0)
    .sort((a, b) => b.p - a.p || b.f.turnos - a.f.turnos || a.f.nombre.localeCompare(b.f.nombre, "es"))
    .slice(0, max)
    .map((x) => x.f);
}

/**
 * «¿Es Laura Gómez (11 5566…)?» (CH-020): al cargar una clienta NUEVA, la ficha que ya existe con
 * el mismo nombre (sin tildes ni mayúsculas, mismas palabras en cualquier orden) y OTRO teléfono.
 * Si el teléfono es el mismo, no es un parecido: es ella (lo reconoce `fichaParaTelefono`).
 */
export function fichaParecida(fichas: readonly FichaParaAlta[], nombre: string, telefono: string): FichaParaAlta | null {
  const clave = (s: string) => nombreComparable(s).split(" ").filter(Boolean).sort().join(" ");
  const buscado = clave(nombre);
  if (!buscado || !buscado.includes(" ")) return null; // con un solo nombre («Laura») hay demasiadas
  const tel = normalizarTelefono(telefono);
  return fichas.find((f) => clave(f.nombre) === buscado && (!tel || normalizarTelefono(f.telefono) !== tel)) ?? null;
}

/** «11 5566…»: el teléfono recortado para el aviso de parecido (no se muestra entero a la vista de todos). */
export function telefonoRecortado(telefono: string): string {
  const k = normalizarTelefono(telefono);
  if (k.length !== 10) return telefono.trim().slice(0, 7) + (telefono.trim().length > 7 ? "…" : "");
  const area = k.startsWith("11") ? 2 : 3;
  return `${k.slice(0, area)} ${k.slice(area, area + 4)}…`;
}

/** El teléfono de una clienta NUEVA como se guarda: los 10 dígitos normalizados si es un número argentino. */
export function telefonoParaGuardar(telefono: string): string {
  const k = normalizarTelefono(telefono);
  return k.length === 10 ? k : telefono.trim();
}

// ── La seña en tres teclas ───────────────────────────────────────────────────

export type EleccionSenia = "ya" | "pedir" | "sin";

/** El medio con que suele llegar la seña (decisión de diseño §3.1: editable en la misma tecla). */
export const MEDIO_DE_LA_SENIA: MetodoDePago = "TRANSFERENCIA";

/**
 * Lo que la elección de la seña decide del alta. El estado NO se pregunta: seña cobrada ⇒
 * Confirmado; pedida o sin seña ⇒ Reservado (salvo que se marque «Ya confirmó» a mano).
 * «Ya la mandó» sólo cobra si quien da el turno puede cobrarle a esa profesional.
 */
export function decisionDeLaSenia(p: {
  senia: number;
  eleccion: EleccionSenia | null;
  medio: MetodoDePago | null;
  puedeCobrar: boolean;
  yaConfirmo?: boolean;
}): { cobro: { monto: number; metodo: MetodoDePago } | null; estado: "PENDING" | "CONFIRMED"; pedirSenia: boolean } {
  const cobra = p.eleccion === "ya" && p.puedeCobrar && p.senia > 0 && p.medio !== null;
  return {
    cobro: cobra && p.medio ? { monto: p.senia, metodo: p.medio } : null,
    estado: cobra || p.yaConfirmo ? "CONFIRMED" : "PENDING",
    pedirSenia: p.eleccion === "pedir" && p.senia > 0,
  };
}

/** ¿Falta elegir qué pasa con la seña? (sólo si el servicio pide seña). */
export function faltaLaSenia(senia: number, eleccion: EleccionSenia | null): string | null {
  return senia > 0 && eleccion === null ? "Falta la seña: ¿ya la mandó, se la pedís o va sin seña?" : null;
}

// ── Listo ✓ ──────────────────────────────────────────────────────────────────

export type TurnoDado = {
  clienta: string;
  telefono: string;
  servicio: string;
  durationMin: number;
  inicio: string;
  profesional: string;
  precio: number;
  senia: number;
  eleccion: EleccionSenia | null;
  medio: MetodoDePago | null;
  /** ¿Se cobró de verdad la seña al dar el turno? */
  cobrada: boolean;
  direccion?: string | null;
  alias?: string | null;
};

/**
 * La pantalla «Listo ✓»: el estado en una línea («Confirmado · seña $5.000 por transferencia ·
 * falta $9.000»), la tecla de WhatsApp que corresponde y su link. Con seña pedida la tecla manda el
 * pedido (monto + alias); si no, la confirmación. `wa` es `null` si el teléfono no es un celular.
 */
export function listoDelTurno(t: TurnoDado): { estado: string; tecla: string; texto: string; wa: string | null } {
  const turno = { clienta: t.clienta, servicios: t.servicio, inicio: t.inicio, profesional: t.profesional, direccion: t.direccion };
  let estado: string;
  let tecla: string;
  let texto: string;
  if (t.cobrada && t.senia > 0) {
    const medio = t.medio ? ` por ${METODO_LABEL[t.medio].toLowerCase()}` : "";
    const falta = Math.max(0, t.precio - t.senia);
    estado = `Confirmado · seña ${pesosEnTexto(t.senia)}${medio}${falta > 0 ? ` · falta ${pesosEnTexto(falta)}` : " · pagado"}`;
    tecla = "Mandar confirmación por WhatsApp";
    texto = mensajeConfirmacion({ ...turno, senia: { monto: t.senia, medio: t.medio } });
  } else if (t.eleccion === "pedir" && t.senia > 0) {
    estado = `Reservado · seña de ${pesosEnTexto(t.senia)} pedida`;
    tecla = "Pedirle la seña por WhatsApp";
    texto = mensajePedidoDeSenia({ ...turno, monto: t.senia, alias: t.alias });
  } else {
    estado = t.senia > 0 ? "Reservado · sin seña" : "Reservado";
    tecla = "Mandar confirmación por WhatsApp";
    texto = mensajeConfirmacion({ ...turno, senia: null });
  }
  return { estado, tecla, texto, wa: linkWhatsApp(t.telefono, texto) };
}

/**
 * ¿Qué falta para dar el turno?, en el orden de la pantalla nueva (qué → cuándo → con quién →
 * quién → seña). `null` = nada: la tecla «Dar turno» se habilita.
 */
export function queFaltaParaDar(p: {
  servicioId: string;
  inicio: string;
  profesionalId: string;
  nombre: string;
  telefono: string;
  senia: number;
  eleccion: EleccionSenia | null;
}): string | null {
  if (!p.servicioId) return "Falta qué servicio.";
  if (!p.inicio) return "Falta el día y la hora.";
  if (!p.profesionalId) return "Falta con quién.";
  if (!p.nombre.trim() || !p.telefono.trim()) return "Falta quién: el nombre y el teléfono.";
  return faltaLaSenia(p.senia, p.eleccion);
}

/** «hace 32 días» · «hoy» · «ayer» (de la última visita, contra el día de hoy del negocio). */
export function haceCuanto(fechaIso: string, hoy: string): string {
  const desde = Date.parse(`${fechaIso.slice(0, 10)}T12:00:00.000Z`);
  const hasta = Date.parse(`${hoy}T12:00:00.000Z`);
  if (!Number.isFinite(desde) || !Number.isFinite(hasta)) return "";
  const dias = Math.round((hasta - desde) / 86_400_000);
  if (dias <= 0) return "hoy";
  if (dias === 1) return "ayer";
  return `hace ${dias} días`;
}
