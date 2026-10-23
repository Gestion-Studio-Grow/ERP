// ============================================================================
// EL REPARTO DEL CADETE — armar la salida y rendirla, decidido sin base ni React.
// ============================================================================
//
// Reingeniería Magra, tanda 2 · 2C (magra-DISENO.md §2.2, E10 dueño, MG-055/056). Lo que hoy se
// hace con un papelito: juntar los envíos de una franja, ordenarlos por zona, dárselos al cadete
// (impreso o por WhatsApp) y, cuando vuelve, rendir pedido por pedido lo que cobró y con qué.
//
// SIN MIGRACIÓN. «Salió con el cadete» no es un estado del pedido: es una marca en la auditoría del
// pedido (AuditLog, entity "Order", action `ACCION_REPARTO`), una fila por movimiento:
//   · { tipo: "salio",   reparto, franja, cadete }  → el pedido (Listo) está en la calle;
//   · { tipo: "volvio",  reparto, motivo }          → volvió sin entregar: otra vez a Listos;
//   · { tipo: "rendido", reparto, resultado, pagos } → se rindió (cobrado, ya pago o a cobrar).
// Manda la ÚLTIMA fila de cada pedido (`estadoDelReparto`). El cobro y la entrega los hacen las
// acciones de siempre (`cobrarPedido`, `entregarPedido`): acá no se mueve plata.
//
// PURO: lo usan la bandeja (tablero.server.ts), las pantallas del reparto y los tests.

import { dateStrInBusinessTz, fmtTime } from "@/lib/datetime";
import { esNombreDeEnvio } from "@/lib/venta-reglas";
import { horasDeLaFranja } from "@/app/tienda/reglas-tienda";
import { waLinkClienta } from "@/lib/whatsapp-cta";
import { textoPlata } from "@/lib/cobro/pie-de-cobro-core";
import { MEDIOS_DE_COBRO, type MedioDeCobro } from "@/lib/caja/medio-cobro";
import { resumenDeLineas } from "../pedidos-core";
import { mensajeEntregaSinAppDeFiado } from "@/lib/clientes/fiado";

/** La acción de AuditLog de las marcas del reparto (entity "Order", entityId = id del pedido). */
export const ACCION_REPARTO = "reparto";

// ── Las marcas ────────────────────────────────────────────────────────────────

export type ResultadoDeRendicion = "cobrado" | "ya-pago" | "a-cobrar";

export type MarcaDeReparto =
  | { tipo: "salio"; reparto: string; franja: string | null; cadete: string | null }
  | { tipo: "volvio"; reparto: string; motivo: string }
  | {
      tipo: "rendido";
      reparto: string;
      resultado: ResultadoDeRendicion;
      code: number;
      cliente: string;
      total: number;
      /** Lo que entró por cada medio (cobrado). Vacío si ya estaba pago o quedó a cobrar. */
      pagos: { medio: MedioDeCobro; monto: number }[];
      /**
       * «A cobrar» con el fiado prendido (2D) y el pedido con ficha: la deuda quedó en la cuenta del
       * cliente (`AccountReceivable`), no en la columna A cobrar. Sólo se escribe si es así.
       */
      aCuenta?: true;
    };

const MEDIOS: ReadonlySet<string> = new Set(MEDIOS_DE_COBRO.map((m) => m.valor));

