// LA LISTA DE CLIENTES DEL DISEÑO NUEVO — qué filas se ven, en qué orden y cuántas por página.
//
// Todo sale de la URL (?q=, ?situacion=, ?orden=, ?cursor= con el número de página) y se resuelve en el SERVIDOR: al
// navegador llega sólo la página que se mira, no las 2.000 fichas. Las filas son las mismas que
// arma la lista del piloto (`FilaCliente`, con el motor comercial de src/lib/crm): acá no se
// consulta nada ni se calcula plata; sólo se filtra, se ordena y se corta.
//
// Client-safe: sin Prisma ni servidor.
//
// VISTAS PARA ESCRIBIRLES (reingeniería CH, Tanda 2, §3.6 «Clientas: frecuentes, por recuperar,
// cumplen, deben»): además de la situación, cuatro vistas con su número y su WhatsApp armado:
// Frecuentes · Hace mucho (en riesgo + no volvió) · Cumplen (en los próximos 7 días) · Deben
// (saldo de turnos ya prestados). Viajan en `?vista=`; lo que no se entiende se ignora.

import { normalizarTelefono } from "@/lib/clientes/telefono";
import { SEGMENTOS, esSegmento, type Segmento } from "@/lib/crm/segmentos";
import { ordenDesdeUrl, type OrdenTabla } from "@/components/ui/tabla-core";
import { ALIAS_SENIA_PROVISIONAL, mensajeParaVolver, mensajeRecordarSaldo, mensajeSaludo } from "@/lib/turnos/mensajes-whatsapp";

/** Una fila de la lista con situación (diseño nuevo y piloto), armada con el motor comercial. */
export type FilaCliente = {
  id: string;
  nombre: string;
  telefono: string;
  segmento: Segmento;
  diasSinVenir: number | null;
  /** ISO del próximo turno, si tiene. */
  proximoTurno: string | null;
  visitas: number;
  /** «MM-DD» del cumpleaños (de la ficha), si lo tiene. */
  cumple?: string | null;
  /** Lo que debe de turnos ya prestados (0 si nada). Lo calcula el servidor con `esCuentaACobrar`. */
  debe?: number;
};

export const VISTAS = ["frecuentes", "hace-mucho", "cumplen", "deben"] as const;
export type VistaClientes = (typeof VISTAS)[number];

export const VISTA_ETIQUETA: Record<VistaClientes, string> = {
  frecuentes: "Frecuentes",
  "hace-mucho": "Hace mucho",
  cumplen: "Cumplen",
  deben: "Deben",
};

/** «Cumplen»: hoy o en los próximos tantos días. *Provisional a confirmar* con la dueña (¿semana o mes?). */
export const DIAS_PARA_EL_CUMPLE = 7;

export function esVista(v: unknown): v is VistaClientes {
  return typeof v === "string" && (VISTAS as readonly string[]).includes(v);
}

export const TAMANIO_PAGINA = 50;

/** Las columnas que la tabla deja ordenar. «ultima» = días desde la última visita o compra. */
export const ORDENABLES = ["nombre", "ultima", "visitas", "proximo"] as const;

export type ParametrosLista = {
  q: string;
  situacion: Segmento | null;
  orden: OrdenTabla;
  pagina: number;
  /** Una vista para escribirles (opcional: sin ella, todas). */
  vista?: VistaClientes | null;
};

type Sp = Readonly<Record<string, string | string[] | undefined>>;

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Lo que la lista lee de la URL. Lo que no se entiende se ignora (no se inventa un filtro). */
export function leerParametrosLista(sp: Sp): ParametrosLista {
  const q = (uno(sp.q) ?? "").trim().slice(0, 80);
  const s = uno(sp.situacion);
  // La página viaja como `?cursor=` (el nombre que la Tabla ya limpia al cambiar orden o filtro).
  const n = Number.parseInt(uno(sp.cursor) ?? "", 10);
  const v = uno(sp.vista);
  return {
    q,
    situacion: esSegmento(s) ? s : null,
    orden: ordenDesdeUrl(uno(sp.orden), ORDENABLES),
    pagina: Number.isFinite(n) && n >= 1 ? n : 1,
    vista: esVista(v) ? v : null,
  };
}

