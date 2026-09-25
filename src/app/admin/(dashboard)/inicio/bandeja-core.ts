// ============================================================================
// LA BANDEJA DEL DUEÑO — lo que pide acción hoy, por objetivo. PURO (sin base ni render).
// ============================================================================
//
// El Inicio deja de ser el catálogo de las 49 apps con su número (auditoría §3.1). El dueño aterriza
// en una BANDEJA: sólo lo que pide acción, agrupado por objetivo (Cobrar · Preparar · Cerrar ·
// Reponer · Facturar), cada cosa escrita como tarea (sujeto y verbo) con SU tecla, que abre la app
// que la RESUELVE con el recorte puesto (no la que la mide: defecto D2). Se vacía al resolver.
//
// Los datos son los números que ya existen (los loaders de src/apps/kpis): acá sólo se decide qué
// número sube a la bandeja, en qué objetivo y con qué palabras. Se piden ~12 loaders (los que
// pueden alertar y los que dicen «hay que hacer») más los de Mis apps (≤ 8), no los 49 de antes.
// Lo prueba bandeja-core.test.ts.

import type { AppDescriptor } from "@/apps/contract";
// Mayúscula inicial en código, no en CSS: «Jueves 24 De Septiembre» fue un defecto.
import { mayuscula } from "@/lib/texto";
import type { ResultadoKpi } from "@/apps/kpis/nucleo.server";

export type Objetivo = "cobrar" | "preparar" | "cerrar" | "reponer" | "facturar" | "revisar";

export const OBJETIVOS: readonly { id: Objetivo; nombre: string }[] = [
  { id: "cobrar", nombre: "Cobrar" },
  { id: "preparar", nombre: "Preparar" },
  { id: "cerrar", nombre: "Cerrar" },
  { id: "reponer", nombre: "Reponer" },
  { id: "facturar", nombre: "Facturar" },
  { id: "revisar", nombre: "Revisar" },
];

type AppMin = Pick<AppDescriptor, "id" | "nombre" | "ruta">;

export interface Pendiente {
  objetivo: Objetivo;
  /** La app que lo mide (para no repetirla y para el punto del índice de espacios). */
  app: string;
  /** Izquierda, condensado: «1 día», «Agosto», «2». */
  folio: string;
  /** La tarea, con sujeto: «La caja quedó sin cerrar». */
  titulo: string;
  detalle?: string;
  /** La parte que es plata, ya formateada por el loader (sólo si el rol la ve). */
  monto?: string;
  /** La tecla: el verbo y la app que lo resuelve. */
  tecla: { texto: string; href: string };
  /** «Más»: la app que lo mide, si la tecla lleva a otra. */
  mas?: { texto: string; href: string };
}

/** Las apps cuyo número puede subir a la bandeja (y en qué orden se piden). */
export const APPS_DE_LA_BANDEJA = [
  "pedidos",
  "cierre-del-dia",
  "cajas-de-los-locales",
  "cierre-del-mes",
  "libro-de-caja",
  "confirmar-manana",
  "movimientos",
  "sugerido-de-compra",
  "margen",
  "facturacion",
] as const;

/** Las que dicen cómo viene el día (la línea de estado bajo el título). */
export const APPS_DE_LA_LINEA = ["caja-del-dia", "agenda", "pedidos", "cierre-del-mes"] as const;

type Ok = Extract<ResultadoKpi, { estado: "ok" }>;

const entero = (s: string | undefined): number | null => {
  if (!s) return null;
  const limpio = s.replace(/\./g, "").trim();
  return /^\d+$/.test(limpio) ? Number(limpio) : null;
};

/**
 * La app que RESUELVE, si la persona la ve; si no, la que mide (regla 4 de la arquitectura).
 * `destinos` son las rutas de las apps que la persona ve, por id.
 */
function resuelve(destinos: ReadonlyMap<string, string>, preferida: string, respaldo: AppMin): { href: string; esOtra: boolean } {
  const r = destinos.get(preferida);
  return r ? { href: r, esOtra: preferida !== respaldo.id } : { href: respaldo.ruta, esOtra: false };
}

