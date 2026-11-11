// ============================================================================
// GUÍA EN ARCA — la parte PURA del paso a paso que la persona hace ELLA MISMA dentro de ARCA
// ============================================================================
//
// Decisión del dueño (05/11/2026): certificado propio. GSG no entra a su ARCA, no usa delegación a
// su CUIT y nunca le pide la clave fiscal. Esto la guía de a un subpaso por vez («Paso 2 de 5»), con
// el nombre exacto del botón que va a ver en ARCA, la ayuda por WhatsApp que dice dónde se trabó y la
// traducción a criollo de los rechazos que más aparecen al verificar el certificado.
//
// Sin DB, sin red, sin React: se testea solo (guia-arca.test.ts). La UI vive en
// src/components/fiscal/GuiaArca.tsx.
//
// PROVISIONAL A CONFIRMAR: los nombres de los botones son los de ARCA a noviembre de 2026 y el login
// sigue en el dominio auth.afip.gob.ar; si ARCA los cambia, se corrigen acá y en ningún otro lado.

/** El login oficial de ARCA (clave fiscal). Se abre en una pestaña nueva. */
export const URL_LOGIN_ARCA = "https://auth.afip.gob.ar/contribuyente_/login.xhtml";

/** El alias del certificado en ARCA. Es el CN del pedido (asistente-arca.ts, generarPedidoDeCertificado). */
export const ALIAS_ARCA = "gsg-erp";

export interface SubpasoArca {
  numero: number;
  titulo: string;
  /** Qué hacer, en criollo. */
  texto: string;
  /** El nombre exacto del botón (o los botones, en orden) que va a ver en pantalla. */
  botones: string[];
  /** Si se traba acá, lo más probable y qué hacer. */
  siTeTrabas?: string;
  /** Este subpaso usa el alias (muestra el botón «Copiar»). */
  conAlias?: boolean;
}

export const SUBPASOS_ARCA: readonly SubpasoArca[] = [
  {
    numero: 1,
    titulo: "Entrá a ARCA",
    texto:
      "Tocá «Abrir ARCA» (se abre en otra pestaña). Escribí tu CUIT y tocá «Siguiente»; después tu clave fiscal y «Ingresar». Arriba, en el buscador, escribí «Certificados» y abrí «Administración de Certificados Digitales».",
    botones: ["Siguiente", "Ingresar"],
    siTeTrabas:
      "Si «Administración de Certificados Digitales» no aparece, tu clave fiscal es de nivel menor a 3: subila desde la app Mi ARCA en el celular (validás tu identidad con el DNI y una foto) y volvé a entrar.",
  },
  {
    numero: 2,
    titulo: "Creá el alias y subí el pedido",
    texto: `Tocá «Agregar alias». En «Alias» pegá ${ALIAS_ARCA}; en «Archivo» tocá «Seleccionar archivo» y elegí el pedido de certificado que bajaste acá (pedido-arca-….csr). Confirmá con «Agregar alias».`,
    botones: ["Agregar alias", "Seleccionar archivo", "Agregar alias"],
    siTeTrabas:
      "Si dice que el alias ya existe, ya lo habías creado: entrá con «Ver» al lado de gsg-erp y seguí con el paso 3. Si no encontrás el .csr, bajalo de nuevo con «Bajar el pedido».",
    conAlias: true,
  },
  {
    numero: 3,
    titulo: "Bajá tu certificado",
    texto: `En la lista, tocá «Ver» al lado de ${ALIAS_ARCA} y después «Descargar». Ese archivo (.crt) es tu certificado: guardalo, lo subís acá en el paso 5.`,
    botones: ["Ver", "Descargar"],
  },
  {
    numero: 4,
    titulo: "Asocialo a Facturación Electrónica",
    texto:
      "Volvé al inicio de ARCA y abrí «Administrador de Relaciones de Clave Fiscal». Tocá «Nueva relación» → «Buscar» → ARCA → «WebServices» → «Facturación Electrónica». En «Representante» tocá «Buscar», elegí el computador fiscal gsg-erp y «Confirmar». No le das permiso a nadie: lo asociás a tu propio certificado.",
    botones: ["Nueva relación", "Buscar", "Confirmar"],
    siTeTrabas:
      "Si al verificar ARCA dice «Computador no autorizado», es este paso: falta esta relación o se eligió otro servicio. Hacelo de nuevo eligiendo «Facturación Electrónica».",
  },
  {
    numero: 5,
    titulo: "Subí el certificado acá",
    texto:
      "Volvé a esta pestaña y, en el paso «Certificado de ARCA» de más abajo, subí el .crt que bajaste y tocá «Guardar el certificado». Al guardarlo, lo verificamos con ARCA en el momento.",
    botones: ["Guardar el certificado"],
  },
];

