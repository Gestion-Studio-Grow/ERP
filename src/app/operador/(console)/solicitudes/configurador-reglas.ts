// ============================================================================
// CONFIGURADOR DE CLIENTES DE ESTUDIO (Soporte GSG) — reglas PURAS y client-safe.
// ============================================================================
//
// El estudio deja un pedido (cartera-alta-reglas.ts); Soporte GSG lo completa acá y el servidor
// (configurador.server.ts) crea o vincula el negocio en UNA transacción. Estas reglas deciden qué se
// acepta del formulario y con qué vertical y módulos nace el cliente. No tocan la base.

import { validarCuit } from "@/lib/fiscal/cuit";
import { ESCALERA, PLANES, RUBROS, modulosDelPlan, type PlanId } from "@/planes/catalogo";
import type { RubroApp } from "@/apps/contract";
import {
  emailValido,
  esCondicionIva,
  validarPuntoDeVenta,
  validarWhatsapp,
  type CondicionIva,
  type Tamanio,
} from "@/lib/cartera-alta-reglas";

/** Con qué vertical (blueprint) nace el negocio según el rubro. Sin catálogo de ejemplo: son datos reales. */
export const BLUEPRINT_DEL_RUBRO: Readonly<Record<RubroApp, string>> = {
  servicios: "servicios",
  mostrador: "generico",
  carniceria: "carniceria",
};

export const NOMBRE_RUBRO: Readonly<Record<RubroApp, string>> = {
  servicios: "Servicios (turnos, profesionales)",
  mostrador: "Comercio de mostrador",
  carniceria: "Carnicería (vende por kilo)",
};

export function esRubro(x: unknown): x is RubroApp {
  return typeof x === "string" && (RUBROS as readonly string[]).includes(x);
}

/** Los planes que un cliente de estudio puede recibir: la escalera (el plan «estudio» no). */
export function esPlanDeCliente(x: unknown): x is PlanId {
  return typeof x === "string" && (ESCALERA as readonly string[]).includes(x);
}

/** Módulos con los que nace: los del plan y su rubro (src/planes/catalogo.ts, fuente única). */
export function modulosDelAlta(plan: PlanId, rubro: RubroApp): string[] {
  return [...modulosDelPlan(plan, rubro).modulos];
}

/** Lo que manda el formulario del configurador. Todo texto: se valida acá. */
export interface FormConfigurador {
  razonSocial?: string;
  cuit?: string;
  condicionIva?: string;
  puntoVenta?: string;
  rubro?: string;
  plan?: string;
  email?: string;
  whatsapp?: string;
  alias?: string;
  subdominio?: string;
  /**
   * Acceso de la contadora (C-4 de la especificación): entra por la cartera del ESTUDIO, nunca como
   * dueña del negocio del cliente. "ya-tiene" (por defecto): quien pidió el alta ya entra a su cartera,
   * no se crea nada. "nueva": se crea el acceso de otra persona del estudio, EN el estudio.
   */
  accesoContadora?: string;
  contadoraNombre?: string;
  contadoraEmail?: string;
  /** "si": Soporte confirmó que el dueño de un negocio que YA existe autorizó que el estudio vea sus datos. */
  autorizaVinculo?: string;
  /**
   * Ante negocios parecidos SIN CUIT (posiblesDuplicados): "otro" = es otro negocio, se crea;
   * "es:<id>" = es ese: se le carga el CUIT y se suma a la cartera (con la autorización del dueño).
   */
  duplicado?: string;
}

/** Auditoría del estudio cuando el cliente lo sumó Soporte (no el estudio: no es `cartera.alta`). */
export const ACCION_ALTA_POR_SOPORTE = "cartera.alta-por-soporte";
/** Auditoría del negocio del cliente creado o vinculado por el configurador. */
export const ACCION_CONFIGURADOR_ALTA = "configurador.alta";
/** Soporte descartó el pedido: vive en cartera-alta-reglas.ts, junto a la lista única de cierres. */
export { ACCION_SOLICITUD_DESCARTADA } from "@/lib/cartera-alta-reglas";