/** Cada regla convierte el número de UNA app en pendientes (cero, uno o dos). */
const REGLAS: Record<string, (r: Ok, app: AppMin, destinos: ReadonlyMap<string, string>) => Pendiente[]> = {
  pedidos: (r, app) => {
    const out: Pendiente[] = [];
    if (r.alerta) {
      const n = entero(r.alerta.valor) ?? 0;
      out.push({
        objetivo: "cobrar",
        app: app.id,
        folio: r.alerta.valor,
        titulo: n === 1 ? "Un pedido entregado sin cobrar" : `${r.alerta.valor} pedidos entregados sin cobrar`,
        detalle: "La mercadería salió y la plata no entró",
        tecla: { texto: "Cobrar", href: app.ruta },
      });
    }
    const abiertos = entero(r.valor) ?? 0;
    const sinCobrar = entero(r.alerta?.valor) ?? 0;
    const porPreparar = abiertos - sinCobrar;
    if (porPreparar > 0) {
      const paraHoy = /(\d+) para hoy/.exec(r.detalle ?? "")?.[1];
      out.push({
        objetivo: "preparar",
        app: app.id,
        folio: String(porPreparar),
        titulo: porPreparar === 1 ? "Un pedido para preparar" : `${porPreparar} pedidos para preparar`,
        detalle: paraHoy ? `${paraHoy} para hoy` : undefined,
        tecla: { texto: "Preparar", href: app.ruta },
      });
    }
    return out;
  },
  "confirmar-manana": (r, app) => {
    const n = entero(r.valor);
    if (!n || !/sin avisar/.test(r.detalle ?? "")) return [];
    return [
      {
        objetivo: "preparar",
        app: app.id,
        folio: "Mañana",
        titulo: n === 1 ? "Un turno de mañana sin avisar" : `${n} turnos de mañana sin avisar`,
        detalle: "Avisales por WhatsApp para que confirmen",
        tecla: { texto: "Confirmar", href: app.ruta },
      },
    ];
  },
  "cierre-del-dia": (r, app) =>
    r.alerta
      ? [
          {
            objetivo: "cerrar",
            app: app.id,
            folio: r.alerta.texto.replace(/ sin cerrar$/, ""),
            titulo: "La caja quedó sin cerrar",
            detalle: r.detalle ? mayuscula(r.detalle) : undefined,
            monto: r.monto,
            tecla: { texto: "Cerrar el día", href: app.ruta },
          },
        ]
      : [],
  "cajas-de-los-locales": (r, app) =>
    r.alerta
      ? [
          {
            objetivo: "cerrar",
            app: app.id,
            folio: "Locales",
            titulo: mayuscula(r.alerta.texto),
            tecla: { texto: "Ver las cajas", href: app.ruta },
          },
        ]
      : [],
  "cierre-del-mes": (r, app) =>
    r.alerta
      ? [
          {
            objetivo: "cerrar",
            app: app.id,
            folio: r.valor,
            titulo: `${r.valor} sigue sin cerrar para el contador`,
            detalle: "Se cierra una vez y el paquete queda listo para bajar",
            tecla: { texto: "Cerrar el mes", href: app.ruta },
          },
        ]
      : [],
  "libro-de-caja": (r, app) =>
    r.alerta
      ? [
          {
            objetivo: "cerrar",
            app: app.id,
            folio: "Libro",
            titulo: "El libro de caja está en negativo",
            detalle: "No es plata que falta: es plata que no se anotó",
            monto: r.alerta.valor,
            tecla: { texto: "Ver el libro", href: app.ruta },
          },
        ]
      : [],
  movimientos: (r, app, destinos) => {
    if (!r.alerta) return [];
    const d = resuelve(destinos, "recuento", app);
    return [
      {
        objetivo: "reponer",
        app: app.id,
        folio: r.alerta.valor,
        titulo: mayuscula(r.alerta.texto.replace(/ — recontar$/, "")),
        detalle: "Se vendió más de lo que había cargado: contalo y el número se corrige",
        tecla: { texto: "Contar", href: d.href },
        ...(d.esOtra ? { mas: { texto: "Ver los movimientos", href: app.ruta } } : {}),
      },
    ];
  },
  "sugerido-de-compra": (r, app) => {
    const n = entero(r.valor);
    if (!n) return [];
    return [
      {
        objetivo: "reponer",
        app: app.id,
        // El folio es una palabra: un «17» suelto al lado de la cifra del objetivo se leía como otra cuenta.
        folio: "Hoy",
        titulo: `${r.valor} ${(r.detalle ?? "para pedir hoy").replace(/ hoy$/, "")}`,
        detalle: "Según lo que se vende y lo que queda",
        tecla: { texto: "Pedir", href: app.ruta },
      },
    ];
  },
  margen: (r, app, destinos) => {
    if (!r.alerta) return [];
    const d = resuelve(destinos, "actualizar-precios", app);
    return [
      {
        objetivo: "revisar",
        app: app.id,
        folio: r.alerta.valor,
        titulo: mayuscula(r.alerta.texto),
        detalle: "Cada venta de esos pierde plata",
        tecla: { texto: d.esOtra ? "Aumentar precios" : "Revisar", href: d.href },
        ...(d.esOtra ? { mas: { texto: "Ver el margen", href: app.ruta } } : {}),
      },
    ];
  },
  facturacion: (r, app) =>
    r.alerta
      ? [
          {
            objetivo: "facturar",
            app: app.id,
            folio: r.alerta.valor,
            titulo: mayuscula(r.alerta.texto),
            detalle: "La nota de crédito todavía no se emite desde el sistema: hacela en ARCA",
            tecla: { texto: "Ver las facturas", href: app.ruta },
          },
        ]
      : [],
};

