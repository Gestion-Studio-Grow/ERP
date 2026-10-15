// MOTOR DE LA GESTIÓN — TESVO Importaciones y Exportaciones (demo del flujo, ADR-028 · demo pública a costo cero).
//
// Reingeniería de cómo gestionan por dentro los referentes del rubro: Aerobox y Aerolíneas Argentinas Courier
// (casilla en Miami, Argentina), los casilleros globales (MyUS, Shipito) y el freight forwarding digital
// (Flexport, Freightos), adaptada a TESVO: puerta a puerta desde China, Miami y Paraguay, para personas y pymes,
// con el régimen courier argentino como DATOS editables. Detalle, fuentes y porqué:
// docs/tenants/tesvo/REINGENIERIA-AEROBOX.md.
//
// Reglas de este archivo:
//   · Puro: no toca el DOM, la red ni el disco. Lo usan la gestión (index.html) y los tests de Node.
//   · Sin persistencia: el estado vive en memoria (DEMO → VENTA → INVERSIÓN: antes de la venta no se guarda nada).
//   · La plata en DÓLARES va en CENTAVOS enteros (US$ 12,50 = 1250); la plata en PESOS va en pesos enteros.
//     Nunca se suma un float de plata.
//   · Los pesos se miden en GRAMOS enteros y las medidas en centímetros.
//   · Las fechas son "AAAA-MM-DD" (día civil, sin zona horaria).
//   · Toda operación devuelve { ok: true, ... } o { ok: false, motivo } en criollo, nunca tira excepción por una
//     regla de negocio: quien atiende tiene que leer qué pasó, no un error técnico.
//   · Todo número del régimen y de las tarifas es DE DEMOSTRACIÓN y provisional a confirmar con TESVO y su
//     despachante. Nada de acá es una tarifa real de TESVO.

// ───────────────────────── catálogos ─────────────────────────

export const MEDIOS = Object.freeze({
  transferencia: "Transferencia",
  mercadopago: "Mercado Pago",
  efectivo: "Efectivo",
  tarjeta: "Tarjeta",
  usd_efectivo: "Dólares billete",
});

/** Medios que se cobran en dólares (el resto, en pesos al tipo de cambio del día). */
const MEDIOS_EN_DOLARES = new Set(["usd_efectivo"]);

export const ORIGENES = Object.freeze({ miami: "Miami", china: "China", paraguay: "Paraguay" });
export const VIAS = Object.freeze({ aereo: "Aéreo", maritimo: "Marítimo", terrestre: "Terrestre" });

export const REGIMENES = Object.freeze({
  courier: "Courier (pequeños envíos)",
  general: "Importación con despachante",
});

/**
 * El ciclo de vida de un envío, en orden. Cada estado dice quién lo mueve. Los desvíos (observado, retenido,
 * diferencia, cancelado) no están en la línea: se marcan aparte para que el envío no pierda su lugar.
 */
export const ESTADOS = Object.freeze({
  cotizado: "Cotizado",
  confirmado: "Confirmado",
  esperando: "Esperando la compra",
  en_deposito: "En depósito",
  embarcado: "Embarcado",
  en_transito: "En viaje",
  en_aduana: "En aduana",
  listo: "Listo para entregar",
  en_reparto: "En reparto",
  entregado: "Entregado",
  cancelado: "Cancelado",
});

/** La línea de tiempo que ve el cliente (sin cotizado ni cancelado). */
export const LINEA = Object.freeze(["confirmado", "esperando", "en_deposito", "embarcado", "en_transito", "en_aduana", "listo", "en_reparto", "entregado"]);

const ACTIVOS = new Set(["confirmado", "esperando", "en_deposito", "embarcado", "en_transito", "en_aduana", "listo", "en_reparto"]);

export const ESTADOS_EMBARQUE = Object.freeze({
  armando: "Armando",
  en_transito: "En viaje",
  arribado: "Arribó",
  cerrado: "Cerrado",
});

export const ROLES = Object.freeze({ atencion: "Atención", deposito: "Depósito", duenio: "Dueño/a" });

/**
 * Qué puede hacer cada rol. Atención cotiza, confirma, cobra y entrega; Depósito recibe, pesa y arma embarques;
 * el dueño ve todo y es el único que toca tarifas, régimen, bonificaciones y devoluciones de seña.
 */
export const PERMISOS = Object.freeze({
  atencion: Object.freeze(["cotizar", "confirmar", "cobrar", "entregar", "clientes", "aduana", "avisar", "cancelar"]),
  deposito: Object.freeze(["recibir", "asignar", "embarcar", "despachar", "aduana", "avisar"]),
  duenio: Object.freeze([
    "cotizar", "confirmar", "cobrar", "entregar", "clientes", "aduana", "avisar", "cancelar",
    "recibir", "asignar", "embarcar", "despachar",
    "tarifas", "bonificar", "devolver", "metricas", "usuarios",
  ]),
});

// ───────────────────────── utilidades ─────────────────────────