export const TOTAL_SUBPASOS = SUBPASOS_ARCA.length;

/** «Paso 2 de 5». Fuera de rango, se acota. */
export function progresoGuia(numero: number, total: number = TOTAL_SUBPASOS): string {
  const n = Math.min(Math.max(1, Math.trunc(numero) || 1), total);
  return `Paso ${n} de ${total}`;
}

/** El subpaso por número (1..5), acotado. */
export function subpaso(numero: number): SubpasoArca {
  const i = Math.min(Math.max(1, Math.trunc(numero) || 1), TOTAL_SUBPASOS) - 1;
  return SUBPASOS_ARCA[i];
}

/** El primero sin tildar, o null si están todos. */
export function primeroSinTildar(tildados: readonly number[]): number | null {
  const hechos = new Set(tildados);
  return SUBPASOS_ARCA.find((s) => !hechos.has(s.numero))?.numero ?? null;
}

/** Lo tildado que se recuerda en el navegador → sólo números de subpaso válidos, sin repetir. */
export function tildadosValidos(crudo: unknown): number[] {
  if (!Array.isArray(crudo)) return [];
  const ok = crudo.filter((n): n is number => Number.isInteger(n) && n >= 1 && n <= TOTAL_SUBPASOS);
  return [...new Set(ok)].sort((a, b) => a - b);
}

/** Etiqueta de los botones, como se lee en pantalla: «Agregar alias» → «Seleccionar archivo». */
export function botonesEnTexto(botones: readonly string[]): string {
  return botones.map((b) => `«${b}»`).join(" → ");
}

/**
 * El mensaje de WhatsApp (o mail) para pedir ayuda, armado con el subpaso donde se trabó. Nunca
 * lleva la clave fiscal ni material del certificado: sólo el CUIT y el paso.
 */
export function mensajeDeAyudaArca(numero: number, datos: { cuit?: string | null } = {}): string {
  const s = subpaso(numero);
  const cuit = (datos.cuit ?? "").replace(/\D/g, "");
  return [
    "¡Hola! Estoy conectando Factoque con ARCA y me trabé.",
    `Estoy en el ${progresoGuia(s.numero).toLowerCase()}: «${s.titulo}».`,
    ...(cuit.length === 11 ? [`CUIT: ${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`] : []),
    "¿Me ayudan?",
  ].join("\n");
}

// ── Los rechazos frecuentes, en criollo y con qué hacer ──────────────────────

export type ProblemaArca = "nivel-clave" | "cuit-distinto" | "computador-no-autorizado" | "punto-de-venta-tipo";

export interface Diagnostico {
  id: ProblemaArca;
  /** Qué pasa, en criollo. */
  que: string;
  /** Qué hacer. */
  hacer: string;
  /** El subpaso de la guía donde se arregla, si corresponde. */
  subpaso?: number;
}