/**
 * Los pendientes de la bandeja, en el orden de los objetivos. Cualquier otra alerta (de una app sin
 * regla) va a «Revisar» con la app que la mide: ninguna alerta se pierde. Devuelve también qué
 * números no se pudieron calcular: sin ellos no se puede decir «nada pendiente».
 */
export function pendientesDeLaBandeja(
  items: readonly { app: AppMin; resultado: ResultadoKpi | null }[],
  destinos: ReadonlyMap<string, string>,
): { pendientes: Pendiente[]; sinRevisar: AppMin[] } {
  const pendientes: Pendiente[] = [];
  const sinRevisar: AppMin[] = [];
  for (const { app, resultado } of items) {
    if (resultado?.estado === "error") {
      sinRevisar.push(app);
      continue;
    }
    if (resultado?.estado !== "ok") continue;
    const regla = REGLAS[app.id];
    if (regla) pendientes.push(...regla(resultado, app, destinos));
    else if (resultado.alerta) {
      pendientes.push({
        objetivo: "revisar",
        app: app.id,
        folio: resultado.alerta.valor,
        titulo: `${app.nombre}: ${resultado.alerta.texto}`,
        tecla: { texto: "Abrir", href: app.ruta },
      });
    }
  }
  const orden = new Map(OBJETIVOS.map((o, i) => [o.id, i]));
  pendientes.sort((a, b) => (orden.get(a.objetivo) ?? 0) - (orden.get(b.objetivo) ?? 0));
  return { pendientes, sinRevisar };
}

/** Los pendientes agrupados por objetivo (sólo los objetivos con algo), en su orden. */
export function porObjetivo(pendientes: readonly Pendiente[]): { id: Objetivo; nombre: string; items: Pendiente[] }[] {
  return OBJETIVOS.map((o) => ({ ...o, items: pendientes.filter((p) => p.objetivo === o.id) })).filter((g) => g.items.length > 0);
}

// ── La línea de estado del día ───────────────────────────────────────────────

/**
 * La frase del estado del negocio bajo el título: «Caja abierta desde las 9:10 · 7 pedidos
 * abiertos · 12 turnos hoy · agosto sin cerrar». Sólo lo que se pudo leer; nada inventado.
 */