export function sumarDias(fecha, dias) {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

export function diasEntre(desde, hasta) {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

/** US$ 1.234,50 — `c` en centavos. */
export function usd(c) {
  const v = Math.round(c);
  const abs = Math.abs(v);
  const entero = Math.floor(abs / 100).toLocaleString("es-AR");
  const dec = String(abs % 100).padStart(2, "0");
  return `${v < 0 ? "-" : ""}US$ ${entero},${dec}`;
}

/** $ 1.234 — `n` en pesos enteros. */
export function pesos(n) {
  const v = Math.round(n);
  return (v < 0 ? "-$ " : "$ ") + Math.abs(v).toLocaleString("es-AR");
}

/** 12,4 kg — `g` en gramos. */
export function kg(g) {
  return `${(Math.round(g / 100) / 10).toLocaleString("es-AR")} kg`;
}

/** Centavos de dólar → pesos enteros al tipo de cambio `tc` (pesos por dólar). */
export const aPesos = (centavos, tc) => Math.round((centavos * tc) / 100);
/** Pesos → centavos de dólar al tipo de cambio `tc`. */
export const aCentavos = (p, tc) => Math.round((p * 100) / tc);

const porcentaje = (base, tasa) => Math.round(base * tasa);

let secuencia = 0;
const nuevoId = (prefijo) => `${prefijo}${(++secuencia).toString(36)}`;

function registrar(estado, texto, fecha) {
  estado.log.unshift({ fecha: fecha ?? null, texto });
  if (estado.log.length > 300) estado.log.length = 300;
}

/** 17/10 — para los textos que lee la gente. */
export const dm = (f) => (f ? `${Number(f.slice(8, 10))}/${Number(f.slice(5, 7))}` : "");

const normalizar = (x) => String(x ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// ───────────────────────── configuración de demo ─────────────────────────

/**
 * El régimen courier como DATOS (ADR-104 en la rama de TESVO: «el régimen se versiona como dato»).
 * Valores públicos a la fecha de la investigación, PROVISIONALES: los valida el despachante de TESVO.
 */
export const REGIMEN_DEMO = Object.freeze({
  topeEnvioCentavos: 300000,      // US$ 3.000 FOB por envío (RG 5608, mod. RG 5883/2026)
  franquiciaCentavos: 40000,      // primeros US$ 400 FOB sin derechos ni tasa de estadística (Dto. 1065/2024 y 604/2026)
  enviosPorAnio: 5,               // envíos CON franquicia por persona y año calendario; después se paga sobre todo
  derechosExcedente: 0.2,         // DEMO: el real sale de la posición arancelaria (NCM) de cada producto
  tasaEstadistica: 0.03,          // 3 % con tope (Dto. 1140/2024)
  topeTasaEstadisticaCentavos: 18000,
  iva: 0.21,                      // se paga SIEMPRE, también dentro de la franquicia
  pesoMaxGramos: 50000,           // 50 kg por paquete (RG 5631/2025)
  unidadesMaxPorProducto: 3,      // más de 3 de la misma especie = presunción de fin comercial
  vigenteDesde: "2026-07-30",
  fuente: "Dto. 1065/2024 y 604/2026 · RG 5608, 5631 y 5883 de ARCA — valores de DEMO, los valida el despachante",
});

/**
 * Tarifas por ruta (origen × vía). `porKgCentavos` sobre el peso que se cobra (el mayor entre real y volumétrico);
 * `divisorVolumetrico`: cm³ por kg (aéreo 5000, marítimo por CBM). Valores de DEMOSTRACIÓN.
 */
export const TARIFAS_DEMO = Object.freeze([
  { id: "miami-aereo", origen: "miami", via: "aereo", porKgCentavos: 2500, minimoGramos: 1000, divisorVolumetrico: 5000, dias: [7, 12], regimenes: ["courier", "general"] },
  { id: "china-aereo", origen: "china", via: "aereo", porKgCentavos: 3800, minimoGramos: 1000, divisorVolumetrico: 5000, dias: [12, 20], regimenes: ["courier", "general"] },
  { id: "china-maritimo", origen: "china", via: "maritimo", porCbmCentavos: 45000, minimoCbmMilesimas: 1000, dias: [45, 60], regimenes: ["general"] },
  { id: "paraguay-terrestre", origen: "paraguay", via: "terrestre", porKgCentavos: 800, minimoGramos: 1000, divisorVolumetrico: 4000, dias: [3, 6], regimenes: ["courier", "general"] },
]);

export const CONFIG_DEMO = Object.freeze({
  tipoCambio: 1450,                 // pesos por dólar, lo carga el dueño cada día
  honorarioTasa: 0.08,              // 8 % del valor de la mercadería
  honorarioMinimoCentavos: 3000,    // US$ 30
  despachanteCentavos: 25000,       // US$ 250 por operación con despachante (régimen general)
  seguroTasa: 0.015,                // 1,5 % del valor, opcional
  manejoPorPaqueteCentavos: 1000,   // US$ 10 por paquete recibido (manejo documental)
  almacenajeDiasGratis: 30,
  almacenajePorDiaCentavos: 100,    // US$ 1 por paquete por día pasados los gratis
  senaTasa: 0.3,                    // 30 % de seña para congelar el tipo de cambio
  validezCotizacionDias: 3,
  toleranciaPesoTasa: 0.05,         // hasta 5 % de diferencia no se recotiza
  avisoAlmacenajeDias: 5,           // avisar N días antes de que empiece a cobrarse
});

// ───────────────────────── estado ─────────────────────────

export function crearEstado({ config = CONFIG_DEMO, regimen = REGIMEN_DEMO, tarifas = TARIFAS_DEMO, clientes = [], usuarios = USUARIOS_DEMO, anio = 2026 } = {}) {
  return {
    config: { ...config },
    regimen: { ...regimen },
    tarifas: tarifas.map((t) => ({ ...t })),
    clientes: clientes.map((c) => ({ envios: [], ...c })),
    usuarios: usuarios.map((u) => ({ ...u })),
    cotizaciones: [],
    envios: [],
    paquetes: [],
    embarques: [],
    caja: [],
    log: [],
    numerador: { anio, n: 0 },
  };
}

export const USUARIOS_DEMO = Object.freeze([
  { id: "u-sole", nombre: "Sole", rol: "atencion", pin: "1234" },
  { id: "u-nico", nombre: "Nico", rol: "deposito", pin: "2345" },
  { id: "u-duenio", nombre: "Dueño", rol: "duenio", pin: "9999" },
]);

export const usuario = (estado, id) => estado.usuarios.find((u) => u.id === id) ?? null;
export const cliente = (estado, id) => estado.clientes.find((c) => c.id === id) ?? null;
export const envio = (estado, id) => estado.envios.find((e) => e.id === id || e.codigo === id) ?? null;
export const paquete = (estado, id) => estado.paquetes.find((p) => p.id === id) ?? null;
export const embarque = (estado, id) => estado.embarques.find((b) => b.id === id) ?? null;
export const tarifa = (estado, id) => estado.tarifas.find((t) => t.id === id) ?? null;

export function puede(estado, usuarioId, accion) {
  const u = usuario(estado, usuarioId);
  return !!u && u.activo !== false && (PERMISOS[u.rol] ?? []).includes(accion);
}

export function verificarPin(estado, usuarioId, pin) {
  const u = usuario(estado, usuarioId);
  if (!u || u.activo === false) return { ok: false, motivo: "Ese usuario no tiene acceso." };
  if (String(pin ?? "").trim() !== u.pin) return { ok: false, motivo: "PIN incorrecto." };
  return { ok: true, usuario: u };
}

/** Permiso del rol y, si la operación es sensible, el PIN de quien la hace. */
function autorizar(estado, { usuarioId, pin } = {}, accion, conPin = false) {
  const u = usuario(estado, usuarioId);
  if (!u) return { ok: false, motivo: "Elegí quién está usando el sistema." };
  if (!puede(estado, usuarioId, accion)) return { ok: false, motivo: `${ROLES[u.rol]} no puede hacer esto: lo autoriza el dueño.` };
  if (conPin) {
    const v = verificarPin(estado, usuarioId, pin);
    if (!v.ok) return v;
  }
  return { ok: true, usuario: u };
}

// ───────────────────────── cliente: casilla y cupo ─────────────────────────

/** Número de casilla que el cliente pone como "dirección" en la tienda: TV-1024. */
export function casilla(n) {
  return `TV-${String(n).padStart(4, "0")}`;
}

export function altaCliente(estado, { nombre, tipo = "persona", doc = "", tel = "", email = "" }, auth, hoy) {
  const a = autorizar(estado, auth, "clientes");
  if (!a.ok) return a;
  const n = normalizar(nombre);
  if (!n) return { ok: false, motivo: "Falta el nombre." };
  if (doc && estado.clientes.some((c) => c.doc && c.doc.replace(/\D/g, "") === doc.replace(/\D/g, ""))) {
    return { ok: false, motivo: "Ya hay un cliente con ese CUIT/CUIL." };
  }
  const numero = 1000 + estado.clientes.length + 1;
  const c = { id: nuevoId("c-"), nombre: nombre.trim(), tipo, doc, tel, email, casilla: casilla(numero), alta: hoy, envios: [] };
  estado.clientes.push(c);
  registrar(estado, `Alta de ${c.nombre} (casilla ${c.casilla}).`, hoy);
  return { ok: true, cliente: c };
}

/**
 * Envíos courier del cliente en el año calendario (los que salieron por courier y no se cancelaron).
 * El cupo es por persona: una pyme importa por régimen general y no tiene cupo.
 */
export function cupoCourier(estado, clienteId, anio = estado.numerador.anio) {
  const c = cliente(estado, clienteId);
  if (!c) return { usados: 0, total: estado.regimen.enviosPorAnio, quedan: estado.regimen.enviosPorAnio, aplica: false };
  const usados = estado.envios.filter((e) =>
    e.clienteId === clienteId && e.regimen === "courier" && e.estado !== "cancelado" && e.estado !== "cotizado" &&
    String(e.confirmadoEl ?? "").startsWith(String(anio)),
  ).length;
  const total = estado.regimen.enviosPorAnio;
  return { usados, total, quedan: Math.max(0, total - usados), aplica: c.tipo === "persona" };
}

// ───────────────────────── cotización ─────────────────────────

/** Peso volumétrico en gramos de una caja de l × a × h cm. */
export function pesoVolumetrico({ l = 0, a = 0, h = 0 } = {}, divisor = 5000) {
  if (!(l > 0 && a > 0 && h > 0) || !(divisor > 0)) return 0;
  return Math.round(((l * a * h) / divisor) * 1000);
}

/** Lo que se cobra: el mayor entre el peso real y el volumétrico, con el mínimo de la ruta. */
export function pesoACobrar(t, { gramos = 0, medidas = null } = {}) {
  const vol = pesoVolumetrico(medidas ?? {}, t.divisorVolumetrico);
  return Math.max(gramos, vol, t.minimoGramos ?? 0);
}

/** Metros cúbicos en milésimas (1 CBM = 1000). */
export function cbmMilesimas({ l = 0, a = 0, h = 0 } = {}) {
  return Math.round((l * a * h) / 1000);
}

const valorItems = (items) => items.reduce((s, it) => s + Math.round(it.valorCentavos) * Math.max(1, it.unidades ?? 1), 0);

/**
 * Impuestos ESTIMADOS del régimen courier (los liquida la aduana):
 *   · con franquicia, los primeros US$ 400 FOB no pagan derechos ni tasa de estadística; el excedente, sí;
 *   · sin franquicia (empresa, o persona que ya usó sus 5 envíos del año), derechos y tasa sobre todo;
 *   · el IVA se paga siempre, sobre el valor en aduana (CIF) más derechos y tasa.
 * `fobCentavos` = valor de la mercadería; `cifCentavos` = mercadería + flete + seguro.
 */
export function impuestosCourier(regimen, fobCentavos, cifCentavos = fobCentavos, { conFranquicia = true } = {}) {
  const libre = conFranquicia ? regimen.franquiciaCentavos : 0;
  const excedente = Math.max(0, fobCentavos - libre);
  const derechos = porcentaje(excedente, regimen.derechosExcedente);
  const tasa = Math.min(porcentaje(excedente, regimen.tasaEstadistica), regimen.topeTasaEstadisticaCentavos);
  const iva = porcentaje(cifCentavos + derechos + tasa, regimen.iva);
  return { conFranquicia, excedente, derechos, tasa, iva, total: derechos + tasa + iva };
}

/**
 * Cotiza un envío. No guarda nada: devuelve el desglose y los avisos.
 * @param {object} estado
 * @param {{ tarifaId: string, regimen?: "courier"|"general", items: {descripcion:string, valorCentavos:number, unidades?:number, categoria?:string}[],
 *           gramos?: number, medidas?: {l:number,a:number,h:number}, seguro?: boolean, clienteId?: string, paquetes?: number }} pedido
 */
export function cotizar(estado, pedido) {
  const t = tarifa(estado, pedido.tarifaId);
  if (!t) return { ok: false, motivo: "Elegí desde dónde y por qué vía." };
  const items = (pedido.items ?? []).filter((it) => it && it.valorCentavos > 0);
  if (!items.length) return { ok: false, motivo: "Cargá al menos un producto con su valor." };
  const regimen = pedido.regimen ?? (t.regimenes.includes("courier") ? "courier" : "general");
  if (!t.regimenes.includes(regimen)) {
    return { ok: false, motivo: `${ORIGENES[t.origen]} por ${VIAS[t.via].toLowerCase()} va sólo con despachante (régimen general).` };
  }
  const cfg = estado.config;
  const R = estado.regimen;
  const valor = valorItems(items);

  // Flete
  let flete, cobrado = null, cbm = null;
  if (t.porCbmCentavos) {
    cbm = Math.max(cbmMilesimas(pedido.medidas ?? {}), t.minimoCbmMilesimas ?? 0);
    flete = Math.round((t.porCbmCentavos * cbm) / 1000);
  } else {
    cobrado = pesoACobrar(t, { gramos: pedido.gramos ?? 0, medidas: pedido.medidas });
    flete = Math.round((t.porKgCentavos * cobrado) / 1000);
  }
  const seguro = pedido.seguro ? porcentaje(valor, cfg.seguroTasa) : 0;
  const honorario = Math.max(cfg.honorarioMinimoCentavos, porcentaje(valor, cfg.honorarioTasa));
  const manejo = cfg.manejoPorPaqueteCentavos * Math.max(1, pedido.paquetes ?? 1);
  const despachante = regimen === "general" ? cfg.despachanteCentavos : 0;
  const c = pedido.clienteId ? cliente(estado, pedido.clienteId) : null;
  const cupo = c ? cupoCourier(estado, c.id) : null;
  const conFranquicia = !(c?.tipo === "pyme") && !(cupo?.aplica && cupo.quedan === 0);
  const impuestos = regimen === "courier" ? impuestosCourier(R, valor, valor + flete + seguro, { conFranquicia }) : null;
  const servicio = flete + seguro + honorario + manejo + despachante;
  const total = servicio + (impuestos?.total ?? 0);

  // Avisos: lo que el cliente tiene que saber ANTES de comprar.
  const avisos = [];
  if (regimen === "courier") {
    if (valor > R.topeEnvioCentavos) {
      avisos.push({ tipo: "tope", grave: true, texto: `Pasa el tope de ${usd(R.topeEnvioCentavos)} por envío del courier. Partilo en varios envíos o va con despachante.` });
    }
    if ((pedido.gramos ?? 0) > R.pesoMaxGramos) {
      avisos.push({ tipo: "peso", grave: false, texto: `Pasa los ${kg(R.pesoMaxGramos)}: va en más de un bulto (el tope del courier es por paquete).` });
    }
    const repetidos = items.filter((it) => (it.unidades ?? 1) > R.unidadesMaxPorProducto);
    if (repetidos.length) {
      avisos.push({ tipo: "unidades", grave: true, texto: `Más de ${R.unidadesMaxPorProducto} unidades iguales de «${repetidos[0].descripcion}»: la aduana lo toma como comercial. Va con despachante.` });
    }
    if (c?.tipo === "pyme") {
      avisos.push({ tipo: "pyme", grave: false, texto: "Una empresa por courier paga todo sin franquicia y, si es responsable inscripta, no computa ese IVA: con despachante suele convenir." });
    } else if (cupo?.aplica && cupo.quedan === 0) {
      avisos.push({ tipo: "cupo", grave: false, texto: `${c.nombre} ya usó sus ${cupo.total} envíos con franquicia del año: este paga sobre el total.` });
    } else if (cupo?.aplica && cupo.quedan === 1) {
      avisos.push({ tipo: "cupo", grave: false, texto: `Es el último envío con franquicia del año de ${c.nombre}.` });
    }
    if (impuestos?.conFranquicia && impuestos.excedente === 0) {
      avisos.push({ tipo: "franquicia", grave: false, texto: `Entra en la franquicia de ${usd(R.franquiciaCentavos)}: sin derechos, sólo IVA.` });
    }
  }
  const restringidos = items.filter((it) => CATEGORIAS_RESTRINGIDAS[it.categoria]);
  for (const it of restringidos) {
    const r = CATEGORIAS_RESTRINGIDAS[it.categoria];
    avisos.push({ tipo: "restringido", grave: r.prohibido, texto: `«${it.descripcion}»: ${r.texto}` });
  }

  return {
    ok: true,
    cotizacion: {
      tarifaId: t.id, origen: t.origen, via: t.via, regimen, dias: t.dias,
      valor, flete, seguro, honorario, manejo, despachante, impuestos, servicio, total,
      pesoCobradoGramos: cobrado, cbmMilesimas: cbm,
      tipoCambio: cfg.tipoCambio, totalPesos: aPesos(total, cfg.tipoCambio),
      items: items.map((it) => ({ ...it })),
      gramos: pedido.gramos ?? 0, medidas: pedido.medidas ? { ...pedido.medidas } : null, conSeguro: !!pedido.seguro,
    },
    avisos,
    bloqueado: avisos.some((a) => a.grave),
  };
}

/**
 * Categorías que el courier no admite o que necesitan intervención de un organismo. Lista corta de DEMO;
 * la completa la valida el despachante.
 */
export const CATEGORIAS_RESTRINGIDAS = Object.freeze({
  baterias: { prohibido: false, texto: "las baterías de litio sueltas no vuelan; dentro del equipo, sí, declaradas." },
  alimentos: { prohibido: false, texto: "alimentos necesitan intervención de INAL/SENASA." },
  medicamentos: { prohibido: true, texto: "medicamentos no entran por courier sin receta y autorización de ANMAT." },
  cosmeticos: { prohibido: false, texto: "cosméticos con límite de unidades e intervención de ANMAT." },
  armas: { prohibido: true, texto: "armas y réplicas no se importan por courier." },
  telefonia: { prohibido: false, texto: "equipos con radio (celulares, routers) pueden pedir homologación de ENACOM." },
});

export const CATEGORIAS = Object.freeze({
  general: "General",
  electronica: "Electrónica",
  ropa: "Ropa y calzado",
  repuestos: "Repuestos",
  baterias: "Baterías",
  alimentos: "Alimentos",
  medicamentos: "Medicamentos",
  cosmeticos: "Cosméticos",
  telefonia: "Celulares y radio",
  armas: "Armas o réplicas",
});

/**
 * INNOVACIÓN — «Partir para ahorrar»: reparte los productos en envíos courier para que cada uno quede lo más
 * cerca posible de la franquicia y sin pasar el tope, respetando el cupo que le queda al cliente.
 * Devuelve los grupos y cuánto se ahorra en impuestos contra mandar todo junto. Heurística (primero el más caro,
 * al grupo que menos impuesto agregue); el despachante valida que la partición sea legítima (compras distintas).
 */
export function partirParaAhorrar(estado, items, { cupo = Infinity, fleteCentavosPorEnvio = 0 } = {}) {
  const R = estado.regimen;
  const unidades = [];
  for (const it of items) for (let i = 0; i < Math.max(1, it.unidades ?? 1); i++) unidades.push({ descripcion: it.descripcion, valorCentavos: it.valorCentavos });
  if (!unidades.length) return { ok: false, motivo: "No hay productos para repartir." };
  if (unidades.some((u) => u.valorCentavos > R.topeEnvioCentavos)) {
    return { ok: false, motivo: `Hay un producto que solo pasa el tope de ${usd(R.topeEnvioCentavos)}: va con despachante.` };
  }
  unidades.sort((a, b) => b.valorCentavos - a.valorCentavos);
  const maxGrupos = Math.max(1, Math.min(cupo, unidades.length));
  const grupos = [];
  const impuestoDe = (v) => impuestosCourier(R, v, v + fleteCentavosPorEnvio).total;
  for (const u of unidades) {
    let mejor = -1, mejorCosto = Infinity;
    grupos.forEach((g, i) => {
      const nuevo = g.valor + u.valorCentavos;
      if (nuevo > R.topeEnvioCentavos) return;
      const costo = impuestoDe(nuevo) - impuestoDe(g.valor);
      if (costo < mejorCosto) { mejor = i; mejorCosto = costo; }
    });
    const costoNuevo = impuestoDe(u.valorCentavos);
    if (grupos.length < maxGrupos && (mejor === -1 || costoNuevo < mejorCosto)) {
      grupos.push({ valor: u.valorCentavos, items: [u] });
    } else if (mejor >= 0) {
      grupos[mejor].valor += u.valorCentavos;
      grupos[mejor].items.push(u);
    } else {
      return { ok: false, motivo: `No alcanza el cupo: harían falta más de ${maxGrupos} envíos sin pasar el tope.` };
    }
  }
  const total = unidades.reduce((s, u) => s + u.valorCentavos, 0);
  const juntos = total <= R.topeEnvioCentavos ? impuestoDe(total) : null;
  const partido = grupos.reduce((s, g) => s + impuestoDe(g.valor), 0);
  return {
    ok: true,
    grupos: grupos.map((g) => ({ valor: g.valor, impuestos: impuestoDe(g.valor), items: g.items })),
    impuestosJuntos: juntos,
    impuestosPartido: partido,
    ahorro: juntos == null ? null : juntos - partido,
    fletesExtra: (grupos.length - 1) * fleteCentavosPorEnvio,
  };
}

/** Guarda la cotización para el cliente (lead), con vencimiento. */
export function guardarCotizacion(estado, pedido, { clienteId = null, contacto = "" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "cotizar");
  if (!a.ok) return a;
  const r = cotizar(estado, { ...pedido, clienteId });
  if (!r.ok) return r;
  const q = {
    id: nuevoId("q-"), clienteId, contacto, fecha: hoy, vence: sumarDias(hoy, estado.config.validezCotizacionDias),
    ...r.cotizacion, avisos: r.avisos, estado: "abierta",
  };
  estado.cotizaciones.unshift(q);
  registrar(estado, `Cotización ${usd(q.total)} para ${clienteId ? cliente(estado, clienteId)?.nombre : contacto || "consulta"}.`, hoy);
  return { ok: true, cotizacion: q };
}

export const cotizacionVencida = (q, hoy) => q.estado === "abierta" && hoy > q.vence;

// ───────────────────────── confirmar y cobrar ─────────────────────────

function codigoEnvio(estado) {
  estado.numerador.n += 1;
  const n = String(estado.numerador.n).padStart(4, "0");
  // dígito de control para que un código tipeado mal no encuentre otro envío
  const base = `${estado.numerador.anio}${n}`;
  const control = [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10;
  return `TV-${estado.numerador.anio}-${n}-${control}`;
}

export function validarCodigo(codigo) {
  const m = /^TV-(\d{4})-(\d{4})-(\d)$/.exec(String(codigo ?? "").trim().toUpperCase());
  if (!m) return false;
  const base = `${m[1]}${m[2]}`;
  return [...base].reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0) % 10 === Number(m[3]);
}

/**
 * El cliente acepta: nace el envío con la cotización congelada. Si hay seña ≥ la del config, el tipo de cambio
 * queda congelado para el saldo; sin seña, el saldo se cobra al cambio del día en que se paga.
 */
export function confirmarEnvio(estado, { cotizacionId, clienteId }, auth, hoy) {
  const a = autorizar(estado, auth, "confirmar");
  if (!a.ok) return a;
  const q = estado.cotizaciones.find((x) => x.id === cotizacionId);
  if (!q) return { ok: false, motivo: "No encuentro la cotización." };
  if (q.estado !== "abierta") return { ok: false, motivo: "Esa cotización ya se usó o se cerró." };
  if (cotizacionVencida(q, hoy)) return { ok: false, motivo: `La cotización venció el ${dm(q.vence)}: recotizá con el cambio de hoy.` };
  const c = cliente(estado, clienteId ?? q.clienteId);
  if (!c) return { ok: false, motivo: "Para confirmar hace falta la ficha del cliente (con CUIT/CUIL)." };
  const r = cotizar(estado, { tarifaId: q.tarifaId, regimen: q.regimen, items: q.items, gramos: q.gramos, medidas: q.medidas, seguro: q.conSeguro, clienteId: c.id });
  if (!r.ok) return r;
  const graves = r.avisos.filter((x) => x.grave);
  if (graves.length) return { ok: false, motivo: graves[0].texto };
  const e = {
    id: nuevoId("e-"), codigo: codigoEnvio(estado), clienteId: c.id, estado: "confirmado", confirmadoEl: hoy,
    regimen: q.regimen, tarifaId: q.tarifaId, origen: q.origen, via: q.via,
    cotizacion: { ...q, avisos: undefined }, ajustes: [], pagos: [], paquetes: [], eventos: [], embarqueId: null,
    tcCongelado: null, desvio: null, entregaIntentos: 0, retenerHasta: null,
  };
  e.eventos.push({ fecha: hoy, estado: "confirmado", texto: "Confirmado por el cliente." });
  estado.envios.unshift(e);
  c.envios.push(e.id);
  q.estado = "confirmada";
  q.envioId = e.id;
  registrar(estado, `${c.nombre} confirmó el envío ${e.codigo}.`, hoy);
  return { ok: true, envio: e };
}

/** Lo que vale el envío hoy: la cotización más los ajustes (diferencia de peso, almacenaje, bonificaciones). */
export function totalEnvio(e) {
  return e.cotizacion.total + e.ajustes.reduce((s, x) => s + x.centavos, 0);
}

export function pagadoEnvio(e) {
  return e.pagos.reduce((s, p) => s + p.centavos, 0);
}

export function saldoEnvio(e) {
  return totalEnvio(e) - pagadoEnvio(e);
}

/** Tipo de cambio que se usa para cobrar el saldo de este envío hoy. */
export function tcParaCobrar(estado, e) {
  return e.tcCongelado ?? estado.config.tipoCambio;
}

/**
 * Cobra un pago. `monto` en la moneda del medio: pesos enteros para transferencia/MP/efectivo/tarjeta,
 * centavos de dólar para dólares billete. Lo que entra queda en la caja en su moneda.
 */
export function cobrar(estado, envioId, { medio, monto, concepto = "" }, auth, hoy) {
  const a = autorizar(estado, auth, "cobrar");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (e.estado === "cancelado") return { ok: false, motivo: "El envío está cancelado." };
  if (!MEDIOS[medio]) return { ok: false, motivo: "Elegí el medio de pago." };
  const valor = Math.round(Number(monto));
  if (!(valor > 0)) return { ok: false, motivo: "Poné el monto." };
  const enDolares = MEDIOS_EN_DOLARES.has(medio);
  const tc = tcParaCobrar(estado, e);
  const centavos = enDolares ? valor : aCentavos(valor, tc);
  const saldo = saldoEnvio(e);
  // Tolerancia de redondeo: medio dólar por el cambio a pesos.
  if (centavos > saldo + 50) {
    return { ok: false, motivo: `Es más que el saldo (${usd(saldo)} = ${pesos(aPesos(saldo, tc))}).` };
  }
  const pago = { id: nuevoId("p-"), fecha: hoy, medio, moneda: enDolares ? "USD" : "ARS", monto: valor, centavos: Math.min(centavos, saldo), tc, concepto, por: a.usuario.id };
  e.pagos.push(pago);
  estado.caja.unshift({ ...pago, envioId: e.id, tipo: "ingreso" });
  // La seña congela el cambio para el saldo.
  if (!e.tcCongelado && pagadoEnvio(e) >= porcentaje(totalEnvio(e), estado.config.senaTasa)) {
    e.tcCongelado = tc;
  }
  if (e.estado === "confirmado") moverEstado(e, "esperando", hoy, "Seña recibida: ya podés comprar y mandar a la casilla.");
  registrar(estado, `Cobro ${enDolares ? usd(valor) : pesos(valor)} (${MEDIOS[medio]}) en ${e.codigo}.`, hoy);
  return { ok: true, pago, saldo: saldoEnvio(e) };
}

function moverEstado(e, nuevo, fecha, texto) {
  e.estado = nuevo;
  e.eventos.push({ fecha, estado: nuevo, texto });
}

// ───────────────────────── depósito: recibir, pesar, asignar ─────────────────────────

/** El cliente avisa qué compró y con qué tracking del vendedor (pre-alerta). */
export function prealertar(estado, envioId, { tracking, tienda = "", descripcion = "" }, hoy) {
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  const t = String(tracking ?? "").trim().toUpperCase();
  if (t.length < 6) return { ok: false, motivo: "El tracking del vendedor tiene que tener al menos 6 caracteres." };
  e.prealertas = e.prealertas ?? [];
  if (estado.envios.some((x) => (x.prealertas ?? []).some((p) => p.tracking === t))) return { ok: false, motivo: "Ese tracking ya está avisado en otro envío." };
  e.prealertas.push({ tracking: t, tienda, descripcion, fecha: hoy });
  // Si el paquete ya había llegado sin dueño, se asigna solo.
  const huerfano = estado.paquetes.find((p) => p.tracking === t && !p.envioId);
  if (huerfano) asignarInterno(estado, huerfano, e, hoy);
  return { ok: true, asignado: !!huerfano };
}

/**
 * Depósito recibe un bulto: tracking, peso, medidas, estado. Se busca el dueño por la pre-alerta y, si no,
 * por la casilla escrita en la etiqueta. Si no aparece, queda «sin dueño» en la bandeja (no se embarca).
 */
export function recibirPaquete(estado, { tracking, gramos, medidas = null, casillaEtiqueta = "", danado = false, contenido = "", categoria = "general", deposito = "miami" }, auth, hoy) {
  const a = autorizar(estado, auth, "recibir");
  if (!a.ok) return a;
  const t = String(tracking ?? "").trim().toUpperCase();
  if (!t) return { ok: false, motivo: "Escaneá o tipeá el tracking de la etiqueta." };
  if (estado.paquetes.some((p) => p.tracking === t)) return { ok: false, motivo: "Ese tracking ya se recibió: revisá si es un duplicado." };
  const g = Math.round(Number(gramos));
  if (!(g > 0)) return { ok: false, motivo: "Pesá el paquete antes de recibirlo." };
  const p = {
    id: nuevoId("k-"), tracking: t, gramos: g, medidas: medidas ? { ...medidas } : null, danado: !!danado, contenido, categoria,
    deposito, recibido: hoy, envioId: null, foto: true, retenido: CATEGORIAS_RESTRINGIDAS[categoria]?.prohibido ? "prohibido" : null,
    casillaEtiqueta: String(casillaEtiqueta).trim().toUpperCase(),
  };
  const porPrealerta = estado.envios.find((e) => (e.prealertas ?? []).some((x) => x.tracking === t));
  const porCasilla = !porPrealerta && p.casillaEtiqueta
    ? estado.envios.filter((e) => cliente(estado, e.clienteId)?.casilla === p.casillaEtiqueta && (e.estado === "esperando" || e.estado === "en_deposito"))
    : [];
  const destino = porPrealerta ?? (porCasilla.length === 1 ? porCasilla[0] : null);
  if (destino?.regimen === "courier" && g > estado.regimen.pesoMaxGramos) {
    return { ok: false, motivo: `Un paquete de courier no puede pasar los ${kg(estado.regimen.pesoMaxGramos)}: hay que dividirlo o pasar ${destino.codigo} a despachante.` };
  }
  estado.paquetes.unshift(p);
  if (destino) asignarInterno(estado, p, destino, hoy);
  registrar(estado, `Recibido ${t} (${kg(g)})${destino ? ` → ${destino.codigo}` : " SIN DUEÑO"}${p.danado ? " · llegó dañado" : ""}.`, hoy);
  return { ok: true, paquete: p, envio: destino ?? null };
}

function asignarInterno(estado, p, e, hoy) {
  p.envioId = e.id;
  if (!e.paquetes.includes(p.id)) e.paquetes.push(p.id);
  if (e.estado === "esperando" || e.estado === "confirmado") moverEstado(e, "en_deposito", hoy, `Llegó al depósito de ${ORIGENES[p.deposito] ?? p.deposito}.`);
}

/** Asigna a mano un paquete sin dueño (depósito lo identificó por la factura o por WhatsApp). */
export function asignarPaquete(estado, paqueteId, envioId, auth, hoy) {
  const a = autorizar(estado, auth, "asignar");
  if (!a.ok) return a;
  const p = paquete(estado, paqueteId);
  const e = envio(estado, envioId);
  if (!p || !e) return { ok: false, motivo: "No encuentro el paquete o el envío." };
  if (p.envioId) return { ok: false, motivo: "Ese paquete ya tiene dueño." };
  if (!["confirmado", "esperando", "en_deposito"].includes(e.estado)) return { ok: false, motivo: `El envío ${e.codigo} ya salió del depósito.` };
  asignarInterno(estado, p, e, hoy);
  registrar(estado, `Paquete ${p.tracking} asignado a ${e.codigo}.`, hoy);
  return { ok: true };
}

/** Peso real de todos los paquetes del envío y el peso que se cobra con las medidas de cada uno. */
export function pesoRealEnvio(estado, e) {
  const t = tarifa(estado, e.tarifaId);
  const ps = e.paquetes.map((id) => paquete(estado, id)).filter(Boolean);
  const real = ps.reduce((s, p) => s + p.gramos, 0);
  const cobrado = t?.porKgCentavos ? ps.reduce((s, p) => s + Math.max(p.gramos, pesoVolumetrico(p.medidas ?? {}, t.divisorVolumetrico)), 0) : null;
  return { real, cobrado: cobrado == null ? null : Math.max(cobrado, t.minimoGramos ?? 0), paquetes: ps.length };
}

/**
 * Compara lo que llegó con lo cotizado. Si la diferencia pasa la tolerancia, propone el ajuste (a favor o en
 * contra del cliente) para que Atención lo avise ANTES de embarcar — el cliente no se entera en destino.
 */
export function diferenciaDePeso(estado, envioId, hoy = null) {
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  const t = tarifa(estado, e.tarifaId);
  if (!t?.porKgCentavos) return { ok: true, hay: false };
  // Mientras falten compras avisadas o el cliente pidió esperar más, no se compara: el envío no está completo.
  const faltan = (e.prealertas ?? []).some((x) => !estado.paquetes.some((p) => p.tracking === x.tracking && p.envioId === e.id));
  if (faltan || (hoy && e.retenerHasta && hoy < e.retenerHasta)) return { ok: true, hay: false, incompleto: true };
  const { cobrado } = pesoRealEnvio(estado, e);
  if (!cobrado) return { ok: true, hay: false };
  const cotizado = e.cotizacion.pesoCobradoGramos ?? 0;
  const tolerancia = Math.round(cotizado * estado.config.toleranciaPesoTasa);
  const delta = cobrado - cotizado;
  if (Math.abs(delta) <= tolerancia) return { ok: true, hay: false, cotizado, cobrado };
  const centavos = Math.round((t.porKgCentavos * delta) / 1000);
  return { ok: true, hay: true, cotizado, cobrado, delta, centavos };
}

/** Aplica el ajuste por peso (lo confirma Atención después de avisarle al cliente). */
export function aplicarDiferenciaDePeso(estado, envioId, auth, hoy) {
  const a = autorizar(estado, auth, "cotizar");
  if (!a.ok) return a;
  const d = diferenciaDePeso(estado, envioId, hoy);
  if (!d.ok) return d;
  if (!d.hay) return { ok: false, motivo: "No hay diferencia de peso para ajustar." };
  const e = envio(estado, envioId);
  if (e.ajustes.some((x) => x.tipo === "peso")) return { ok: false, motivo: "El ajuste por peso ya está aplicado." };
  e.ajustes.push({ tipo: "peso", centavos: d.centavos, texto: `Peso real ${kg(d.cobrado)} (cotizado ${kg(d.cotizado)})`, fecha: hoy });
  registrar(estado, `Ajuste por peso ${usd(d.centavos)} en ${e.codigo}.`, hoy);
  return { ok: true, centavos: d.centavos };
}

/** Almacenaje que corre: días pasados los gratis, por paquete. */
export function almacenaje(estado, p, hoy) {
  if (!p || p.salio) return { dias: 0, centavos: 0, faltan: null };
  const dias = diasEntre(p.recibido, hoy);
  const gratis = estado.config.almacenajeDiasGratis;
  const cobrables = Math.max(0, dias - gratis);
  return { dias, cobrables, centavos: cobrables * estado.config.almacenajePorDiaCentavos, faltan: gratis - dias };
}

/** El cliente pide esperar más compras antes de consolidar (retener hasta una fecha). */
export function retenerParaConsolidar(estado, envioId, hasta, hoy) {
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (e.estado !== "en_deposito" && e.estado !== "esperando") return { ok: false, motivo: "Sólo se retiene un envío que todavía está en el depósito." };
  const tope = sumarDias(hoy, estado.config.almacenajeDiasGratis);
  e.retenerHasta = hasta;
  e.eventos.push({ fecha: hoy, estado: e.estado, texto: `Espera más compras hasta el ${dm(hasta)}.` });
  return { ok: true, avisoAlmacenaje: hasta > tope ? `Pasados los ${estado.config.almacenajeDiasGratis} días gratis corre almacenaje.` : null };
}

// ───────────────────────── embarques ─────────────────────────

/**
 * ¿Este envío puede subir a un embarque? Todo lo que lo frena, en criollo. Es la regla que más plata cuida:
 * no se embarca un paquete sin dueño, con diferencia de peso sin avisar, prohibido, dañado sin respuesta del
 * cliente, ni un envío sin seña.
 */
export function listoParaEmbarcar(estado, e, hoy) {
  const frenos = [];
  if (e.estado !== "en_deposito") frenos.push(`está «${ESTADOS[e.estado]}»`);
  const ps = e.paquetes.map((id) => paquete(estado, id)).filter(Boolean);
  if (!ps.length) frenos.push("no tiene paquetes recibidos");
  const faltan = (e.prealertas ?? []).filter((x) => !estado.paquetes.some((p) => p.tracking === x.tracking && p.envioId === e.id));
  if (faltan.length) frenos.push(`faltan ${faltan.length} paquete(s) avisado(s)`);
  if (ps.some((p) => p.retenido === "prohibido")) frenos.push("tiene un producto prohibido");
  if (ps.some((p) => p.danado && !p.danoResuelto)) frenos.push("tiene un paquete dañado sin respuesta del cliente");
  const d = diferenciaDePeso(estado, e.id, hoy);
  if (d.hay && !e.ajustes.some((x) => x.tipo === "peso")) frenos.push("tiene diferencia de peso sin avisar");
  if (pagadoEnvio(e) < porcentaje(totalEnvio(e), estado.config.senaTasa)) frenos.push("no tiene la seña");
  if (e.retenerHasta && hoy && hoy < e.retenerHasta) frenos.push(`el cliente pidió esperar hasta el ${dm(e.retenerHasta)}`);
  return { ok: frenos.length === 0, frenos };
}

export function crearEmbarque(estado, { tarifaId, referencia, salida, llegada }, auth, hoy) {
  const a = autorizar(estado, auth, "embarcar");
  if (!a.ok) return a;
  const t = tarifa(estado, tarifaId);
  if (!t) return { ok: false, motivo: "Elegí la ruta del embarque." };
  if (!String(referencia ?? "").trim()) return { ok: false, motivo: t.via === "maritimo" ? "Poné el contenedor o el BL." : t.via === "aereo" ? "Poné la guía aérea (AWB)." : "Poné la patente o la carta de porte." };
  const b = { id: nuevoId("b-"), tarifaId, via: t.via, origen: t.origen, referencia: referencia.trim(), salida, llegada, llegadaOriginal: llegada, estado: "armando", envios: [], costoRealCentavos: 0, demoras: [] };
  estado.embarques.unshift(b);
  registrar(estado, `Embarque ${b.referencia} (${ORIGENES[t.origen]} ${VIAS[t.via].toLowerCase()}) abierto.`, hoy);
  return { ok: true, embarque: b };
}

export function subirAEmbarque(estado, embarqueId, envioId, auth, hoy) {
  const a = autorizar(estado, auth, "embarcar");
  if (!a.ok) return a;
  const b = embarque(estado, embarqueId);
  const e = envio(estado, envioId);
  if (!b || !e) return { ok: false, motivo: "No encuentro el embarque o el envío." };
  if (b.estado !== "armando") return { ok: false, motivo: "Ese embarque ya salió." };
  if (b.tarifaId !== e.tarifaId) return { ok: false, motivo: `${e.codigo} va por otra ruta.` };
  const l = listoParaEmbarcar(estado, e, hoy);
  if (!l.ok) return { ok: false, motivo: `${e.codigo} no puede subir: ${l.frenos.join(", ")}.` };
  b.envios.push(e.id);
  e.embarqueId = b.id;
  moverEstado(e, "embarcado", hoy, `Sube al embarque ${b.referencia}.`);
  return { ok: true };
}

/** Sale el embarque: todos sus envíos pasan a «En viaje» y se avisa a cada cliente. */
export function despacharEmbarque(estado, embarqueId, { costoRealCentavos = 0 } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "despachar");
  if (!a.ok) return a;
  const b = embarque(estado, embarqueId);
  if (!b) return { ok: false, motivo: "No encuentro el embarque." };
  if (b.estado !== "armando") return { ok: false, motivo: "Ese embarque ya salió." };
  if (!b.envios.length) return { ok: false, motivo: "El embarque está vacío." };
  b.estado = "en_transito";
  b.salida = hoy;
  b.costoRealCentavos = Math.round(costoRealCentavos) || 0;
  const avisos = [];
  for (const id of b.envios) {
    const e = envio(estado, id);
    moverEstado(e, "en_transito", hoy, `Salió en ${b.referencia}. Llegada estimada: ${dm(b.llegada)}.`);
    for (const pid of e.paquetes) { const p = paquete(estado, pid); if (p) p.salio = hoy; }
    avisos.push(mensaje("salio", estado, e));
  }
  registrar(estado, `Salió el embarque ${b.referencia} con ${b.envios.length} envío(s).`, hoy);
  return { ok: true, avisos };
}

/**
 * INNOVACIÓN — demora con aviso masivo: se carga UNA vez la nueva fecha del vuelo/contenedor y sale un mensaje
 * listo por cada cliente del embarque. El referente lo deja «a criterio»: acá no se olvida a nadie.
 */
export function demorarEmbarque(estado, embarqueId, { nuevaLlegada, motivo }, auth, hoy) {
  const a = autorizar(estado, auth, "despachar");
  if (!a.ok) return a;
  const b = embarque(estado, embarqueId);
  if (!b) return { ok: false, motivo: "No encuentro el embarque." };
  if (b.estado !== "en_transito" && b.estado !== "armando") return { ok: false, motivo: "El embarque ya llegó." };
  if (!nuevaLlegada || nuevaLlegada <= b.llegada) return { ok: false, motivo: "La nueva fecha tiene que ser posterior a la anterior." };
  const m = String(motivo ?? "").trim();
  if (!m) return { ok: false, motivo: "Contá el motivo (el cliente lo va a leer)." };
  b.demoras.push({ fecha: hoy, desde: b.llegada, hasta: nuevaLlegada, motivo: m });
  b.llegada = nuevaLlegada;
  const avisos = b.envios.map((id) => {
    const e = envio(estado, id);
    e.eventos.push({ fecha: hoy, estado: e.estado, texto: `Demora: ${m}. Nueva llegada estimada: ${dm(nuevaLlegada)}.` });
    return mensaje("demora", estado, e, { motivo: m, fecha: nuevaLlegada });
  });
  registrar(estado, `Demora en ${b.referencia}: ${m} → ${dm(nuevaLlegada)}.`, hoy);
  return { ok: true, avisos };
}

/** Llega el embarque: todos sus envíos entran a aduana. */
export function arriboEmbarque(estado, embarqueId, auth, hoy) {
  const a = autorizar(estado, auth, "despachar");
  if (!a.ok) return a;
  const b = embarque(estado, embarqueId);
  if (!b) return { ok: false, motivo: "No encuentro el embarque." };
  if (b.estado !== "en_transito") return { ok: false, motivo: "El embarque no está en viaje." };
  b.estado = "arribado";
  b.arribo = hoy;
  for (const id of b.envios) moverEstado(envio(estado, id), "en_aduana", hoy, "Llegó a Argentina: en aduana.");
  registrar(estado, `Arribó ${b.referencia}.`, hoy);
  return { ok: true };
}

// ───────────────────────── aduana ─────────────────────────

/** La aduana libera el envío: queda listo para entregar (y se avisa el saldo). */
export function liberarAduana(estado, envioId, { impuestosRealesCentavos = null } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "aduana");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (e.estado !== "en_aduana") return { ok: false, motivo: "El envío no está en aduana." };
  if (e.desvio?.tipo === "observado" && !e.desvio.resuelto) return { ok: false, motivo: "Tiene una observación abierta: resolvela primero." };
  // Si la aduana liquidó distinto de lo estimado, la diferencia se ajusta (a favor o en contra).
  if (impuestosRealesCentavos != null && e.cotizacion.impuestos) {
    const delta = Math.round(impuestosRealesCentavos) - e.cotizacion.impuestos.total;
    if (delta !== 0) e.ajustes.push({ tipo: "impuestos", centavos: delta, texto: "Liquidación de la aduana distinta de la estimada", fecha: hoy });
  }
  moverEstado(e, "listo", hoy, "Liberado por la aduana.");
  e.listoDesde = hoy;
  return { ok: true, saldo: saldoEnvio(e), aviso: mensaje("listo", estado, e) };
}

/** La aduana observa (canal rojo, pide factura, valor dudoso): el envío queda frenado con un pedido concreto. */
export function observarAduana(estado, envioId, { motivo, pide = "factura", plazoDias = 5 }, auth, hoy) {
  const a = autorizar(estado, auth, "aduana");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (e.estado !== "en_aduana") return { ok: false, motivo: "El envío no está en aduana." };
  const m = String(motivo ?? "").trim();
  if (!m) return { ok: false, motivo: "Contá qué observó la aduana." };
  e.desvio = { tipo: "observado", motivo: m, pide, desde: hoy, vence: sumarDias(hoy, plazoDias), resuelto: false };
  e.eventos.push({ fecha: hoy, estado: e.estado, texto: `Observado por la aduana: ${m}.` });
  return { ok: true, aviso: mensaje("observado", estado, e) };
}

export function resolverObservacion(estado, envioId, { nota = "" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "aduana");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e?.desvio || e.desvio.tipo !== "observado" || e.desvio.resuelto) return { ok: false, motivo: "No hay observación abierta." };
  e.desvio.resuelto = hoy;
  e.eventos.push({ fecha: hoy, estado: e.estado, texto: `Observación resuelta${nota ? `: ${nota}` : ""}.` });
  return { ok: true };
}