/** Lee una marca guardada sin confiar en ella: lo que no tiene la forma es `null`. PURA. */
export function leerMarcaDeReparto(changes: unknown): MarcaDeReparto | null {
  if (!changes || typeof changes !== "object") return null;
  const c = changes as Record<string, unknown>;
  const reparto = typeof c.reparto === "string" ? c.reparto : null;
  if (!reparto) return null;
  const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  if (c.tipo === "salio") return { tipo: "salio", reparto, franja: texto(c.franja), cadete: texto(c.cadete) };
  if (c.tipo === "volvio") return { tipo: "volvio", reparto, motivo: texto(c.motivo) ?? "Volvió sin entregar" };
  if (c.tipo === "rendido") {
    const resultado = c.resultado === "cobrado" || c.resultado === "ya-pago" || c.resultado === "a-cobrar" ? c.resultado : null;
    if (!resultado) return null;
    const pagos = Array.isArray(c.pagos)
      ? c.pagos.flatMap((p) => {
          const x = p as { medio?: unknown; monto?: unknown };
          const monto = Number(x.monto);
          return typeof x.medio === "string" && MEDIOS.has(x.medio) && Number.isFinite(monto) && monto > 0
            ? [{ medio: x.medio as MedioDeCobro, monto }]
            : [];
        })
      : [];
    return {
      tipo: "rendido",
      reparto,
      resultado,
      code: Number(c.code) || 0,
      cliente: texto(c.cliente) ?? "",
      total: Number(c.total) || 0,
      pagos,
      ...(resultado === "a-cobrar" && c.aCuenta === true ? { aCuenta: true as const } : {}),
    };
  }
  return null;
}

export type FilaDeMarca = { entityId: string | null; createdAt: Date; changes: unknown };

/**
 * La última marca de cada pedido (la que manda). PURA. Las filas pueden venir en cualquier orden:
 * se ordenan por fecha (a igual fecha, la que llega después gana, como en la base con el id).
 */
export function estadoDelReparto(filas: readonly FilaDeMarca[]): Map<string, { marca: MarcaDeReparto; cuando: Date }> {
  const out = new Map<string, { marca: MarcaDeReparto; cuando: Date }>();
  const ordenadas = filas.map((f, i) => ({ f, i })).sort((a, b) => a.f.createdAt.getTime() - b.f.createdAt.getTime() || a.i - b.i);
  for (const { f } of ordenadas) {
    if (!f.entityId) continue;
    const marca = leerMarcaDeReparto(f.changes);
    if (marca) out.set(f.entityId, { marca, cuando: f.createdAt });
  }
  return out;
}

/** ¿Está en la calle? Listo y con la última marca de salida. PURA. */
export function estaEnReparto(status: string, ultima: { marca: MarcaDeReparto } | undefined): boolean {
  return status === "READY" && ultima?.marca.tipo === "salio";
}

/** Un id para la salida: con la hora en base 36 y un sufijo; sólo agrupa la rendición. PURA (recibe el azar). */
export function idDeReparto(ahora: Date, azar: number): string {
  return `rep_${ahora.getTime().toString(36)}_${Math.floor(Math.abs(azar) * 36 ** 4).toString(36).padStart(4, "0")}`;
}

// ── La zona y la franja de cada pedido ──────────────────────────────────────────

/**
 * La zona del envío. La tienda la escribe al frente de la nota («Zona: Canning – barrios cerrados ·
 * Franja: …», `notaDelPedido`); el mostrador la deja en el renglón del envío («Envío · <zona>»,
 * `renglonDeEnvio`). Sin ninguna de las dos (envío gratis tomado en el mostrador), null. PURA.
 */
export function zonaDelPedido(p: { notas: string | null; lineas: readonly { productId: string | null; nombre: string }[] }): string | null {
  const deLaNota = /(?:^|·)\s*Zona:\s*([^·]+?)\s*(?:·|$)/.exec(p.notas ?? "");
  if (deLaNota?.[1]) return deLaNota[1].trim();
  for (const l of p.lineas) {
    if (l.productId != null || !esNombreDeEnvio(l.nombre)) continue;
    const m = /^env[ií]o\s*·\s*(.+)$/i.exec(l.nombre.trim());
    if (m?.[1]) return m[1].trim();
  }
  return null;
}

/** Lo que escribió la clienta, sin la zona ni la franja que la tienda pone adelante. PURA. */
export function notaDeLaClienta(notas: string | null): string | null {
  if (!notas) return null;
  const resto = notas
    .split(" · ")
    .map((s) => s.trim())
    .filter((s) => s && !/^Zona:/.test(s) && !/^Franja:/.test(s));
  return resto.length ? resto.join(" · ") : null;
}