export function lineaDelDia(porApp: ReadonlyMap<string, ResultadoKpi | null>): string[] {
  const ok = (id: string) => {
    const r = porApp.get(id);
    return r?.estado === "ok" ? r : null;
  };
  const datos: string[] = [];
  const caja = ok("caja-del-dia");
  if (caja) datos.push(`Caja ${caja.valor.toLowerCase()}${caja.detalle && caja.valor === "Abierta" ? ` ${caja.detalle}` : ""}`);
  const agenda = ok("agenda");
  if (agenda) datos.push(`${agenda.valor} ${agenda.detalle ?? ""}`.trim());
  const pedidos = ok("pedidos");
  // Cero pedidos no es un dato del día (en una estética era ruido fijo): se dice sólo si hay.
  if (pedidos && entero(pedidos.valor) !== 0) {
    const n = entero(pedidos.valor);
    const resto = (pedidos.detalle ?? "").replace(/^abiertos?\s*/, "");
    datos.push(`${pedidos.valor} ${n === 1 ? "pedido abierto" : "pedidos abiertos"}${resto ? ` ${resto}` : ""}`);
  }
  const mes = ok("cierre-del-mes");
  if (mes?.alerta) datos.push(`${mes.valor.toLowerCase()} sin cerrar`);
  return datos;
}

// ── Fecha del título ─────────────────────────────────────────────────────────

/** «Hoy, jueves 24 de septiembre» desde «2026-09-24» (el hoy del negocio, no el del servidor). */
export function tituloDeHoy(hoy: string): string {
  const [a, m, d] = hoy.split("-").map(Number);
  const fecha = new Date(Date.UTC(a, m - 1, d, 12));
  const texto = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(fecha)
    .replace(",", "");
  return `Hoy, ${texto}`;
}

/** Mis apps de fábrica, por rubro, cuando la persona todavía no fijó ninguna (A2). */
export function misAppsDeFabrica(esMostrador: boolean): readonly string[] {
  return esMostrador ? ["vender", "caja-del-dia", "pedidos", "cierre-del-dia"] : ["agenda", "caja-del-dia", "confirmar-manana", "clientes"];
}

/** Lee un monto formateado por un loader («$26.250», «-$3.200») como número. `null` si no es plata. */
export function montoANumero(s: string | undefined): number | null {
  if (!s) return null;
  const m = /^(-|−)?\s*\$\s*([\d.]+)(,(\d+))?/.exec(s.trim());
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, "") + (m[4] ? `.${m[4]}` : ""));
  return Number.isFinite(n) ? (m[1] ? -n : n) : null;
}

// ── El primer día: la caja cerrada y «Para arrancar» ─────────────────────────

/** Lo que el Inicio dice de la caja cuando está cerrada: un renglón con su tecla, no una alarma. */
export interface AvisoDeCaja {
  titulo: string;
  detalle: string;
  tecla: { texto: string; href: string };
}

/**
 * «Caja cerrada» en la línea del día y «Nada pide atención» al lado se contradecían: el negocio no
 * podía empezar a vender con turno y el Inicio no le ofrecía la tecla. Con la caja cerrada (y la
 * app Caja a la vista: sin ella no hay resultado) sube un renglón con «Abrir la caja». No cuenta
 * como pendiente: a las 22 una caja cerrada es lo normal (finanzas.server.ts, `cajaDelDia`). PURA.
 */
export function avisoDeCaja(caja: ResultadoKpi | null | undefined, ruta: string | undefined): AvisoDeCaja | null {
  if (!ruta || caja?.estado !== "ok" || caja.valor !== "Cerrada") return null;
  return {
    titulo: "La caja está cerrada",
    detalle: "Abrila para empezar a vender: el efectivo entra al arqueo de tu turno",
    tecla: { texto: "Abrir la caja", href: ruta },
  };
}

export interface PasoParaArrancar {
  id: "precios" | "caja" | "facturacion" | "whatsapp" | "cierre";
  titulo: string;
  detalle?: string;
  hecho: boolean;
  tecla?: { texto: string; href: string };
}