// ───────────────────────── entrega ─────────────────────────

/** Sale a reparto o se entrega en la oficina. No se entrega con saldo. */
export function entregar(estado, envioId, { modo = "domicilio" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "entregar");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (e.estado !== "listo" && e.estado !== "en_reparto") return { ok: false, motivo: `Todavía está «${ESTADOS[e.estado]}».` };
  const saldo = saldoEnvio(e);
  if (saldo > 50) return { ok: false, motivo: `Tiene saldo de ${usd(saldo)} (${pesos(aPesos(saldo, tcParaCobrar(estado, e)))}): cobralo antes de entregar.` };
  if (modo === "domicilio" && e.estado === "listo") {
    moverEstado(e, "en_reparto", hoy, "Salió a reparto.");
    return { ok: true, enReparto: true, aviso: mensaje("reparto", estado, e) };
  }
  moverEstado(e, "entregado", hoy, modo === "oficina" ? "Retirado en la oficina." : "Entregado en el domicilio.");
  e.entregadoEl = hoy;
  registrar(estado, `Entregado ${e.codigo}.`, hoy);
  return { ok: true, entregado: true };
}

/** No había nadie: se reintenta una vez; a la segunda, queda para retirar en la oficina. */
export function entregaFallida(estado, envioId, { motivo = "No había nadie" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "entregar");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e || e.estado !== "en_reparto") return { ok: false, motivo: "El envío no está en reparto." };
  e.entregaIntentos += 1;
  const aOficina = e.entregaIntentos >= 2;
  moverEstado(e, "listo", hoy, `${motivo}. ${aOficina ? "Queda para retirar en la oficina." : "Se reintenta."}`);
  if (aOficina) e.retiroEnOficina = true;
  return { ok: true, aOficina, aviso: mensaje(aOficina ? "retiro" : "reintento", estado, e) };
}