export const AVISO_VINCULO_SIN_AUTORIZACION =
  "Ese CUIT ya tiene un negocio en la plataforma. Sumarlo a la cartera le abre sus datos al estudio: " +
  "confirmá que su dueño lo autorizó (tildá la casilla) o descartá el pedido.";

export const EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO =
  "El usuario del cliente tiene que ser del cliente: ese email es de una persona del estudio.";

export interface Configuracion {
  razonSocial: string;
  cuit: string;
  condicionIva: CondicionIva;
  puntoVenta: number;
  rubro: RubroApp;
  plan: PlanId;
  email: string;
  whatsapp: string | null;
  alias: string;
  /** null = sin dirección todavía (el «Pasale esto» lo dice). */
  subdominio: string | null;
  contadora: { tipo: "ya-tiene" } | { tipo: "nueva"; nombre: string; email: string };
  autorizaVinculo: boolean;
  duplicado: DecisionDuplicado;
}

const SUBDOMINIO = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** Valida el formulario del configurador. PURA. El primer error que encuentra, en castellano llano. */
export function validarConfiguracion(f: FormConfigurador): { ok: true; config: Configuracion } | { ok: false; error: string } {
  const razonSocial = (f.razonSocial ?? "").trim().replace(/\s+/g, " ");
  if (razonSocial.length < 2 || razonSocial.length > 120) {
    return { ok: false, error: "Poné la razón social (de 2 a 120 letras)." };
  }
  // Dígito verificador con el porqué (src/lib/fiscal/cuit.ts). No hay consulta al padrón de ARCA.
  const vc = validarCuit(f.cuit ?? "");
  if (!vc.ok) return { ok: false, error: vc.motivo };
  const cuit = vc.cuit;
  const condicionIva = (f.condicionIva ?? "").trim();
  if (!esCondicionIva(condicionIva)) return { ok: false, error: "Elegí la condición frente al IVA." };
  const pv = validarPuntoDeVenta(f.puntoVenta);
  if (!pv.ok) return pv;
  if (pv.puntoVenta === null) {
    return { ok: false, error: "Falta el punto de venta: sin él el cliente no puede emitir. Pedíselo a la contadora." };
  }
  const rubro = (f.rubro ?? "").trim();
  if (!esRubro(rubro)) return { ok: false, error: "Elegí el rubro." };
  const plan = (f.plan ?? "").trim();
  if (!esPlanDeCliente(plan)) return { ok: false, error: "Elegí el plan." };
  const email = (f.email ?? "").trim().toLowerCase();
  if (!emailValido(email)) return { ok: false, error: "El email del cliente no es válido: va a ser su usuario." };
  const wa = validarWhatsapp(f.whatsapp);
  if (!wa.ok) return wa;
  const sub = (f.subdominio ?? "").trim().toLowerCase();
  if (sub !== "" && !SUBDOMINIO.test(sub)) {
    return { ok: false, error: "La dirección lleva letras minúsculas, números y guiones (sin puntos ni espacios)." };
  }
  const alias = (f.alias ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  let contadora: Configuracion["contadora"] = { tipo: "ya-tiene" };
  if ((f.accesoContadora ?? "").trim() === "nueva") {
    const nombre = (f.contadoraNombre ?? "").trim().replace(/\s+/g, " ");
    if (nombre.length < 2 || nombre.length > 120) return { ok: false, error: "Poné el nombre de la persona del estudio." };
    const cEmail = (f.contadoraEmail ?? "").trim().toLowerCase();
    if (!emailValido(cEmail)) return { ok: false, error: "El email de la persona del estudio no es válido." };
    if (cEmail === email) return { ok: false, error: EMAIL_DEL_CLIENTE_ES_DEL_ESTUDIO };
    contadora = { tipo: "nueva", nombre, email: cEmail };
  }
  return {
    ok: true,
    config: {
      razonSocial,
      cuit,
      condicionIva,
      puntoVenta: pv.puntoVenta,
      rubro,
      plan,
      email,
      whatsapp: wa.whatsapp,
      alias: alias || razonSocial,
      subdominio: sub === "" ? null : sub,
      contadora,
      autorizaVinculo: (f.autorizaVinculo ?? "").trim() === "si",
      duplicado: leerDecisionDuplicado(f.duplicado),
    },
  };
}

/** Actor de la fila del pedido (`user:<id>`) → id del usuario del estudio que lo pidió. */
export function usuarioDelActor(actor: string): string | null {
  const m = /^user:([A-Za-z0-9_-]{1,64})$/.exec(actor);
  return m ? m[1] : null;
}

/** Mensaje para la contadora al terminar. PURO. Nunca lleva la contraseña del dueño del negocio. */
export function mensajeParaLaContadora(x: {
  cliente: string;
  cuit: string;
  puntoVenta: number | null;
  direccionCartera: string | null;
  acceso: { usuario: string; clave: string } | null;
}): string {
  const cuit = x.cuit.length === 11 ? `${x.cuit.slice(0, 2)}-${x.cuit.slice(2, 10)}-${x.cuit.slice(10)}` : x.cuit;
  const lineas = [
    `¡Hola! Ya está ${x.cliente} en tu cartera: CUIT ${cuit}${x.puntoVenta ? `, punto de venta ${x.puntoVenta}` : ""}.`,
    x.direccionCartera ? `Entrá en: ${x.direccionCartera}` : "Entrá a tu cartera como siempre.",
  ];
  if (x.acceso) lineas.push(`Usuario: ${x.acceso.usuario}`, `Contraseña: ${x.acceso.clave}`);
  return lineas.join("\n");
}

/**
 * El plan que conviene según el tamaño (catalogo.ts, sin editarlo). PURA. Chico → Facturación;
 * varios locales → PyME; comercio → Micro, salvo que sea Responsable inscripto (necesita el Libro
 * IVA), fíe (cuenta corriente) o lo usen más de 2 personas (tope de Micro): ahí, Comerciante.
 */
export function sugerirPlan(
  tamanio: Tamanio | null,
  x: { condicionIva: CondicionIva | null; fia?: boolean; personas?: number },
): { plan: PlanId; porque: string } {
  if (tamanio === "varios-locales") return { plan: "pyme", porque: "Tiene varios locales: PyME los maneja juntos." };
  if (tamanio !== "comercio") return { plan: "facturacion", porque: "Sólo factura lo que cobra: alcanza con Facturación." };
  const motivos: string[] = [];
  if (x.condicionIva === "RESPONSABLE_INSCRIPTO") motivos.push("es Responsable inscripto y necesita el Libro IVA");
  if (x.fia) motivos.push("le fía a clientes (cuenta corriente)");
  const topeMicro = PLANES.micro.limites.usuarios;
  if (topeMicro !== null && (x.personas ?? 0) > topeMicro) motivos.push(`lo usan más de ${topeMicro} personas`);
  if (motivos.length > 0) return { plan: "comerciante", porque: `Comerciante: ${motivos.join(", ")}.` };
  return { plan: "micro", porque: "Un mostrador, monotributo, sin fiado: alcanza con Micro comerciante." };
}

// ── Posibles duplicados (hallazgo QA 26/09: un negocio igual SIN CUIT cargado) ────────────────────
//
// Si el CUIT del pedido no está en la plataforma, igual puede existir el MISMO negocio sin CUIT
// cargado (QA Kiosco Lab, Shine, A Dos Manos). Crear otro lo duplica. Estas reglas buscan parecidos
// por nombre o por dirección, SÓLO para la consola de Soporte: la respuesta a la contadora no cambia.

/** Palabras que no distinguen un negocio de otro (tipo societario y artículos). */
const PALABRAS_QUE_NO_DISTINGUEN = new Set([
  "sa", "srl", "sas", "sh", "sca", "scs", "sociedad", "anonima", "responsabilidad", "limitada",
  "de", "del", "la", "las", "el", "los", "y", "e",
]);

/** Las palabras que distinguen al nombre: sin tildes, en minúsculas, sin tipo societario. PURA. */
export function palabrasDelNombre(nombre: string): string[] {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length > 1 && !PALABRAS_QUE_NO_DISTINGUEN.has(p));
}