export const DIAGNOSTICOS: Readonly<Record<ProblemaArca, Diagnostico>> = {
  "nivel-clave": {
    id: "nivel-clave",
    que: "Tu clave fiscal es de nivel menor a 3, y ARCA pide nivel 3 para los certificados.",
    hacer: "Subila desde la app Mi ARCA en el celular (validás tu identidad con el DNI y una foto) y volvé a hacer el paso 1 de la guía.",
    subpaso: 1,
  },
  "cuit-distinto": {
    id: "cuit-distinto",
    que: "El certificado es de otro CUIT, no del que tenés cargado acá.",
    hacer: "Entrá a ARCA con la clave fiscal del CUIT de este negocio y hacé de nuevo los pasos 2 y 3 de la guía. Si el CUIT cargado acá está mal, escribinos y lo corregimos.",
    subpaso: 2,
  },
  "computador-no-autorizado": {
    id: "computador-no-autorizado",
    que: "ARCA dice «Computador no autorizado»: el certificado está bien, pero falta asociarlo a Facturación Electrónica.",
    hacer: "Hacé el paso 4 de la guía: Administrador de Relaciones de Clave Fiscal → «Nueva relación» → «Facturación Electrónica» → elegí el computador fiscal gsg-erp. Después tocá «Probar con ARCA».",
    subpaso: 4,
  },
  "punto-de-venta-tipo": {
    id: "punto-de-venta-tipo",
    que: "El punto de venta cargado no es de tipo «Web Services» (quizá es de «Comprobantes en línea», que no sirve para facturar desde un sistema).",
    hacer: "En ARCA, «Administración de puntos de venta y domicilios» → «A/B/M de puntos de venta» → «Agregar», y en «Sistema» elegí uno que diga «Web Services». Pasanos el número nuevo y lo cargamos.",
  },
};

/**
 * El texto crudo de un error (de ARCA o de la carga) → el problema frecuente, o null si no se
 * reconoce. Los textos de ARCA son los de sus respuestas conocidas (coe.notAuthorized, rechazos de
 * punto de venta de wsfe); el de nivel de clave es PROVISIONAL A CONFIRMAR con un rechazo real.
 */
export function diagnosticarArca(textoCrudo: string): Diagnostico | null {
  const t = (textoCrudo ?? "").toLowerCase();
  if (t.includes("notauthorized") || t.includes("computador no autorizado") || t.includes("no autorizado a acceder")) {
    return DIAGNOSTICOS["computador-no-autorizado"];
  }
  if (/nivel/.test(t) && /(clave|seguridad)/.test(t)) return DIAGNOSTICOS["nivel-clave"];
  if (t.includes("no corresponde al cuit") || (t.includes("cuit") && (t.includes("represent") || t.includes("distinto")))) {
    return DIAGNOSTICOS["cuit-distinto"];
  }
  if (t.includes("punto de venta") || t.includes("ptovta") || t.includes("pto vta")) return DIAGNOSTICOS["punto-de-venta-tipo"];
  return null;
}

/** «Qué pasa» + «qué hacer», en una línea. */
export function diagnosticoEnTexto(d: Diagnostico): string {
  return `${d.que} Qué hacer: ${d.hacer}`;
}

// ── Subir el .crt = guardarlo y verificarlo en el momento ────────────────────

type ResultadoDePaso = { ok: true; mensaje: string } | { ok: false; motivo: string };

/**
 * Lo que ve la persona después de subir el certificado: si se guardó, el resultado de la
 * verificación con ARCA que corrió enseguida (src/lib/fiscal/verificar-con-arca.ts). Un certificado
 * guardado que ARCA todavía rechaza queda guardado, pero se avisa como error con qué hacer.
 */
export function resultadoAlSubir(carga: ResultadoDePaso, verificacion: ResultadoDePaso | null): ResultadoDePaso {
  if (!carga.ok || !verificacion) return carga;
  if (verificacion.ok) return { ok: true, mensaje: `Guardamos tu certificado y lo verificamos con ARCA. ${verificacion.mensaje}` };
  return { ok: false, motivo: `Guardamos tu certificado, pero ARCA todavía no te deja facturar. ${verificacion.motivo}` };
}