// ───────────────────────── cancelar y devolver seña ─────────────────────────

/**
 * Cancelación: antes de que el cliente compre (sin paquetes) se devuelve todo; con paquetes en depósito se
 * retienen el manejo y el almacenaje; embarcado ya no se cancela (se gestiona como devolución del producto).
 */
export function cancelarEnvio(estado, envioId, { motivo = "" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "cancelar");
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  if (!["confirmado", "esperando", "en_deposito"].includes(e.estado)) return { ok: false, motivo: "Ya salió del depósito: no se cancela, se gestiona como devolución." };
  const ps = e.paquetes.map((id) => paquete(estado, id)).filter(Boolean);
  const retiene = ps.length
    ? Math.min(pagadoEnvio(e), ps.reduce((s, p) => s + estado.config.manejoPorPaqueteCentavos + almacenaje(estado, p, hoy).centavos, 0))
    : 0;
  const devolver = Math.max(0, pagadoEnvio(e) - retiene);
  moverEstado(e, "cancelado", hoy, `Cancelado${motivo ? `: ${motivo}` : ""}.`);
  e.devolucionPendiente = devolver;
  registrar(estado, `Cancelado ${e.codigo}: se devuelve ${usd(devolver)}, se retiene ${usd(retiene)}.`, hoy);
  return { ok: true, devolver, retiene };
}

