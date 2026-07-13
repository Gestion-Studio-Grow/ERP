// ============================================================================
// MONITOR DE SOPORTE — Traductor de errores de ARCA a CRIOLLO (ADR-044, ADR-046).
// ============================================================================
//
// El outbox y las facturas guardan el error CRUDO de ARCA/del plugin (un stack, un
// "codigo: mensaje", un "campo: mensaje"). Un implementador NO tiene que leer eso:
// tiene que leer QUÉ pasó, en criollo, y QUÉ hacer. Este módulo es esa traducción.
//
// PURO: entra un string crudo (OutboxEvent.lastError | Invoice.rechazoMotivo |
// err.message), sale un diagnóstico legible + acción sugerida + severidad. No toca
// DB ni red → se testea con fixtures de los errores reales de ARCA (soap.ts, port.ts,
// validacion.ts, tenant-cert.ts, factory.ts).
//
// De-sesgo por sector (ADR-046): ZONA HUMANA (soporte/diagnóstico) → criollo claro,
// no jerga. La precisión fiscal la aporta el mapeo a códigos, la voz la aporta el copy.

/** Qué tan urgente es. `roja` = frena la emisión, acción humana. `amarilla` = revisar. */
export type SeveridadError = "roja" | "amarilla";

/** Familia del problema — agrupa para filtrar y para saber a quién le toca. */
export type CategoriaError =
  | "credencial" // cert/CUIT del emisor: falta, no coincide, vencido
  | "auth_wsaa" // autenticación contra ARCA (token/sign/cert no autorizado)
  | "punto_venta" // punto de venta no habilitado en ARCA
  | "numeracion" // correlativo fuera de secuencia
  | "comprobante" // datos del comprobante rechazados (campo, IVA, receptor, fecha)
  | "red" // transitorio: ARCA caído, timeout, HTTP
  | "config" // facturación apagada / modo stub / migración pendiente
  | "desconocido"; // no reconocido — se muestra crudo + acción genérica

/** Diagnóstico legible de un error, listo para pintar en el monitor. */
export interface DiagnosticoError {
  categoria: CategoriaError;
  severidad: SeveridadError;
  /** Título corto, criollo (lo que el implementador lee primero). */
  titulo: string;
  /** Qué pasó, en una frase, sin jerga de máquina. */
  queePaso: string;
  /** Qué hacer — acción concreta y accionable. */
  accion: string;
  /** El texto crudo original (para el que quiera ver el detalle técnico). */
  crudo: string;
}

/**
 * Catálogo de códigos conocidos de ARCA (WSAA + WSFEv1). No es exhaustivo — ARCA tiene
 * cientos — pero cubre los que aparecen en una PRIMERA emisión / homologación, que es
 * cuando más duele no entender el error. El resto cae al matcher por palabras clave y,
 * si tampoco, a "desconocido" (que igual muestra el crudo, nunca oculta información).
 */
interface EntradaCodigo {
  categoria: CategoriaError;
  severidad: SeveridadError;
  titulo: string;
  queePaso: string;
  accion: string;
}