/**
 * «Para arrancar»: los pasos del primer día de un negocio, armados con los números que el Inicio
 * ya lee. Aparece sólo mientras el negocio nunca cerró un día (el cierre del día dice «Sin
 * cierres»): es la señal honesta de «recién empieza» sin consultar nada nuevo. Se va solo con el
 * primer cierre, que es el último paso. Cada paso sale sólo si la persona ve la app que lo
 * resuelve. PURA.
 *
 * `facturacion` (opcional): si el negocio tiene CUIT y punto de venta cargados. Lo lee el Inicio
 * sólo en este caso y sólo si la persona ve Facturación; `null` = no se pudo leer → el paso no
 * sale (no se afirma nada que no se sabe). El CUIT y el punto de venta no los carga el negocio:
 * los carga Gestión Studio Grow, y el paso lo dice.
 *
 * `whatsapp` (opcional): si la vidriera tiene el WhatsApp del negocio cargado. Sin número, la
 * vidriera no ofrece «Pedir por WhatsApp» (sólo «Enviar pedido») y nada se lo decía al dueño.
 * Sale sólo si la persona ve Pedidos (el negocio recibe pedidos) y Datos del negocio (donde se
 * carga); `null` = no se pudo leer → el paso no sale.
 */
export function pasosParaArrancar(
  porApp: ReadonlyMap<string, ResultadoKpi | null>,
  destinos: ReadonlyMap<string, string>,
  facturacion?: { cuit: boolean; puntoVenta: boolean } | null,
  whatsapp?: { cargado: boolean } | null,
): PasoParaArrancar[] {
  const ok = (id: string) => {
    const r = porApp.get(id);
    return r?.estado === "ok" ? r : null;
  };
  const cierre = ok("cierre-del-dia");
  if (!cierre || cierre.valor !== "Sin cierres") return [];
  const pasos: PasoParaArrancar[] = [];
  const catalogo = ok("catalogo");
  const rutaCatalogo = destinos.get("catalogo");
  const sinPrecio = catalogo ? entero(catalogo.valor) : null;
  if (sinPrecio !== null && rutaCatalogo) {
    pasos.push(
      sinPrecio > 0
        ? {
            id: "precios",
            titulo: `Ponerle precio a ${sinPrecio === 1 ? "1 producto" : `${sinPrecio} productos`}`,
            detalle: "Sin precio no aparecen en Vender",
            hecho: false,
            tecla: { texto: "Poner precios", href: rutaCatalogo },
          }
        : { id: "precios", titulo: "Todos tus productos tienen precio", hecho: true },
    );
  }
  const caja = ok("caja-del-dia");
  const rutaCaja = destinos.get("caja-del-dia");
  if (caja && rutaCaja) {
    pasos.push(
      caja.valor === "Abierta"
        ? { id: "caja", titulo: "Caja abierta", detalle: caja.detalle, hecho: true }
        : { id: "caja", titulo: "Abrir la caja con el fondo del cajón", hecho: false, tecla: { texto: "Abrir la caja", href: rutaCaja } },
    );
  }
  const rutaFacturacion = destinos.get("facturacion");
  if (facturacion && rutaFacturacion) {
    const falta = [!facturacion.cuit && "el CUIT", !facturacion.puntoVenta && "el punto de venta"].filter(Boolean);
    pasos.push(
      falta.length === 0
        ? { id: "facturacion", titulo: "Facturación con CUIT y punto de venta", hecho: true }
        : {
            id: "facturacion",
            titulo: "Facturación sin configurar",
            detalle: `Falta ${falta.join(" y ")}: los carga Gestión Studio Grow`,
            hecho: false,
            tecla: { texto: "Ver facturación", href: rutaFacturacion },
          },
    );
  }
  const rutaDatos = destinos.get("datos-del-negocio");
  if (whatsapp && rutaDatos && destinos.has("pedidos")) {
    pasos.push(
      whatsapp.cargado
        ? { id: "whatsapp", titulo: "WhatsApp de la vidriera cargado", hecho: true }
        : {
            id: "whatsapp",
            titulo: "Cargar el WhatsApp del negocio",
            detalle: "Sin número, en la vidriera no aparece «Pedir por WhatsApp»",
            hecho: false,
            tecla: { texto: "Cargar el WhatsApp", href: rutaDatos },
          },
    );
  }
  const rutaCierre = destinos.get("cierre-del-dia");
  if (rutaCierre) {
    pasos.push({
      id: "cierre",
      titulo: "Cerrar el primer día",
      detalle: "Al final de la jornada: contás el cajón y queda en el libro",
      hecho: false,
      tecla: { texto: "Cerrar el día", href: rutaCierre },
    });
  }
  return pasos;
}