/** Devolver la seña mueve plata: lo hace el dueño con su PIN. */
export function devolverSena(estado, envioId, { medio = "transferencia" } = {}, auth, hoy) {
  const a = autorizar(estado, auth, "devolver", true);
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e || e.estado !== "cancelado" || !(e.devolucionPendiente > 0)) return { ok: false, motivo: "No hay devolución pendiente." };
  const tc = tcParaCobrar(estado, e);
  const enDolares = MEDIOS_EN_DOLARES.has(medio);
  const centavos = e.devolucionPendiente;
  estado.caja.unshift({ id: nuevoId("p-"), fecha: hoy, medio, moneda: enDolares ? "USD" : "ARS", monto: enDolares ? centavos : aPesos(centavos, tc), centavos, tc, concepto: `Devolución ${e.codigo}`, envioId: e.id, tipo: "egreso", por: a.usuario.id });
  e.devolucionPendiente = 0;
  return { ok: true, centavos };
}

/** Bonificación (ej. por un paquete dañado o una demora larga): la autoriza el dueño con su PIN. */
export function bonificar(estado, envioId, { centavos, motivo }, auth, hoy) {
  const a = autorizar(estado, auth, "bonificar", true);
  if (!a.ok) return a;
  const e = envio(estado, envioId);
  if (!e) return { ok: false, motivo: "No encuentro el envío." };
  const c = Math.round(Number(centavos));
  if (!(c > 0)) return { ok: false, motivo: "Poné cuánto se bonifica." };
  if (!String(motivo ?? "").trim()) return { ok: false, motivo: "Contá por qué (queda registrado)." };
  if (totalEnvio(e) - c < pagadoEnvio(e)) return { ok: false, motivo: "La bonificación deja el envío por debajo de lo que ya pagó: devolvé la diferencia aparte." };
  e.ajustes.push({ tipo: "bonificacion", centavos: -c, texto: motivo.trim(), fecha: hoy, por: a.usuario.id });
  registrar(estado, `Bonificación ${usd(c)} en ${e.codigo} (${motivo.trim()}).`, hoy);
  return { ok: true };
}