const CODIGOS_ARCA: Record<number, EntradaCodigo> = {
  // ── WSAA (autenticación) — familia 600 ──────────────────────────────────────
  600: {
    categoria: "auth_wsaa",
    severidad: "roja",
    titulo: "ARCA no aceptó la autenticación",
    queePaso: "El token de acceso a ARCA (WSAA) no es válido o venció.",
    accion:
      "Suele resolverse solo en el próximo intento (el token se renueva). Si sigue, revisá que el certificado del tenant esté vigente y habilitado para el servicio de facturación (wsfe) en ARCA.",
  },
  601: {
    categoria: "auth_wsaa",
    severidad: "roja",
    titulo: "ARCA rechazó la firma del pedido de acceso",
    queePaso: "ARCA no pudo procesar la firma del certificado (CMS/TRA).",
    accion:
      "El certificado o la clave privada del tenant pueden estar mal cargados. Volvé a cargar la credencial del tenant desde la consola (Facturación · ARCA).",
  },
  602: {
    categoria: "auth_wsaa",
    severidad: "roja",
    titulo: "Certificado no autorizado en ARCA",
    queePaso: "El certificado del emisor no está habilitado para facturar en ARCA.",
    accion:
      "El titular tiene que habilitar el certificado para el web service de facturación (wsfe) en el portal de ARCA. Es un trámite del contribuyente, no se arregla desde acá.",
  },
  // ── WSFEv1 (facturación) — familia 100xx ────────────────────────────────────
  10013: {
    categoria: "credencial",
    severidad: "roja",
    titulo: "El CUIT no está autorizado a emitir",
    queePaso: "El CUIT del emisor no está habilitado en ARCA para este comprobante.",
    accion:
      "Verificá que el CUIT cargado en el tenant sea el del titular y que esté dado de alta en ARCA para facturación electrónica.",
  },
  10015: {
    categoria: "comprobante",
    severidad: "amarilla",
    titulo: "Fecha del comprobante fuera de rango",
    queePaso: "La fecha del comprobante no cae en la ventana que ARCA acepta.",
    accion:
      "La fecha tiene que estar dentro de los días permitidos (hoy ± unos días). Reemití el comprobante con la fecha corregida.",
  },
  10016: {
    categoria: "comprobante",
    severidad: "amarilla",
    titulo: "Faltan las fechas de servicio",
    queePaso: "El comprobante es de servicios y no trae las fechas de servicio / vencimiento.",
    accion:
      "Cargá desde/hasta de servicio y vencimiento de pago antes de emitir (obligatorias para concepto Servicios).",
  },
  10018: {
    categoria: "punto_venta",
    severidad: "roja",
    titulo: "Punto de venta no habilitado",
    queePaso: "El punto de venta que se usó no está habilitado en ARCA para el emisor.",
    accion:
      "El titular tiene que dar de alta ese punto de venta en ARCA (Comprobantes en línea / Web Services) y usar el mismo número acá.",
  },
  10048: {
    categoria: "numeracion",
    severidad: "amarilla",
    titulo: "Numeración fuera de secuencia",
    queePaso: "El número de comprobante no es el que sigue en la secuencia de ARCA.",
    accion:
      "Reintentá: el sistema vuelve a preguntarle a ARCA cuál es el último autorizado y numera desde ahí. Si persiste, hay comprobantes emitidos por fuera del sistema que hay que reconciliar.",
  },
  10004: {
    categoria: "comprobante",
    severidad: "amarilla",
    titulo: "Documento del receptor inválido",
    queePaso: "El tipo o número de documento del cliente no es válido para este comprobante.",
    accion:
      "Revisá el CUIT/DNI del receptor. Una Factura A exige el CUIT del cliente bien cargado.",
  },
  10051: {
    categoria: "comprobante",
    severidad: "amarilla",
    titulo: "Condición de IVA del receptor incompatible",
    queePaso: "La condición frente al IVA del cliente no es compatible con el tipo de comprobante.",
    accion:
      "Ajustá la condición de IVA del receptor o el tipo de comprobante (ej.: a un consumidor final no le va una Factura A).",
  },
};

/** Matchers por palabra clave (cuando no hay código o el código no está en el catálogo). */
interface Matcher {
  test: RegExp;
  entrada: EntradaCodigo;
}