export type FranjaDelPedido = {
  /** AAAA-MM-DD del negocio, o null si el pedido no tiene día. */
  dia: string | null;
  desde: string | null;
  hasta: string | null;
  /** Para agrupar: día + horas. */
  clave: string;
  /** «17–19 h», «desde 10:30», «Sin horario». */
  texto: string;
};

/** «17:00» → «17»; «17:30» → «17:30». */
function horaCorta(h: string): string {
  return h.endsWith(":00") ? String(Number(h.slice(0, 2))) : h.replace(/^0/, "");
}

/** «17–19 h» / «desde 10:30» / «Sin horario». PURA. */
export function textoDeFranja(desde: string | null, hasta: string | null): string {
  if (desde && hasta) return `${horaCorta(desde)}–${horaCorta(hasta)} h`;
  if (desde) return `desde ${desde}`;
  return "Sin horario";
}

/**
 * La franja de un envío. La tienda guarda el comienzo de la franja en `scheduledFor` y la franja
 * escrita en la nota («Franja: L-S 17-19 (hoy 22/10)»); el mostrador sólo el horario. PURA.
 */
export function franjaDelPedido(p: { notas: string | null; horario: Date | string | null }): FranjaDelPedido {
  const horario = p.horario ? new Date(p.horario) : null;
  const valido = horario && Number.isFinite(horario.getTime()) ? horario : null;
  const dia = valido ? dateStrInBusinessTz(valido) : null;
  const escrita = /Franja:\s*([^(·]+?)\s*(?:\(|·|$)/.exec(p.notas ?? "")?.[1] ?? null;
  const horas = escrita ? horasDeLaFranja(escrita) : null;
  const desde = horas?.desde ?? (valido ? fmtTime(valido) : null);
  const hasta = horas?.hasta ?? null;
  return { dia, desde, hasta, clave: `${dia ?? "sin-dia"}|${desde ?? ""}|${hasta ?? ""}`, texto: textoDeFranja(desde, hasta) };
}

// ── Lo que entra al reparto ─────────────────────────────────────────────────────

/** Un envío como lo lee el servidor (serializable). */
export type EnvioLeido = {
  id: string;
  code: number;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  notas: string | null;
  /** ISO del comienzo de la franja, o null. */
  horario: string | null;
  status: string;
  cobrado: boolean;
  total: number;
  lineas: { productId: string | null; nombre: string; unidad: "UNIT" | "WEIGHT"; cantidad: number }[];
};

export type EnvioDelReparto = {
  id: string;
  code: number;
  cliente: string;
  telefono: string | null;
  direccion: string | null;
  nota: string | null;
  status: string;
  /** Listo para salir (los demás se ven, pero no salen). */
  listo: boolean;
  cobrado: boolean;
  total: number;
  zona: string | null;
  franja: FranjaDelPedido;
  resumen: string;
  /** Ya salió con el cadete (y no volvió ni se rindió): con qué salida y desde cuándo. */
  salida: { reparto: string; desde: string; cadete: string | null } | null;
};

/** El envío listo para mostrar, con su zona, su franja y si ya salió. PURA. */
export function envioDelReparto(e: EnvioLeido, ultima: { marca: MarcaDeReparto; cuando: Date } | undefined): EnvioDelReparto {
  const enLaCalle = estaEnReparto(e.status, ultima) && ultima?.marca.tipo === "salio";
  return {
    id: e.id,
    code: e.code,
    cliente: e.cliente,
    telefono: e.telefono,
    direccion: e.direccion,
    nota: notaDeLaClienta(e.notas),
    status: e.status,
    listo: e.status === "READY",
    cobrado: e.cobrado,
    total: e.total,
    zona: zonaDelPedido({ notas: e.notas, lineas: e.lineas }),
    franja: franjaDelPedido({ notas: e.notas, horario: e.horario }),
    resumen: resumenDeLineas(e.lineas),
    salida:
      enLaCalle && ultima && ultima.marca.tipo === "salio"
        ? { reparto: ultima.marca.reparto, desde: fmtTime(ultima.cuando), cadete: ultima.marca.cadete }
        : null,
  };
}

export type FranjaDelDia = { clave: string; texto: string; desde: string | null; envios: number; listos: number; aSalir: number };

/**
 * Las franjas de un día con cuántos envíos tiene cada una (las chips de «Armar reparto»). Los
 * envíos sin día («Sin horario») se suman a cualquier día: alguien los tiene que llevar. PURA.
 */
export function franjasDelDia(envios: readonly EnvioDelReparto[], dia: string): FranjaDelDia[] {
  const porClave = new Map<string, FranjaDelDia>();
  for (const e of envios) {
    if (e.franja.dia !== null && e.franja.dia !== dia) continue;
    const f = porClave.get(e.franja.clave) ?? {
      clave: e.franja.clave,
      texto: e.franja.texto,
      desde: e.franja.desde,
      envios: 0,
      listos: 0,
      aSalir: 0,
    };
    f.envios += 1;
    if (e.listo) f.listos += 1;
    if (e.listo && !e.salida) f.aSalir += 1;
    porClave.set(e.franja.clave, f);
  }
  return [...porClave.values()].sort((a, b) => {
    if (a.desde && b.desde) return a.desde.localeCompare(b.desde) || a.clave.localeCompare(b.clave);
    if (a.desde) return -1;
    if (b.desde) return 1;
    return a.clave.localeCompare(b.clave);
  });
}

/**
 * La franja que se propone al entrar: la primera que tiene algo listo para salir; si no, la
 * primera del día. PURA.
 */
export function franjaPropuesta(franjas: readonly FranjaDelDia[]): string | null {
  return (franjas.find((f) => f.aSalir > 0) ?? franjas[0])?.clave ?? null;
}

const SIN_ZONA = "Sin zona";

/**
 * El orden del reparto (MG-055): por zona, en el orden en que el dueño cargó sus zonas en Envíos
 * (que es su recorrido); las zonas que ya no están, por nombre; «Sin zona» al final. Dentro de la
 * zona, por horario, después por dirección y por número. PURA.
 */
export function ordenarReparto<T extends Pick<EnvioDelReparto, "zona" | "franja" | "direccion" | "code">>(
  envios: readonly T[],
  ordenDeZonas: readonly string[],
): T[] {
  const lugar = (z: string | null) => {
    if (!z) return Number.MAX_SAFE_INTEGER;
    const i = ordenDeZonas.findIndex((x) => x.trim().toLowerCase() === z.trim().toLowerCase());
    return i === -1 ? ordenDeZonas.length : i;
  };
  return [...envios].sort(
    (a, b) =>
      lugar(a.zona) - lugar(b.zona) ||
      (a.zona ?? "").localeCompare(b.zona ?? "", "es-AR") ||
      (a.franja.desde ?? "99").localeCompare(b.franja.desde ?? "99") ||
      (a.direccion ?? "").localeCompare(b.direccion ?? "", "es-AR") ||
      a.code - b.code,
  );
}

export type GrupoDeLaHoja = { zona: string; envios: EnvioDelReparto[]; aCobrar: number };

export type HojaDelReparto = {
  grupos: GrupoDeLaHoja[];
  /** Cuántos salen (los listos). */
  envios: number;
  /** Lo que el cadete tiene que cobrar en la calle (los que no pagaron). */
  aCobrar: number;
  /** Los de la franja que todavía no están listos: no salen, se avisan. */
  sinTerminar: EnvioDelReparto[];
};

/**
 * La hoja del cadete de una franja: SÓLO los listos, agrupados y ordenados por zona, con lo que
 * hay que cobrar en cada uno. Los que todavía se arman quedan aparte («faltan terminar»). PURA.
 */
export function hojaDelReparto(envios: readonly EnvioDelReparto[], ordenDeZonas: readonly string[]): HojaDelReparto {
  const listos = ordenarReparto(
    envios.filter((e) => e.listo),
    ordenDeZonas,
  );
  const grupos: GrupoDeLaHoja[] = [];
  for (const e of listos) {
    const zona = e.zona ?? SIN_ZONA;
    let g = grupos[grupos.length - 1];
    if (!g || g.zona !== zona) {
      g = { zona, envios: [], aCobrar: 0 };
      grupos.push(g);
    }
    g.envios.push(e);
    if (!e.cobrado) g.aCobrar = centavos(g.aCobrar + e.total);
  }
  return {
    grupos,
    envios: listos.length,
    aCobrar: centavos(listos.reduce((s, e) => s + (e.cobrado ? 0 : e.total), 0)),
    sinTerminar: ordenarReparto(
      envios.filter((e) => !e.listo),
      ordenDeZonas,
    ),
  };
}

function centavos(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Lo que dice cada envío sobre la plata: «Cobrar $25.700» o «Ya pagó». PURA. */
export function cobroDelEnvio(e: Pick<EnvioDelReparto, "cobrado" | "total">): string {
  return e.cobrado ? "Ya pagó" : `Cobrar ${textoPlata(e.total)}`;
}

/**
 * El texto para el cadete (WhatsApp): la franja, cuántos son y cuánto cobrar en total, y por zona
 * cada envío con número, cliente, teléfono, dirección, lo que lleva y la plata. PURA.
 */
export function textoParaElCadete(h: HojaDelReparto, d: { negocio: string; dia: string; franja: string }): string {
  const renglones: string[] = [
    `*Reparto ${d.franja} · ${d.dia}* (${d.negocio})`,
    `${h.envios === 1 ? "1 envío" : `${h.envios} envíos`} · cobrar en total ${textoPlata(h.aCobrar)}`,
  ];
  let n = 0;
  for (const g of h.grupos) {
    renglones.push("", `*${g.zona.toUpperCase()}*`);
    for (const e of g.envios) {
      n += 1;
      renglones.push(`${n}. #${e.code} ${e.cliente}${e.telefono ? ` · ${e.telefono}` : ""}`);
      if (e.direccion) renglones.push(`   ${e.direccion}`);
      if (e.resumen) renglones.push(`   ${e.resumen}`);
      if (e.nota) renglones.push(`   Nota: ${e.nota}`);
      renglones.push(`   ${cobroDelEnvio(e)}`);
    }
  }
  return renglones.join("\n");
}

/**
 * El WhatsApp del cadete con el texto. Con su número (10 dígitos argentinos), su chat; sin número,
 * el WhatsApp pregunta a quién mandarlo. PURA.
 */
export function waDelCadete(telefono: string | null | undefined, texto: string): string {
  return waLinkClienta(telefono, texto) ?? `https://wa.me/?text=${encodeURIComponent(texto)}`;
}

function escaparHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * La hoja impresa (A4 o la térmica de 80 mm): un documento aparte, en blanco y negro, con una
 * casilla por envío para tildar en la calle. Todo el texto va escapado. PURA.
 */
export function hojaImprimible(h: HojaDelReparto, d: { negocio: string; dia: string; franja: string; cadete: string | null }): string {
  const filas: string[] = [];
  let n = 0;
  for (const g of h.grupos) {
    filas.push(
      `<tr class="zona"><th colspan="4">${escaparHtml(g.zona)} · ${g.envios.length} ${g.envios.length === 1 ? "envío" : "envíos"}${g.aCobrar > 0 ? ` · cobrar ${escaparHtml(textoPlata(g.aCobrar))}` : ""}</th></tr>`,
    );
    for (const e of g.envios) {
      n += 1;
      const detalle = [e.direccion, e.telefono, e.resumen, e.nota ? `Nota: ${e.nota}` : null].filter(Boolean).map((x) => escaparHtml(String(x)));
      filas.push(
        `<tr><td class="n">${n}</td><td><strong>#${e.code} ${escaparHtml(e.cliente)}</strong><br>${detalle.join("<br>")}</td>` +
          `<td class="plata">${escaparHtml(cobroDelEnvio(e))}</td><td class="tilde"><span class="caja"></span></td></tr>`,
      );
    }
  }
  const titulo = `Reparto ${d.franja} · ${d.dia}`;
  return (
    `<!doctype html><html lang="es-AR"><head><meta charset="utf-8"><title>${escaparHtml(titulo)}</title><style>` +
    "body{font-family:system-ui,sans-serif;color:black;background:white;margin:12mm;font-size:12pt}" +
    "h1{font-size:16pt;margin:0 0 4pt}p{margin:0 0 8pt}table{width:100%;border-collapse:collapse}" +
    "td,th{border-bottom:1px solid gray;padding:5pt 4pt;vertical-align:top;text-align:left}" +
    "tr.zona th{background:gainsboro;text-transform:uppercase;font-size:10pt;letter-spacing:.04em}" +
    ".n{width:1.5em}.plata{white-space:nowrap;font-weight:700;text-align:right}.tilde{width:1.5em}.caja{display:inline-block;width:12pt;height:12pt;border:1.5pt solid black}" +
    "@page{margin:10mm}" +
    `</style></head><body><h1>${escaparHtml(titulo)}</h1>` +
    `<p>${escaparHtml(d.negocio)}${d.cadete ? ` · Cadete: ${escaparHtml(d.cadete)}` : ""} · ${h.envios === 1 ? "1 envío" : `${h.envios} envíos`} · ` +
    `cobrar en total <strong>${escaparHtml(textoPlata(h.aCobrar))}</strong></p>` +
    `<table>${filas.join("")}</table></body></html>`
  );
}

// ── La rendición ────────────────────────────────────────────────────────────────

/** Por qué volvió sin entregar: los de todos los días, en chips. PROVISIONAL A CONFIRMAR con el local. */
export const MOTIVOS_DE_VUELTA = ["No estaba", "Dirección equivocada", "No lo quiso recibir", "No llegamos a tiempo"] as const;

export type ResumenDeLaRendicion = {
  /** Lo cobrado por medio, en el orden de los medios (Efectivo, Mercado Pago, Transferencia). */
  porMedio: { medio: MedioDeCobro; etiqueta: string; monto: number }[];
  /** Lo que el cadete tiene que entregar en efectivo (lo que entra al cajón). */
  efectivo: number;
  cobrados: number;
  yaPagos: number;
  aCobrar: { cantidad: number; monto: number };
  /** De lo que quedó sin cobrar, lo que fue a la cuenta de cada cliente (fiado, 2D). */
  aCuenta: { cantidad: number; monto: number };
};

/**
 * Lo rendido, sumado: cuánto entró por cada medio y qué quedó a cobrar (MG-056). PURA.
 *
 * Cada pedido cuenta UNA vez (O-3, CERT-magra-t2): dos «cobrado» del mismo envío en paralelo dejan
 * dos marcas «rendido» (la plata entra una sola vez: el cobro es idempotente), y el resumen no
 * puede decir que el cadete trae el doble. Se deduplica por el id del pedido (`id`, el de
 * `leerDatosDelReparto`) o, sin él, por su número; manda la última marca de la lista, salvo que
 * sea un «ya-pago» de un pedido que ya tiene un «cobrado» con pagos (O-3, CERT-magra-t2b): el
 * reintento del mismo cobro no borra del resumen el efectivo que trae el cadete.
 */
export function resumenDeLaRendicion(
  todas: readonly (Extract<MarcaDeReparto, { tipo: "rendido" }> & { id?: string })[],
): ResumenDeLaRendicion {
  const porPedido = new Map<string, Extract<MarcaDeReparto, { tipo: "rendido" }>>();
  for (const r of todas) {
    const clave = r.id ?? `#${r.code}`;
    const previa = porPedido.get(clave);
    if (r.resultado === "ya-pago" && previa?.resultado === "cobrado" && previa.pagos.length > 0) continue;
    porPedido.set(clave, r);
  }
  const rendidos = [...porPedido.values()];
  const suma = new Map<MedioDeCobro, number>();
  let cobrados = 0;
  let yaPagos = 0;
  const aCobrar = { cantidad: 0, monto: 0 };
  const aCuenta = { cantidad: 0, monto: 0 };
  for (const r of rendidos) {
    if (r.resultado === "cobrado") {
      cobrados += 1;
      for (const p of r.pagos) suma.set(p.medio, centavos((suma.get(p.medio) ?? 0) + p.monto));
    } else if (r.resultado === "ya-pago") yaPagos += 1;
    else if (r.aCuenta) {
      aCuenta.cantidad += 1;
      aCuenta.monto = centavos(aCuenta.monto + r.total);
    } else {
      aCobrar.cantidad += 1;
      aCobrar.monto = centavos(aCobrar.monto + r.total);
    }
  }
  const porMedio = MEDIOS_DE_COBRO.filter((m) => (suma.get(m.valor) ?? 0) > 0).map((m) => ({
    medio: m.valor,
    etiqueta: m.etiqueta,
    monto: suma.get(m.valor) ?? 0,
  }));
  return { porMedio, efectivo: suma.get("EFECTIVO") ?? 0, cobrados, yaPagos, aCobrar, aCuenta };
}

/**
 * «Cobrado» de un envío que el pedido ya figura cobrado: ¿estaba pago ANTES de que saliera el
 * cadete («ya-pago», el cadete no trae plata) o se cobró en ESTE reparto y la marca no llegó a
 * grabarse (el reintento diseñado, o el doble envío que encontró el cobro hecho)? Lo decide el
 * libro: la primera VENTA del pedido contra la marca «salió» (O-3, CERT-magra-t2b). Sin VENTA en
 * el libro o sin la fecha de la salida no hay plata que atribuirle al cadete: «ya-pago». PURA.
 */
export function cobradoAntesDeSalir(p: { paid: boolean; primeraVenta: Date | null; salio: Date | null }): boolean {
  if (!p.paid) return false;
  if (!p.primeraVenta || !p.salio) return true;
  return p.primeraVenta.getTime() < p.salio.getTime();
}

/**
 * Lo que contesta «Lo dejó sin cobrar» (O-2, CERT-magra-t2b): al fiado, el mensaje de la entrega
 * («… quedó en la cuenta de Ana …»); con las cuentas corrientes prendidas y sin la app de Fiado,
 * el aviso de que NO quedó en la cuenta (`mensajeEntregaSinAppDeFiado`); si no, el de siempre. PURA.
 */
export function mensajeDeLoDejadoSinCobrar(p: {
  code: number;
  total: number;
  alFiado: boolean;
  mensajeDeLaEntrega: string | undefined;
  motivoSinFiado: string | null;
}): string {
  if (p.alFiado && p.mensajeDeLaEntrega) return p.mensajeDeLaEntrega;
  if (p.motivoSinFiado === "sin-app") return mensajeEntregaSinAppDeFiado(p.code);
  return `Pedido #${p.code} entregado sin cobrar: queda en «A cobrar» por ${textoPlata(p.total)}.`;
}

/** «Efectivo $38.000 · Mercado Pago $25.000» (o «Nada cobrado todavía»). PURA. */
export function textoDelResumen(r: ResumenDeLaRendicion): string {
  if (r.porMedio.length === 0) return "Nada cobrado todavía";
  return r.porMedio.map((m) => `${m.etiqueta} ${textoPlata(m.monto)}`).join(" · ");
}