/** Paquete que llegó dañado: el cliente decide (seguir igual o reclamar al vendedor antes de embarcar). */
export function resolverDano(estado, paqueteId, decision, auth, hoy) {
  // Lo carga quien habló con el cliente (Atención) o el depósito: los dos tienen el permiso de avisar.
  const a = autorizar(estado, auth, "avisar");
  if (!a.ok) return a;
  const p = paquete(estado, paqueteId);
  if (!p?.danado || p.danoResuelto) return { ok: false, motivo: "Ese paquete no tiene un daño pendiente." };
  if (!["seguir", "devolver"].includes(decision)) return { ok: false, motivo: "Elegí: sigue igual o se devuelve al vendedor." };
  p.danoResuelto = decision;
  if (decision === "devolver") {
    const e = envio(estado, p.envioId);
    if (e) {
      e.paquetes = e.paquetes.filter((id) => id !== p.id);
      if (e.prealertas) e.prealertas = e.prealertas.filter((x) => x.tracking !== p.tracking);
      if (!e.paquetes.length && e.estado === "en_deposito") moverEstado(e, "esperando", hoy, "El paquete dañado vuelve al vendedor; esperamos el reemplazo.");
    }
    p.envioId = null;
    p.devuelto = hoy;
  }
  return { ok: true };
}

/**
 * Producto prohibido retenido en el depósito: se devuelve al vendedor (con la etiqueta que consiga el cliente)
 * o se descarta con su conformidad. En los dos casos sale del envío y el resto puede seguir.
 */
export function resolverProhibido(estado, paqueteId, decision, auth, hoy) {
  const a = autorizar(estado, auth, "asignar");
  if (!a.ok) return a;
  const p = paquete(estado, paqueteId);
  if (p?.retenido !== "prohibido" || p.resueltoProhibido) return { ok: false, motivo: "Ese paquete no está retenido." };
  if (!["devolver", "descartar"].includes(decision)) return { ok: false, motivo: "Elegí: vuelve al vendedor o se descarta." };
  p.resueltoProhibido = decision;
  const e = envio(estado, p.envioId);
  if (e) {
    e.paquetes = e.paquetes.filter((id) => id !== p.id);
    if (e.prealertas) e.prealertas = e.prealertas.filter((x) => x.tracking !== p.tracking);
    e.eventos.push({ fecha: hoy, estado: e.estado, texto: `El producto prohibido (${p.tracking}) ${decision === "devolver" ? "vuelve al vendedor" : "se descarta"}.` });
    if (!e.paquetes.length && e.estado === "en_deposito") moverEstado(e, "esperando", hoy, "Esperamos el resto de la compra.");
  }
  p.envioId = null;
  p.devuelto = hoy;
  registrar(estado, `Prohibido ${p.tracking}: ${decision === "devolver" ? "vuelve al vendedor" : "se descarta"}.`, hoy);
  return { ok: true };
}

// ───────────────────────── tarifas y régimen (el dueño) ─────────────────────────

export const LIMITES = Object.freeze({
  tipoCambio: [100, 100000],
  honorarioTasa: [0, 0.5],
  porKgCentavos: [100, 50000],
  porCbmCentavos: [1000, 500000],
  franquiciaCentavos: [0, 300000],
  topeEnvioCentavos: [10000, 1000000],
  derechosExcedente: [0, 1],
  enviosPorAnio: [0, 50],
});

export function cambiarTipoCambio(estado, tc, auth, hoy) {
  const a = autorizar(estado, auth, "tarifas");
  if (!a.ok) return a;
  const v = Math.round(Number(tc));
  const [min, max] = LIMITES.tipoCambio;
  if (!(v >= min && v <= max)) return { ok: false, motivo: `El tipo de cambio tiene que estar entre ${min} y ${max}.` };
  const antes = estado.config.tipoCambio;
  estado.config.tipoCambio = v;
  registrar(estado, `Tipo de cambio ${pesos(antes)} → ${pesos(v)}.`, hoy);
  return { ok: true };
}

export function cambiarTarifa(estado, tarifaId, campo, valor, auth, hoy) {
  const a = autorizar(estado, auth, "tarifas");
  if (!a.ok) return a;
  const t = tarifa(estado, tarifaId);
  if (!t || !(campo in t) || !LIMITES[campo]) return { ok: false, motivo: "Ese valor no se edita." };
  const v = Math.round(Number(valor));
  const [min, max] = LIMITES[campo];
  if (!(v >= min && v <= max)) return { ok: false, motivo: `Tiene que estar entre ${usd(min)} y ${usd(max)}.` };
  t[campo] = v;
  registrar(estado, `Tarifa ${tarifaId}: ${campo} = ${usd(v)}.`, hoy);
  return { ok: true };
}

export function cambiarRegimen(estado, campo, valor, auth, hoy) {
  const a = autorizar(estado, auth, "tarifas", true);
  if (!a.ok) return a;
  if (!LIMITES[campo] || !(campo in estado.regimen)) return { ok: false, motivo: "Ese valor no se edita." };
  const v = Number(valor);
  const [min, max] = LIMITES[campo];
  if (!(v >= min && v <= max)) return { ok: false, motivo: "Valor fuera de rango." };
  estado.regimen[campo] = campo === "derechosExcedente" ? v : Math.round(v);
  estado.regimen.vigenteDesde = hoy;
  registrar(estado, `Régimen: ${campo} = ${v} (desde ${hoy}).`, hoy);
  return { ok: true };
}

// ───────────────────────── WhatsApp ─────────────────────────

/** Link a WhatsApp. En la demo va sin número (wa.me/?text=): los teléfonos de ejemplo podrían ser de alguien. */
export function linkWhatsApp(tel, texto) {
  const numero = String(tel ?? "").replace(/\D/g, "");
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
}

/** Mensajes listos para mandar, en criollo y con el código para seguirlo. */
export function mensaje(tipo, estado, e, extra = {}) {
  const c = cliente(estado, e.clienteId);
  const nombre = c?.nombre?.split(" ")[0] ?? "";
  const saldo = saldoEnvio(e);
  const tc = tcParaCobrar(estado, e);
  const saldoTxt = saldo > 50 ? ` Te queda un saldo de ${usd(saldo)} (${pesos(aPesos(saldo, tc))}).` : "";
  const textos = {
    salio: `¡Hola ${nombre}! Tu envío ${e.codigo} ya salió de ${ORIGENES[e.origen]}. Lo seguís con ese código en nuestra web.`,
    demora: `Hola ${nombre}, te aviso que tu envío ${e.codigo} viene demorado: ${extra.motivo}. La nueva fecha estimada de llegada es el ${dm(extra.fecha)}. Cualquier cosa, escribime.`,
    listo: `¡${nombre}, tu envío ${e.codigo} ya pasó la aduana y está listo!${saldoTxt} ¿Te lo mandamos o lo pasás a buscar?`,
    observado: `Hola ${nombre}, la aduana pidió ${e.desvio?.pide ?? "documentación"} para tu envío ${e.codigo} (${e.desvio?.motivo ?? ""}). ¿Me la mandás por acá antes del ${dm(e.desvio?.vence)}?`,
    reparto: `¡${nombre}, tu envío ${e.codigo} salió a reparto! Hoy te llega.`,
    reintento: `Hola ${nombre}, fuimos a entregar tu envío ${e.codigo} y no había nadie. ¿Coordinamos otro horario?`,
    retiro: `Hola ${nombre}, no pudimos entregar tu envío ${e.codigo}. Lo podés retirar por la oficina.`,
    peso: `Hola ${nombre}, llegó tu compra al depósito. Pesa ${extra.real ?? ""} y habíamos cotizado ${extra.cotizado ?? ""}: la diferencia es de ${extra.monto ?? ""}. ¿Seguimos?`,
    dano: `Hola ${nombre}, uno de tus paquetes (${extra.tracking ?? ""}) llegó al depósito con la caja dañada. Te mandamos la foto. ¿Lo embarcamos igual o lo reclamamos al vendedor?`,
    prohibido: `Hola ${nombre}, en tu compra (${extra.tracking ?? ""}) vino un producto que no puede viajar por courier: ${extra.contenido ?? ""}. ¿Lo devolvemos al vendedor o lo descartamos? El resto sigue su camino.`,
    saldo: `Hola ${nombre}, tu envío ${e.codigo} está listo en la oficina.${saldoTxt} Podés pagar por transferencia o Mercado Pago.`,
    almacenaje: `Hola ${nombre}, tu compra está en el depósito hace ${extra.dias ?? ""} días. En ${extra.faltan ?? ""} días empieza a correr el almacenaje. ¿La embarcamos?`,
  };
  return { tipo, envioId: e.id, cliente: c?.nombre ?? "", texto: textos[tipo] ?? "", link: linkWhatsApp("", textos[tipo] ?? "") };
}

// ───────────────────────── la bandeja: qué resolver AHORA ─────────────────────────