/** El nombre pegado, para comparar «A Dos Manos» con «adosmanos». PURA. */
function pegado(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p !== "" && !PALABRAS_QUE_NO_DISTINGUEN.has(p))
    .join("");
}

/** Cuántas letras tiene que tener el nombre más corto para que «uno contiene al otro» cuente. */
const MINIMO_PARA_CONTENER = 6;

/** ¿Dos nombres parecen el mismo negocio? PURA. Prefiere avisar de más: descartar cuesta un clic. */
export function nombresParecidos(a: string, b: string): boolean {
  const pa = pegado(a);
  const pb = pegado(b);
  if (!pa || !pb) return false;
  if (pa === pb) return true;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (corto.length >= MINIMO_PARA_CONTENER && largo.includes(corto)) return true;
  const sa = new Set(palabrasDelNombre(a));
  const sb = new Set(palabrasDelNombre(b));
  const comunes = [...sa].filter((p) => sb.has(p)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 && comunes >= 2 && comunes / union >= 0.5;
}

export interface NegocioSinCuit {
  id: string;
  nombre: string;
  slug: string;
  subdominio: string | null;
}

export interface PosibleDuplicado extends NegocioSinCuit {
  /** Por qué se lo muestra, en castellano llano. */
  motivo: string;
}

/**
 * Los negocios SIN CUIT que pueden ser el del pedido: nombre parecido (al nombre o al alias del
 * pedido) o la dirección que le tocaría ya es de ese negocio. PURA; el orden es el de entrada.
 */
export function posiblesDuplicados(
  pedido: { nombre: string; alias?: string | null; slugSugerido: string },
  negocios: readonly NegocioSinCuit[],
): PosibleDuplicado[] {
  const nombres = [pedido.nombre, pedido.alias ?? ""].filter((n) => n.trim() !== "");
  const salida: PosibleDuplicado[] = [];
  for (const n of negocios) {
    const direcciones = [n.slug, n.subdominio ?? ""].filter(Boolean);
    const porNombre = nombres.some((x) => nombresParecidos(x, n.nombre) || direcciones.some((d) => nombresParecidos(x, d)));
    const porDireccion = pedido.slugSugerido !== "" && direcciones.includes(pedido.slugSugerido);
    if (!porNombre && !porDireccion) continue;
    salida.push({
      ...n,
      motivo: porDireccion
        ? `La dirección «${pedido.slugSugerido}» ya es de este negocio`
        : "Tiene un nombre parecido y no tiene CUIT cargado",
    });
  }
  return salida;
}

/** Qué decidió Soporte ante los parecidos: crear otro, o que es uno de ellos (su id). PURA. */
export type DecisionDuplicado = { tipo: "sin-decidir" } | { tipo: "otro" } | { tipo: "es"; tenantId: string };

export function leerDecisionDuplicado(v: string | undefined): DecisionDuplicado {
  const x = (v ?? "").trim();
  if (x === "otro") return { tipo: "otro" };
  const m = /^es:([A-Za-z0-9_-]{1,64})$/.exec(x);
  return m ? { tipo: "es", tenantId: m[1] } : { tipo: "sin-decidir" };
}

export const AVISO_POSIBLE_DUPLICADO =
  "Puede haber un negocio igual sin CUIT cargado. Marcá «Es otro negocio» o elegí cuál es para cargarle el CUIT.";

export const YA_EN_LA_CARTERA = "Ya está en la cartera de este estudio.";