/**
 * Cuántos días faltan para el cumple (0 = hoy), contando desde `hoy` (AAAA-MM-DD del negocio).
 * Un 29 de febrero, en un año que no es bisiesto, se festeja el 28. `null` sin cumple o mal escrito.
 */
export function diasHastaElCumple(cumple: string | null | undefined, hoy: string): number | null {
  const m = /^(\d{2})-(\d{2})$/.exec(cumple ?? "");
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(hoy);
  if (!m || !h) return null;
  const mes = Number(m[1]);
  const dia = Number(m[2]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const base = Date.UTC(Number(h[1]), Number(h[2]) - 1, Number(h[3]));
  const en = (anio: number) => {
    const bisiesto = (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
    const d = mes === 2 && dia === 29 && !bisiesto ? 28 : dia;
    return Date.UTC(anio, mes - 1, d);
  };
  const anio = Number(h[1]);
  const este = en(anio);
  const proximo = este >= base ? este : en(anio + 1);
  return Math.round((proximo - base) / 86_400_000);
}

/** ¿La fila entra en la vista? */
export function enVista(f: FilaCliente, vista: VistaClientes, hoy: string | null): boolean {
  switch (vista) {
    case "frecuentes":
      return f.segmento === "frecuente";
    case "hace-mucho":
      return f.segmento === "en-riesgo" || f.segmento === "perdida";
    case "cumplen": {
      if (!hoy) return false;
      const d = diasHastaElCumple(f.cumple, hoy);
      return d !== null && d <= DIAS_PARA_EL_CUMPLE;
    }
    case "deben":
      return (f.debe ?? 0) > 0;
  }
}

/** El orden propio de cada vista cuando no se eligió uno: el cumple más cerca, la deuda más grande, la que hace más que no viene. */
function ordenDeVista(filas: FilaCliente[], vista: VistaClientes, hoy: string | null): FilaCliente[] {
  const nombre = (a: FilaCliente, b: FilaCliente) => a.nombre.localeCompare(b.nombre, "es");
  if (vista === "cumplen" && hoy) {
    const d = (f: FilaCliente) => diasHastaElCumple(f.cumple, hoy) ?? Number.POSITIVE_INFINITY;
    return [...filas].sort((a, b) => d(a) - d(b) || nombre(a, b));
  }
  if (vista === "deben") return [...filas].sort((a, b) => (b.debe ?? 0) - (a.debe ?? 0) || nombre(a, b));
  if (vista === "hace-mucho") return [...filas].sort((a, b) => (b.diasSinVenir ?? 0) - (a.diasSinVenir ?? 0) || nombre(a, b));
  return filas;
}

/**
 * El WhatsApp de cada vista, en criollo y sin «undefined» (CH-050). Los textos son los de la agenda
 * (src/lib/turnos/mensajes-whatsapp.ts): «Deben» es el recordatorio de saldo; las demás, invitarla a
 * volver. Sin deuda en «Deben», el saludo solo.
 */
export function textoDeWhatsApp(vista: VistaClientes, f: FilaCliente, hoy: string | null): string {
  switch (vista) {
    case "frecuentes":
      return mensajeParaVolver("frecuente", f.nombre);
    case "hace-mucho":
      return mensajeParaVolver("hace-mucho", f.nombre);
    case "cumplen":
      return mensajeParaVolver(hoy && diasHastaElCumple(f.cumple, hoy) === 0 ? "cumple-hoy" : "cumple-cerca", f.nombre);
    case "deben":
      return mensajeRecordarSaldo({ clienta: f.nombre, saldo: f.debe ?? 0, alias: ALIAS_SENIA_PROVISIONAL }) || mensajeSaludo(f.nombre);
  }
}

function sinTildes(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/**
 * ¿La fila coincide con lo buscado? Por nombre sin tildes ni mayúsculas, o por teléfono: tal
 * como está guardado o de corrido («1155552036» encuentra «11 5555-2036»). La misma regla que la
 * búsqueda que tenía la lista del piloto (y la de siempre: lib/clientes/lista-fichas.server.ts).
 */
export function coincide(f: FilaCliente, q: string): boolean {
  const texto = sinTildes(q.trim());
  if (!texto) return true;
  if (sinTildes(f.nombre).includes(texto) || f.telefono.includes(q.trim())) return true;
  const tel = normalizarTelefono(q);
  return tel !== "" && normalizarTelefono(f.telefono).includes(tel);
}

const porNombre = (a: FilaCliente, b: FilaCliente) => a.nombre.localeCompare(b.nombre, "es");

/**
 * El orden de la lista. Sin orden elegido: las que vinieron hace poco primero (el default de la
 * lista del piloto). Quien nunca vino va al final en «última vez» ascendente y al principio en
 * descendente; quien no tiene turno va al final en «próximo turno» en los dos sentidos.
 */
export function ordenarClientes(filas: readonly FilaCliente[], orden: OrdenTabla): FilaCliente[] {
  const dias = (f: FilaCliente) => f.diasSinVenir ?? Number.POSITIVE_INFINITY;
  const clave = orden?.key ?? "ultima";
  const signo = orden?.direction === "desc" ? -1 : 1;
  const cmp = (a: FilaCliente, b: FilaCliente): number => {
    switch (clave) {
      case "nombre":
        return signo * porNombre(a, b);
      case "visitas":
        return signo * (a.visitas - b.visitas) || porNombre(a, b);
      case "proximo": {
        if (!a.proximoTurno && !b.proximoTurno) return porNombre(a, b);
        if (!a.proximoTurno) return 1;
        if (!b.proximoTurno) return -1;
        return signo * a.proximoTurno.localeCompare(b.proximoTurno) || porNombre(a, b);
      }
      default: {
        const da = dias(a);
        const db = dias(b);
        if (da === db) return porNombre(a, b);
        return signo * (da < db ? -1 : 1);
      }
    }
  };
  return [...filas].sort(cmp);
}

export type PaginaDeClientes = {
  filas: FilaCliente[];
  /** Cuántas coinciden con la búsqueda y la situación (todas las páginas). */
  coinciden: number;
  pagina: number;
  paginas: number;
  /** Cuántas hay por situación, con la búsqueda aplicada: los números de los filtros. */
  porSituacion: Record<Segmento, number>;
  /** Cuántas hay por vista, con la búsqueda aplicada. */
  porVista: Record<VistaClientes, number>;
};

/**
 * Filtrar, ordenar y cortar la página. Una página que no existe muestra la última. `hoy`
 * (AAAA-MM-DD del negocio) hace falta sólo para «Cumplen»; sin él, esa vista queda vacía.
 */
export function paginaDeClientes(todas: readonly FilaCliente[], p: ParametrosLista, hoy: string | null = null): PaginaDeClientes {
  const buscadas = todas.filter((f) => coincide(f, p.q));
  const porSituacion = Object.fromEntries(SEGMENTOS.map((s) => [s, 0])) as Record<Segmento, number>;
  for (const f of buscadas) porSituacion[f.segmento] += 1;
  const porVista = Object.fromEntries(VISTAS.map((v) => [v, buscadas.filter((f) => enVista(f, v, hoy)).length])) as Record<VistaClientes, number>;
  const vista = p.vista ?? null;
  const filtradas = buscadas.filter((f) => (!p.situacion || f.segmento === p.situacion) && (!vista || enVista(f, vista, hoy)));
  const ordenadas = vista && !p.orden ? ordenDeVista(ordenarClientes(filtradas, null), vista, hoy) : ordenarClientes(filtradas, p.orden);
  const paginas = Math.max(1, Math.ceil(ordenadas.length / TAMANIO_PAGINA));
  const pagina = Math.min(p.pagina, paginas);
  const desde = (pagina - 1) * TAMANIO_PAGINA;
  return {
    filas: ordenadas.slice(desde, desde + TAMANIO_PAGINA),
    coinciden: ordenadas.length,
    pagina,
    paginas,
    porSituacion,
    porVista,
  };
}

/** «hace 12 días», «hoy», «nunca vino». Sin «(0 ciclos sin volver)». */
export function ultimaVez(diasSinVenir: number | null, visitaSingular: string): string {
  if (diasSinVenir === null) return visitaSingular === "compra" ? "Nunca compró" : "Nunca vino";
  if (diasSinVenir <= 0) return "Hoy";
  if (diasSinVenir === 1) return "Ayer";
  if (diasSinVenir < 60) return `Hace ${diasSinVenir} días`;
  const meses = Math.floor(diasSinVenir / 30);
  return meses < 12 ? `Hace ${meses} meses` : meses < 24 ? "Hace más de un año" : `Hace ${Math.floor(meses / 12)} años`;
}