const URGENCIA = { prohibido: 0, observado: 1, sin_duenio: 2, dano: 3, peso: 4, saldo: 5, almacenaje: 6, demora: 7, cotizacion: 8, devolucion: 9, embarcable: 10 };

/**
 * Lo que hay que resolver ahora, ordenado por urgencia y plata en juego. Cada ítem trae la acción en un toque.
 * Es la innovación central: el sistema avisa en vez de que la persona descubra.
 */
export function bandeja(estado, hoy) {
  const out = [];
  for (const p of estado.paquetes) {
    if (p.retenido === "prohibido" && !p.resueltoProhibido) {
      out.push({ tipo: "prohibido", paqueteId: p.id, envioId: p.envioId, titulo: `Producto prohibido en ${p.tracking}`, detalle: p.contenido || CATEGORIAS[p.categoria], rol: "deposito" });
    }
    if (!p.envioId && !p.devuelto) {
      out.push({ tipo: "sin_duenio", paqueteId: p.id, titulo: `Paquete sin dueño: ${p.tracking}`, detalle: `${kg(p.gramos)}${p.casillaEtiqueta ? ` · etiqueta ${p.casillaEtiqueta}` : " · sin casilla en la etiqueta"} · recibido el ${dm(p.recibido)}`, rol: "deposito" });
    }
    if (p.danado && !p.danoResuelto && p.envioId) {
      out.push({ tipo: "dano", paqueteId: p.id, envioId: p.envioId, titulo: `Llegó dañado: ${p.tracking}`, detalle: "Preguntale al cliente si sigue o se reclama al vendedor.", rol: "atencion" });
    }
  }
  for (const e of estado.envios) {
    const c = cliente(estado, e.clienteId);
    if (e.desvio?.tipo === "observado" && !e.desvio.resuelto) {
      const vencida = hoy > e.desvio.vence;
      out.push({ tipo: "observado", envioId: e.id, titulo: `Aduana observó ${e.codigo}`, detalle: `${c?.nombre}: pide ${e.desvio.pide} · ${vencida ? "¡plazo vencido!" : `vence el ${dm(e.desvio.vence)}`}`, rol: "atencion", urgente: vencida });
    }
    if (e.estado === "en_deposito") {
      const d = diferenciaDePeso(estado, e.id, hoy);
      if (d.hay && !e.ajustes.some((x) => x.tipo === "peso")) {
        out.push({ tipo: "peso", envioId: e.id, titulo: `Diferencia de peso en ${e.codigo}`, detalle: `${c?.nombre}: cotizado ${kg(d.cotizado)}, real ${kg(d.cobrado)} → ${d.centavos > 0 ? "+" : ""}${usd(d.centavos)}`, rol: "atencion", centavos: Math.abs(d.centavos) });
      }
      const ps = e.paquetes.map((id) => paquete(estado, id)).filter(Boolean);
      const peor = ps.map((p) => almacenaje(estado, p, hoy)).sort((x, y) => y.dias - x.dias)[0];
      if (peor && (peor.cobrables > 0 || peor.faltan <= estado.config.avisoAlmacenajeDias)) {
        out.push({ tipo: "almacenaje", envioId: e.id, titulo: peor.cobrables > 0 ? `Corre almacenaje en ${e.codigo}` : `Almacenaje por empezar en ${e.codigo}`, detalle: `${c?.nombre}: ${peor.dias} días en depósito${peor.cobrables > 0 ? ` · ${usd(peor.centavos)} por paquete` : ` · faltan ${peor.faltan} días`}`, rol: "atencion" });
      }
      const l = listoParaEmbarcar(estado, e, hoy);
      if (l.ok) out.push({ tipo: "embarcable", envioId: e.id, titulo: `${e.codigo} listo para embarcar`, detalle: `${c?.nombre} · ${ORIGENES[e.origen]} ${VIAS[e.via].toLowerCase()}`, rol: "deposito" });
    }
    if (e.estado === "listo" && saldoEnvio(e) > 50) {
      const dias = diasEntre(e.listoDesde ?? hoy, hoy);
      out.push({ tipo: "saldo", envioId: e.id, titulo: `Saldo por cobrar: ${e.codigo}`, detalle: `${c?.nombre}: ${usd(saldoEnvio(e))} · listo hace ${dias} día(s)`, rol: "atencion", centavos: saldoEnvio(e) });
    }
    if (e.estado === "cancelado" && e.devolucionPendiente > 0) {
      out.push({ tipo: "devolucion", envioId: e.id, titulo: `Devolver seña de ${e.codigo}`, detalle: `${c?.nombre}: ${usd(e.devolucionPendiente)}`, rol: "duenio", centavos: e.devolucionPendiente });
    }
  }
  for (const b of estado.embarques) {
    if (b.estado === "en_transito" && b.llegada < hoy) {
      out.push({ tipo: "demora", embarqueId: b.id, titulo: `${b.referencia} pasó su fecha de llegada`, detalle: `Estimada para el ${dm(b.llegada)}: cargá la nueva fecha y avisá a ${b.envios.length} cliente(s).`, rol: "deposito", urgente: true });
    }
  }
  for (const q of estado.cotizaciones) {
    if (q.estado === "abierta" && (q.vence === hoy || q.vence === sumarDias(hoy, 1))) {
      out.push({ tipo: "cotizacion", cotizacionId: q.id, titulo: `Cotización por vencer (${usd(q.total)})`, detalle: `${q.clienteId ? cliente(estado, q.clienteId)?.nombre : q.contacto} · vence el ${dm(q.vence)}`, rol: "atencion" });
    }
  }
  return out.sort((x, y) => (y.urgente ? 1 : 0) - (x.urgente ? 1 : 0) || URGENCIA[x.tipo] - URGENCIA[y.tipo] || (y.centavos ?? 0) - (x.centavos ?? 0));
}

// ───────────────────────── tablero del dueño ─────────────────────────

export function tablero(estado, hoy) {
  const mes = hoy.slice(0, 7);
  const activos = estado.envios.filter((e) => ACTIVOS.has(e.estado));
  const porEstado = Object.fromEntries(LINEA.map((k) => [k, estado.envios.filter((e) => e.estado === k).length]));
  const delMes = estado.envios.filter((e) => String(e.confirmadoEl).startsWith(mes) && e.estado !== "cancelado");
  const facturado = delMes.reduce((s, e) => s + totalEnvio(e) - (e.cotizacion.impuestos?.total ?? 0), 0);
  const cobradoMes = estado.caja.filter((m) => m.tipo === "ingreso" && String(m.fecha).startsWith(mes)).reduce((s, m) => s + m.centavos, 0);
  const porCobrar = activos.reduce((s, e) => s + Math.max(0, saldoEnvio(e)), 0);
  // Margen por embarque cerrado o en viaje: lo que se cobró de flete contra lo que costó de verdad.
  const margenes = estado.embarques.filter((b) => b.costoRealCentavos > 0).map((b) => {
    const fletes = b.envios.map((id) => envio(estado, id)).reduce((s, e) => s + e.cotizacion.flete + e.ajustes.filter((x) => x.tipo === "peso").reduce((t, x) => t + x.centavos, 0), 0);
    return { referencia: b.referencia, cobrado: fletes, costo: b.costoRealCentavos, margen: fletes - b.costoRealCentavos };
  });
  const entregados = estado.envios.filter((e) => e.estado === "entregado" && e.entregadoEl);
  const puertaAPuerta = entregados.length ? Math.round(entregados.reduce((s, e) => s + diasEntre(e.confirmadoEl, e.entregadoEl), 0) / entregados.length) : null;
  const pasaronAduana = estado.envios.filter((e) => e.eventos.some((x) => x.estado === "en_aduana"));
  const observados = pasaronAduana.filter((e) => e.desvio?.tipo === "observado").length;
  const porRuta = estado.tarifas.map((t) => ({ id: t.id, origen: t.origen, via: t.via, envios: estado.envios.filter((e) => e.tarifaId === t.id && e.estado !== "cancelado").length }));
  return {
    activos: activos.length, porEstado, facturado, cobradoMes, porCobrar, margenes, puertaAPuerta,
    observadosPct: pasaronAduana.length ? Math.round((observados * 100) / pasaronAduana.length) : 0,
    sinDuenio: estado.paquetes.filter((p) => !p.envioId && !p.devuelto).length,
    cotizacionesAbiertas: estado.cotizaciones.filter((q) => q.estado === "abierta" && !cotizacionVencida(q, hoy)).length,
    conversion: estado.cotizaciones.length ? Math.round((estado.cotizaciones.filter((q) => q.estado === "confirmada").length * 100) / estado.cotizaciones.length) : 0,
    porRuta,
  };
}

/** Caja del día en las dos monedas, por medio. */
export function cajaDelDia(estado, hoy) {
  const movs = estado.caja.filter((m) => m.fecha === hoy);
  const porMedio = {};
  for (const m of movs) {
    const k = m.medio;
    porMedio[k] = porMedio[k] ?? { moneda: m.moneda, ingresos: 0, egresos: 0 };
    porMedio[k][m.tipo === "ingreso" ? "ingresos" : "egresos"] += m.monto;
  }
  return { movimientos: movs, porMedio };
}

/** Seguimiento público por código (lo que ve el cliente): sin montos ni datos de otros. */
export function seguimiento(estado, codigo) {
  if (!validarCodigo(codigo)) return { ok: false, motivo: "Ese código no es válido. Fijate que sea TV-AAAA-NNNN-N." };
  const e = estado.envios.find((x) => x.codigo === String(codigo).trim().toUpperCase());
  if (!e) return { ok: false, motivo: "No encontramos un envío con ese código." };
  const b = e.embarqueId ? embarque(estado, e.embarqueId) : null;
  return {
    ok: true,
    codigo: e.codigo, estado: e.estado, origen: e.origen, via: e.via,
    llegadaEstimada: b?.llegada ?? null,
    linea: LINEA.map((k) => ({ estado: k, nombre: ESTADOS[k], fecha: e.eventos.find((x) => x.estado === k)?.fecha ?? null })),
    novedades: e.eventos.slice(-4).reverse().map((x) => ({ fecha: x.fecha, texto: x.texto })),
  };
}

// ───────────────────────── demo con todas las eventualidades a la vista ─────────────────────────

/**
 * Arma un día de trabajo de TESVO donde se ve cada eventualidad al abrir: paquete sin dueño, diferencia de peso,
 * dañado, prohibido, observado por aduana, saldo por cobrar, almacenaje corriendo, embarque demorado, cotización
 * por vencer y una seña a devolver. Determinístico: la demo se ve igual cada vez. Nombres y datos inventados.
 */