const MATCHERS: Matcher[] = [
  // ── Credencial por tenant (tenant-cert.ts / factory.ts) — fail-closed ────────
  {
    test: /no tiene credencial fiscal|credencial fiscal.*ausente|CredencialFiscalAusente|no se pasó la credencial/i,
    entrada: {
      categoria: "credencial",
      severidad: "roja",
      titulo: "Falta el certificado del tenant",
      queePaso: "El tenant no tiene cargado el certificado de ARCA, así que no se puede firmar.",
      accion:
        "Cargá el certificado (y su clave) del tenant desde la consola: Tenant → Facturación electrónica · ARCA → Paso 2.",
    },
  },
  {
    test: /no tiene arcaCuit|CUIT del emisor.*sin cargar|CuitTenantAusente|sin CUIT no hay guard/i,
    entrada: {
      categoria: "credencial",
      severidad: "roja",
      titulo: "Falta el CUIT del emisor",
      queePaso: "El tenant no tiene cargado el CUIT del titular; sin CUIT no se puede emitir.",
      accion: "Cargá el CUIT del emisor desde la consola (Tenant → Facturación · ARCA → Paso 1).",
    },
  },
  {
    test: /no coincide con el (del )?certificado|CUIT.*no coincide|CredencialCuitMismatch|cert.*distinto CUIT|mismatch/i,
    entrada: {
      categoria: "credencial",
      severidad: "roja",
      titulo: "El CUIT no coincide con el del certificado",
      queePaso:
        "El CUIT cargado en el tenant es distinto del CUIT del certificado. La firma se rechaza por seguridad (ADR-066).",
      accion:
        "Corregí el CUIT del tenant, o volvé a cargar el certificado del CUIT correcto. Tienen que ser el mismo contribuyente.",
    },
  },
  {
    test: /certificado.*(venci|expir|caduc)|(venci|expir).*certificad|cert.*expired/i,
    entrada: {
      categoria: "credencial",
      severidad: "roja",
      titulo: "Certificado vencido",
      queePaso: "El certificado de ARCA del tenant venció.",
      accion:
        "El titular tiene que generar un certificado nuevo en ARCA. Después cargálo desde la consola (rota el anterior).",
    },
  },
  {
    test: /firma CMS.*no disponible|credencial requerida|acción humana|CredencialRequerida/i,
    entrada: {
      categoria: "credencial",
      severidad: "roja",
      titulo: "Falta la credencial para firmar",
      queePaso: "El sistema intentó firmar contra ARCA pero no tiene el certificado del tenant.",
      accion: "Cargá el certificado del tenant desde la consola antes de emitir.",
    },
  },
  // ── WSAA / auth por texto ────────────────────────────────────────────────────
  {
    test: /token.*(venci|invalid|no.*valid|expir)|(venci|invalid).*token|ValidacionDeToken|no es valido o no existe/i,
    entrada: {
      categoria: "auth_wsaa",
      severidad: "roja",
      titulo: "Token de ARCA vencido o inválido",
      queePaso: "El ticket de acceso a ARCA (WSAA) venció o no es válido.",
      accion:
        "Reintentá: el token se renueva solo. Si insiste, revisá que el certificado del tenant esté vigente y habilitado para wsfe.",
    },
  },
  {
    test: /computador no autorizado|no autorizado a acceder|certificad.*no autorizado|no autorizado.*servicio/i,
    entrada: {
      categoria: "auth_wsaa",
      severidad: "roja",
      titulo: "Certificado no habilitado para facturar",
      queePaso: "ARCA no autoriza a este certificado a usar el servicio de facturación (wsfe).",
      accion:
        "El titular tiene que asociar el certificado al web service de facturación en el portal de ARCA (Administrador de Relaciones). Es un trámite del contribuyente.",
    },
  },
  {
    test: /LoginTicketResponse inválido|WSAA.*inválido|falta token\/sign/i,
    entrada: {
      categoria: "auth_wsaa",
      severidad: "amarilla",
      titulo: "Respuesta de login de ARCA incompleta",
      queePaso: "ARCA devolvió una respuesta de autenticación que no se pudo interpretar.",
      accion: "Suele ser transitorio. Reintentá; si persiste, ARCA de homologación puede estar intermitente.",
    },
  },
  // ── Punto de venta / numeración por texto ────────────────────────────────────
  {
    test: /punto de venta.*(no.*habilitad|inexistent)|PtoVta.*no.*habilitad/i,
    entrada: {
      categoria: "punto_venta",
      severidad: "roja",
      titulo: "Punto de venta no habilitado",
      queePaso: "El punto de venta usado no está habilitado en ARCA para el emisor.",
      accion: "El titular tiene que habilitar ese punto de venta en ARCA y usar el mismo número acá.",
    },
  },
  {
    test: /secuencia|proximo a autorizar|próximo a autorizar|correlativ|CbteNro.*no se corresponde/i,
    entrada: {
      categoria: "numeracion",
      severidad: "amarilla",
      titulo: "Numeración fuera de secuencia",
      queePaso: "El número de comprobante no es el que ARCA espera a continuación.",
      accion:
        "Reintentá: el sistema re-lee el último autorizado y numera desde ahí. Si persiste, hay comprobantes emitidos por fuera que hay que reconciliar.",
    },
  },
  // ── Datos del comprobante (validacion.ts) ────────────────────────────────────
  {
    test: /condici[oó]n.*iva|iva.*receptor|condicionIva/i,
    entrada: {
      categoria: "comprobante",
      severidad: "amarilla",
      titulo: "Condición de IVA del receptor",
      queePaso: "La condición frente al IVA del cliente no cierra con el tipo de comprobante.",
      accion: "Ajustá la condición de IVA del receptor o cambiá el tipo de comprobante.",
    },
  },
  {
    test: /IVA inconsistente|no coincide con.*neto|no coincide con la suma|total.*no coincide|baseImponible/i,
    entrada: {
      categoria: "comprobante",
      severidad: "amarilla",
      titulo: "Montos del comprobante inconsistentes",
      queePaso: "El neto, el IVA y el total no cierran entre sí.",
      accion:
        "Es un problema de cálculo antes de emitir. Revisá el detalle del comprobante; si es recurrente, es un bug del cálculo de impuestos (escalar a producto).",
    },
  },
  {
    test: /exige receptor identificado|exige.*CUIT|DocTipo|DocNro|documento.*receptor/i,
    entrada: {
      categoria: "comprobante",
      severidad: "amarilla",
      titulo: "Falta identificar al receptor",
      queePaso: "El comprobante exige el documento del cliente (una Factura A necesita su CUIT).",
      accion: "Cargá el CUIT/DNI del cliente y reemití.",
    },
  },
  {
    test: /fecha.*(AAAAMMDD|formato|fuera de rango|obligatori)|CbteFch/i,
    entrada: {
      categoria: "comprobante",
      severidad: "amarilla",
      titulo: "Fecha del comprobante inválida",
      queePaso: "La fecha del comprobante falta o está fuera del rango que acepta ARCA.",
      accion: "Corregí la fecha (formato AAAAMMDD, dentro de la ventana permitida) y reemití.",
    },
  },
  // ── Red / transporte (soap.ts FetchSoapTransport) ────────────────────────────
  {
    test: /transporte SOAP|HTTP \d{3}|ECONNREFUSED|ETIMEDOUT|network|timeout|fetch failed|getaddrinfo|socket hang/i,
    entrada: {
      categoria: "red",
      severidad: "amarilla",
      titulo: "No se pudo hablar con ARCA",
      queePaso: "Falló la conexión con los servidores de ARCA (caído, lento o intermitente).",
      accion:
        "Casi siempre es transitorio. Reintentá en unos minutos; el sistema vuelve a intentarlo solo en el próximo ciclo del cron.",
    },
  },
  // ── Config / plataforma ──────────────────────────────────────────────────────
  {
    test: /ARCA_MODO=.*no se pasó|ARCA_MODO sin setear|modo stub|ARCA_INVOICING_ENABLED/i,
    entrada: {
      categoria: "config",
      severidad: "amarilla",
      titulo: "Facturación no encendida",
      queePaso: "ARCA está en modo apagado (stub) o la facturación no está habilitada por env.",
      accion:
        "Para emitir de verdad, seteá ARCA_MODO=homologacion (o real) y ARCA_INVOICING_ENABLED=true en Vercel. Es acción del dueño.",
    },
  },
];