export function generarDemo(hoy) {
  secuencia = 0;
  const E = crearEstado({ clientes: CLIENTES_DEMO, anio: Number(hoy.slice(0, 4)) });
  const S = { usuarioId: "u-sole" }, N = { usuarioId: "u-nico" };
  const hace = (d) => sumarDias(hoy, -d);
  const conf = (clienteId, pedido, fecha) => {
    const q = guardarCotizacion(E, pedido, { clienteId }, S, fecha).cotizacion;
    return confirmarEnvio(E, { cotizacionId: q.id, clienteId }, S, fecha).envio;
  };
  const senia = (e, fecha, medio = "transferencia") => cobrar(E, e.id, { medio, monto: aPesos(Math.ceil(totalEnvio(e) * 0.3) + 100, E.config.tipoCambio) }, S, fecha);
  const pagarTodo = (e, fecha) => cobrar(E, e.id, { medio: "mercadopago", monto: aPesos(saldoEnvio(e), tcParaCobrar(E, e)) }, S, fecha);

  // 1. Entregado hace poco (alimenta el tablero).
  const e1 = conf("c-mati", { tarifaId: "miami-aereo", items: [{ descripcion: "Auriculares inalámbricos", valorCentavos: 24900, categoria: "electronica" }], gramos: 900, seguro: true }, hace(24));
  senia(e1, hace(24));
  prealertar(E, e1.id, { tracking: "1Z999AA10123456784", tienda: "Amazon" }, hace(23));
  recibirPaquete(E, { tracking: "1Z999AA10123456784", gramos: 850, medidas: { l: 20, a: 15, h: 10 }, deposito: "miami" }, N, hace(19));

  // 2. Pyme por despachante, China marítimo, en viaje con DEMORA (contenedor rolado).
  const e2 = conf("c-ferre", { tarifaId: "china-maritimo", regimen: "general", items: [{ descripcion: "Taladros percutores (caja x 20)", valorCentavos: 180000, unidades: 3, categoria: "general" }], medidas: { l: 120, a: 100, h: 110 } }, hace(40));
  senia(e2, hace(40));
  prealertar(E, e2.id, { tracking: "CNSZX2026A0117", tienda: "Proveedor Ningbo" }, hace(39));
  recibirPaquete(E, { tracking: "CNSZX2026A0117", gramos: 310000, medidas: { l: 120, a: 100, h: 110 }, deposito: "china" }, N, hace(35));

  // 3. Observado por la aduana (pide factura).
  const e3 = conf("c-lau", { tarifaId: "miami-aereo", items: [{ descripcion: "Notebook 14\"", valorCentavos: 89900, categoria: "electronica" }], gramos: 2100, medidas: { l: 45, a: 32, h: 9 }, seguro: true }, hace(16));
  senia(e3, hace(16));
  prealertar(E, e3.id, { tracking: "9400111899223197428490", tienda: "Best Buy" }, hace(15));
  recibirPaquete(E, { tracking: "9400111899223197428490", gramos: 2200, medidas: { l: 45, a: 32, h: 9 }, deposito: "miami" }, N, hace(12));

  // 4. Listo con saldo por cobrar.
  const e4 = conf("c-juli", { tarifaId: "paraguay-terrestre", items: [{ descripcion: "Zapatillas running", valorCentavos: 12000, unidades: 2, categoria: "ropa" }], gramos: 2400, medidas: { l: 35, a: 25, h: 15 } }, hace(9));
  senia(e4, hace(9));
  prealertar(E, e4.id, { tracking: "PYCDE-778812", tienda: "Ciudad del Este" }, hace(8));
  recibirPaquete(E, { tracking: "PYCDE-778812", gramos: 2350, medidas: { l: 35, a: 25, h: 15 }, deposito: "paraguay" }, N, hace(7));

  // Embarques: uno aéreo que ya llegó (1, 3), uno terrestre que llegó (4), uno marítimo demorado (2).
  const bA = crearEmbarque(E, { tarifaId: "miami-aereo", referencia: "AWB 045-88213590", salida: hace(11), llegada: hace(5) }, N, hace(11)).embarque;
  subirAEmbarque(E, bA.id, e1.id, N, hace(11));
  subirAEmbarque(E, bA.id, e3.id, N, hace(11));
  despacharEmbarque(E, bA.id, { costoRealCentavos: 5200 }, N, hace(11));
  arriboEmbarque(E, bA.id, N, hace(5));
  liberarAduana(E, e1.id, {}, S, hace(4));
  pagarTodo(e1, hace(3));
  entregar(E, e1.id, { modo: "domicilio" }, S, hace(3));
  entregar(E, e1.id, { modo: "domicilio" }, S, hace(2));
  observarAduana(E, e3.id, { motivo: "Valor declarado bajo para el modelo", pide: "la factura de compra", plazoDias: 5 }, S, hace(3));

  const bT = crearEmbarque(E, { tarifaId: "paraguay-terrestre", referencia: "Carta de porte PY-20931", salida: hace(6), llegada: hace(2) }, N, hace(6)).embarque;
  subirAEmbarque(E, bT.id, e4.id, N, hace(6));
  despacharEmbarque(E, bT.id, { costoRealCentavos: 1300 }, N, hace(6));
  arriboEmbarque(E, bT.id, N, hace(2));
  liberarAduana(E, e4.id, {}, S, hace(1));

  const bM = crearEmbarque(E, { tarifaId: "china-maritimo", referencia: "MSKU 7781203", salida: hace(33), llegada: hace(1) }, N, hace(33)).embarque;
  subirAEmbarque(E, bM.id, e2.id, N, hace(33));
  despacharEmbarque(E, bM.id, { costoRealCentavos: 38000 }, N, hace(33));

  // 5. En depósito con DIFERENCIA DE PESO (cotizó 3 kg, llegó una caja grande).
  const e5 = conf("c-mati", { tarifaId: "miami-aereo", items: [{ descripcion: "Freidora de aire", valorCentavos: 13000, categoria: "general" }], gramos: 3000, seguro: false }, hace(6));
  senia(e5, hace(6));
  prealertar(E, e5.id, { tracking: "TBA301884729115", tienda: "Amazon" }, hace(5));
  recibirPaquete(E, { tracking: "TBA301884729115", gramos: 4600, medidas: { l: 42, a: 40, h: 38 }, deposito: "miami" }, N, hace(2));

  // 6. En depósito con paquete DAÑADO.
  const e6 = conf("c-lau", { tarifaId: "miami-aereo", items: [{ descripcion: "Monitor 27\"", valorCentavos: 21900, categoria: "electronica" }], gramos: 7000, medidas: { l: 70, a: 48, h: 15 }, seguro: true }, hace(8));
  senia(e6, hace(8));
  prealertar(E, e6.id, { tracking: "1Z999AA10198765432", tienda: "Walmart" }, hace(7));
  recibirPaquete(E, { tracking: "1Z999AA10198765432", gramos: 7100, medidas: { l: 70, a: 48, h: 15 }, danado: true, deposito: "miami" }, N, hace(1));

  // 7. En depósito hace 27 días esperando más compras: ALMACENAJE por empezar.
  const e7 = conf("c-vale", { tarifaId: "miami-aereo", items: [{ descripcion: "Ropa de bebé", valorCentavos: 18000, unidades: 1, categoria: "ropa" }, { descripcion: "Cochecito", valorCentavos: 32000, categoria: "general" }], gramos: 9000, medidas: { l: 80, a: 45, h: 35 } }, hace(30));
  senia(e7, hace(30));
  prealertar(E, e7.id, { tracking: "TBA299001122334", tienda: "Amazon" }, hace(29));
  recibirPaquete(E, { tracking: "TBA299001122334", gramos: 2100, medidas: { l: 40, a: 30, h: 20 }, deposito: "miami" }, N, hace(27));
  retenerParaConsolidar(E, e7.id, sumarDias(hoy, 4), hace(27));

  // 8. Listo para embarcar (sin frenos).
  const e8 = conf("c-juli", { tarifaId: "miami-aereo", items: [{ descripcion: "Perfume 100 ml", valorCentavos: 9500, categoria: "cosmeticos" }], gramos: 620, medidas: { l: 15, a: 12, h: 10 } }, hace(5));
  senia(e8, hace(5));
  prealertar(E, e8.id, { tracking: "9261290100130437281952", tienda: "Sephora" }, hace(4));
  recibirPaquete(E, { tracking: "9261290100130437281952", gramos: 620, medidas: { l: 15, a: 12, h: 10 }, deposito: "miami" }, N, hace(1));

  // 9. Paquete SIN DUEÑO (etiqueta sin casilla).
  recibirPaquete(E, { tracking: "TBA302777100556", gramos: 1300, medidas: { l: 30, a: 20, h: 12 }, deposito: "miami" }, N, hace(1));
  // 10. Paquete con producto PROHIBIDO (llegó en un envío pre-alertado).
  const e10 = conf("c-diego", { tarifaId: "miami-aereo", items: [{ descripcion: "Vitaminas", valorCentavos: 6000, categoria: "general" }], gramos: 400 }, hace(3));
  senia(e10, hace(3));
  prealertar(E, e10.id, { tracking: "9400100000000000000777", tienda: "iHerb" }, hace(3));
  recibirPaquete(E, { tracking: "9400100000000000000777", gramos: 400, medidas: { l: 15, a: 10, h: 8 }, contenido: "Suplemento con medicamento de venta bajo receta", categoria: "medicamentos", deposito: "miami" }, N, hoy);

  // 11. Confirmado y cancelado: seña por devolver.
  const e11 = conf("c-vale", { tarifaId: "china-aereo", items: [{ descripcion: "Repuestos de moto", valorCentavos: 26000, categoria: "repuestos" }], gramos: 5000 }, hace(4));
  senia(e11, hace(4));
  cancelarEnvio(E, e11.id, { motivo: "El vendedor se quedó sin stock" }, S, hace(1));

  // 12. Cotizaciones abiertas: una por vencer, otra fresca (leads).
  guardarCotizacion(E, { tarifaId: "china-aereo", items: [{ descripcion: "Luces LED para local", valorCentavos: 64000, unidades: 2, categoria: "general" }], gramos: 8000 }, { contacto: "Consulta por WhatsApp — Ezequiel" }, S, hace(2));
  guardarCotizacion(E, { tarifaId: "miami-aereo", items: [{ descripcion: "Consola de videojuegos", valorCentavos: 49900, categoria: "electronica" }], gramos: 4500 }, { clienteId: "c-mati" }, S, hoy);

  E.log.unshift({ fecha: hoy, texto: "Demo armada: datos inventados, nada se guarda." });
  return E;
}

export const CLIENTES_DEMO = Object.freeze([
  { id: "c-mati", nombre: "Matías Rivero", tipo: "persona", doc: "20-30111222-3", tel: "", casilla: "TV-1001", alta: "2026-03-02" },
  { id: "c-lau", nombre: "Laura Benítez", tipo: "persona", doc: "27-28999111-4", tel: "", casilla: "TV-1002", alta: "2026-05-14" },
  { id: "c-juli", nombre: "Julián Ortega", tipo: "persona", doc: "20-35777444-1", tel: "", casilla: "TV-1003", alta: "2026-06-20" },
  { id: "c-vale", nombre: "Valeria Sosa", tipo: "persona", doc: "27-31222333-9", tel: "", casilla: "TV-1004", alta: "2026-07-01" },
  { id: "c-ferre", nombre: "Ferretería El Tornillo SRL", tipo: "pyme", doc: "30-71555666-2", tel: "", casilla: "TV-1005", alta: "2026-02-10" },
  { id: "c-diego", nombre: "Diego Paz", tipo: "persona", doc: "20-33444555-6", tel: "", casilla: "TV-1006", alta: "2026-09-01" },
]);