/** Diagnóstico por defecto cuando no se reconoce el error (nunca oculta el crudo). */
function desconocido(crudo: string): DiagnosticoError {
  return {
    categoria: "desconocido",
    severidad: "amarilla",
    titulo: "Error de emisión no catalogado",
    queePaso: "ARCA (o el sistema) devolvió un error que todavía no está traducido.",
    accion:
      "Leé el detalle técnico de abajo. Si se repite, sumalo al traductor (src/lib/monitor/arca-errores.ts) para explicarlo en criollo la próxima vez.",
    crudo,
  };
}

/**
 * Extrae los códigos numéricos de un mensaje "codigo: mensaje; codigo: mensaje"
 * (formato que arma processArcaOutbox al serializar ArcaRechazoError.observaciones).
 * Un token de 3–5 dígitos al principio de un tramo es un código de ARCA.
 */
export function extraerCodigos(crudo: string): number[] {
  const codigos: number[] = [];
  // Cada observación viene como "10018: El punto de venta ...". Partimos por ';'.
  for (const tramo of crudo.split(";")) {
    const m = /^\s*(\d{3,5})\s*[:\-]/.exec(tramo);
    if (m) codigos.push(Number(m[1]));
  }
  return codigos;
}

/**
 * Traduce un error crudo de ARCA / del plugin a un diagnóstico criollo con acción.
 *
 * Orden de resolución (del más preciso al más general):
 *   1. Código numérico conocido de ARCA (el más confiable).
 *   2. Matcher por palabra clave (firmas de errores del plugin / ARCA por texto).
 *   3. Desconocido (muestra el crudo + acción genérica; nunca se pierde info).
 *
 * Cuando hay VARIOS códigos/errores, gana el más severo (una `roja` tapa una `amarilla`).
 */
export function traducirErrorArca(crudo: string | null | undefined): DiagnosticoError | null {
  if (!crudo || !crudo.trim()) return null;
  const texto = crudo.trim();

  const candidatos: EntradaCodigo[] = [];

  // 1) Códigos numéricos de ARCA.
  for (const codigo of extraerCodigos(texto)) {
    const e = CODIGOS_ARCA[codigo];
    if (e) candidatos.push(e);
  }

  // 2) Matchers por palabra clave.
  for (const m of MATCHERS) {
    if (m.test.test(texto)) candidatos.push(m.entrada);
  }

  if (candidatos.length === 0) return desconocido(texto);

  // Gana el más severo (roja > amarilla); a igualdad, el primero (más específico).
  const elegido = candidatos.reduce((peor, e) =>
    e.severidad === "roja" && peor.severidad !== "roja" ? e : peor,
  );

  return { ...elegido, crudo: texto };
}
