// ============================================================================
// ASISTENTE ARCA — la parte PURA (qué paso toca, el pedido de certificado, los textos)
// ============================================================================
//
// Cuatro pasos que puede hacer el cliente en /admin/facturacion?vista=arca y el operador en la ficha
// (pestaña Fiscal): 1) datos fiscales, 2) generar el pedido de certificado (.csr), 3) pegar o subir el
// certificado que devuelve ARCA y probarlo, 4) pasar a producción.
//
// Todo lo de acá es puro: el paso sale de lo cargado (la ficha del pase, src/lib/operador/pase-a-real.ts,
// más si hay un pedido de certificado pendiente y si el cliente ya pidió el pase). La base y el
// cifrado viven en ./asistente-arca.server.ts. Sin interruptores de consola: lo que habilita cada paso
// es el dato cargado, no una llave.
//
// DECISIÓN (anotada para el dueño): el cliente PIDE el pase a producción con una confirmación
// tipeada; lo APLICA un operador con el flujo de siempre (`cambiarFacturacionReal`, con la huella de
// la ficha y el candado de CH). El pase deja comprobantes con validez fiscal y la sexta condición
// (limpiar los comprobantes de prueba) la resuelve GSG: no se abre al cliente.

import { generateKeyPairSync } from "node:crypto";
import forge from "node-forge";
import { cuitValido, normalizarCuit } from "@/lib/cuit";
import { precondicionesDelPase, type FichaFiscalDelPase, type Precondicion } from "@/lib/operador/pase-a-real";

export type PasoAsistente = "datos" | "pedido" | "certificado" | "produccion" | "listo";

export interface PedidoPendiente {
  /** ISO de cuándo se generó el pedido (la clave privada sigue guardada, cifrada, hasta que llegue el cert). */
  creadoEn: string;
}

export interface PedidoDePase {
  pedidoEn: string;
  por: string;
}

export interface EntradaAsistente {
  ficha: FichaFiscalDelPase;
  pedidoPendiente: PedidoPendiente | null;
  /**
   * La lectura del pedido falló (base o descifrado): NO es «no hay pedido». Puede haber un .csr ya
   * subido a ARCA; generar otro lo invalidaría, así que la pantalla ofrece reintentar, no generar.
   */
  pedidoIlegible: boolean;
  pedidoDePase: PedidoDePase | null;
}

/** Lo que dio leer el pedido pendiente: discriminado para que un error no pase por «no hay». */
export type LecturaDelPedido =
  | { estado: "ninguno" }
  | { estado: "pendiente"; csrPem: string; creadoEn: string }
  | { estado: "ilegible" };

/** Envuelve la lectura del pedido (inyectada: el servidor pasa la que abre la base y el cifrado). */
export async function leerPedidoConEstado(
  abrir: () => Promise<{ csrPem: string; creadoEn: string } | null>,
): Promise<LecturaDelPedido> {
  try {
    const p = await abrir();
    return p ? { estado: "pendiente", csrPem: p.csrPem, creadoEn: p.creadoEn } : { estado: "ninguno" };
  } catch {
    return { estado: "ilegible" };
  }
}

/** Defensa del servidor (llamada directa, doble clic): un pedido que no se pudo leer no se pisa. */
export function motivoParaNoReemplazarPedido(lectura: LecturaDelPedido): string | null {
  return lectura.estado === "ilegible"
    ? "No pudimos leer el pedido de certificado que ya generaste, así que no generamos otro (el anterior dejaría de servir). Reintentá en un rato y, si sigue, avisale a GSG."
    : null;
}

export type EstadoDePaso = "hecho" | "actual" | "falta";

export interface EstadoDelAsistente {
  paso: PasoAsistente;
  pasos: Array<{ id: Exclude<PasoAsistente, "listo">; numero: number; titulo: string; estado: EstadoDePaso }>;
  /** Las condiciones del pase (las seis de siempre), para mostrarlas en el paso 4. */
  precondiciones: Precondicion[];
  /** Lo que falta del paso 1 (en criollo). */
  faltanDatos: string[];
  /** Qué certificado hay cargado: sirve para decir «es de pruebas, pedí el de producción». */
  certificado: "ninguno" | "pruebas" | "produccion" | "con-problema";
  /** El cliente puede mandar el pedido de pase (todas las condiciones que dependen de él están). */
  puedePedirPase: boolean;
  /** No se pudo leer el pedido pendiente: se muestra el aviso con «Reintentar». */
  pedidoIlegible: boolean;
  /** Se puede ofrecer generar un pedido: datos completos y el pedido anterior (si hay) se leyó bien. */
  puedeGenerarPedido: boolean;
}

const TITULOS: Record<Exclude<PasoAsistente, "listo">, string> = {
  datos: "Datos fiscales",
  pedido: "Pedido de certificado",
  certificado: "Certificado de ARCA",
  produccion: "Pasar a producción",
};
const ORDEN: Array<Exclude<PasoAsistente, "listo">> = ["datos", "pedido", "certificado", "produccion"];

/** Las condiciones que dependen del negocio (no del modo de la plataforma ni de la limpieza de GSG). */
const DEL_NEGOCIO = new Set(["cuit", "puntoVenta", "condicionIva", "credencial"]);

function certificadoDe(ficha: FichaFiscalDelPase, credencialOk: boolean): EstadoDelAsistente["certificado"] {
  const c = ficha.credencial;
  if (!c) return "ninguno";
  if (credencialOk) return "produccion";
  const cuit = normalizarCuit(ficha.arcaCuit ?? "");
  if (c.entorno === "homologacion" && normalizarCuit(c.certCuit) === cuit) return "pruebas";
  return "con-problema";
}

/** Qué paso toca según lo cargado. Puro: lo mismo para el cliente y para el operador. */
export function estadoDelAsistente(e: EntradaAsistente): EstadoDelAsistente {
  const precondiciones = precondicionesDelPase(e.ficha);
  const por = (id: string) => precondiciones.find((p) => p.id === id)!;
  const datos = [por("cuit"), por("puntoVenta"), por("condicionIva")];
  const faltanDatos = datos.filter((p) => !p.ok).map((p) => p.detalle);
  const credencialOk = por("credencial").ok;
  const certificado = certificadoDe(e.ficha, credencialOk);

  let paso: PasoAsistente;
  if (faltanDatos.length > 0) paso = "datos";
  else if (!e.ficha.arcaHomologacion && credencialOk) paso = "listo";
  else if (e.pedidoPendiente) paso = "certificado";
  else if (certificado === "ninguno" || certificado === "con-problema") paso = "pedido";
  else paso = "produccion";

  const actual = paso === "listo" ? ORDEN.length : ORDEN.indexOf(paso);
  const pasos = ORDEN.map((id, i) => ({
    id,
    numero: i + 1,
    titulo: TITULOS[id],
    estado: (i < actual ? "hecho" : i === actual ? "actual" : "falta") as EstadoDePaso,
  }));
  const puedePedirPase =
    paso === "produccion" &&
    e.ficha.arcaHomologacion &&
    !e.pedidoDePase &&
    precondiciones.filter((p) => DEL_NEGOCIO.has(p.id)).every((p) => p.ok);
  const pedidoIlegible = e.pedidoIlegible;
  const puedeGenerarPedido = faltanDatos.length === 0 && !pedidoIlegible;
  return { paso, pasos, precondiciones, faltanDatos, certificado, puedePedirPase, pedidoIlegible, puedeGenerarPedido };
}

// ── El pedido de certificado (CSR) ───────────────────────────────────────────

/** Largo máximo del atributo O (X.520: 64). */
const LARGO_ORGANIZACION = 64;

/**
 * La razón social como va en el CSR: sin tildes ni caracteres raros (ARCA y algunos lectores de
 * certificados se traban con UTF-8 en el subject), recortada a 64. Vacía → error del llamador.
 */
export function organizacionDelPedido(razonSocial: string): string {
  return razonSocial
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 .,&()\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LARGO_ORGANIZACION)
    .trim();
}

export type ResultadoPedido =
  | { ok: true; keyPem: string; csrPem: string; subject: string }
  | { ok: false; motivo: string };

/**
 * Genera la clave RSA 2048 y el pedido de certificado (CSR PKCS#10) con el subject que pide ARCA:
 * `/C=AR/O=<razón social>/CN=gsg-erp/serialNumber=CUIT <cuit>`. La clave sale de acá sólo para
 * cifrarla (asistente-arca.server.ts); nunca se muestra ni se registra.
 */
export function generarPedidoDeCertificado(datos: { razonSocial: string; cuit: string }): ResultadoPedido {
  const cuit = normalizarCuit(datos.cuit ?? "");
  if (!cuitValido(cuit)) return { ok: false, motivo: "El CUIT del negocio no es válido: pedile a GSG que lo corrija." };
  const o = organizacionDelPedido(datos.razonSocial ?? "");
  if (!o) return { ok: false, motivo: "Falta la razón social del negocio: pedile a GSG que la cargue." };

  // La clave con el crypto nativo (rápido); forge sólo arma y firma el CSR.
  const { privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });
  const key = forge.pki.privateKeyFromPem(privateKey) as forge.pki.rsa.PrivateKey;
  const csr = forge.pki.createCertificationRequest();
  csr.publicKey = forge.pki.setRsaPublicKey(key.n, key.e);
  csr.setSubject([
    { shortName: "C", value: "AR" },
    { shortName: "O", value: o },
    { shortName: "CN", value: "gsg-erp" },
    { name: "serialNumber", value: `CUIT ${cuit}` },
  ]);
  csr.sign(key, forge.md.sha256.create());
  return {
    ok: true,
    keyPem: privateKey,
    csrPem: forge.pki.certificationRequestToPem(csr),
    subject: `/C=AR/O=${o}/CN=gsg-erp/serialNumber=CUIT ${cuit}`,
  };
}

// ── El certificado que devuelve ARCA ─────────────────────────────────────────

const RE_PEM_CERT = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/;

/** Tope de lo que se acepta como certificado (uno de ARCA pesa ~2 KB). */
export const TOPE_CERTIFICADO_BYTES = 64 * 1024;

/** Un byte por carácter (lo que espera forge para el DER). */
function bytesComoTexto(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}

/**
 * Lo pegado o subido → el certificado en PEM, o null si no se reconoce. Acepta el PEM (lo que da
 * WSASS en pantalla y el .crt de Certificados Digitales) y también el DER binario o en base64 suelto.
 */
export function certificadoEnPem(entrada: string | Uint8Array): string | null {
  const texto = typeof entrada === "string" ? entrada : bytesComoTexto(entrada);
  const pem = texto.match(RE_PEM_CERT)?.[0];
  const candidatos: string[] = [];
  if (pem) candidatos.push(pem);
  else {
    const b64 = texto.replace(/\s+/g, "");
    if (typeof entrada === "string" && /^[A-Za-z0-9+/]+=*$/.test(b64) && b64.length > 100) {
      candidatos.push(forge.util.decode64(b64));
    } else if (typeof entrada !== "string") {
      candidatos.push(texto); // DER binario (latin1 = un byte por carácter, lo que espera forge)
    }
  }
  for (const c of candidatos) {
    try {
      const cert = c.startsWith("-----") ? forge.pki.certificateFromPem(c) : forge.pki.certificateFromAsn1(forge.asn1.fromDer(c));
      return forge.pki.certificateToPem(cert);
    } catch {
      // sigue con el próximo
    }
  }
  return null;
}

/** El error de la carga del certificado, en criollo (sin material del certificado). */
export function errorDeCargaEnCriollo(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  const nombre = e instanceof Error ? e.name : "";
  if (/no corresponde al certificado/i.test(m)) {
    return "Este certificado no es del último pedido que generaste. Subí el certificado que ARCA te dio para ese .csr (si generaste otro pedido después, usá el nuevo).";
  }
  if (nombre === "CredencialCuitMismatchError" || /no corresponde al CUIT/i.test(m)) {
    return "El certificado es de otro CUIT, no del de este negocio. Revisá que lo hayas pedido con la clave fiscal del negocio.";
  }
  if (/CUIT del subject/i.test(m)) {
    return "No encontramos el CUIT dentro del certificado: ¿es el que te dio ARCA para este pedido?";
  }
  if (nombre === "CuitTenantAusenteError") return "El negocio no tiene CUIT cargado: pedile a GSG que lo cargue.";
  // Alta web: dos altas reclamaban el mismo CUIT y la otra conectó ARCA primero (tenant-cert.ts).
  if (nombre === "CuitVerificadoEnOtroNegocioError") return m;
  if (/FISCAL_MASTER_KEY|master key/i.test(m)) {
    return "Falta la configuración para guardar certificados cifrados. Avisale a GSG.";
  }
  return "No se pudo guardar el certificado. Probá de nuevo y, si sigue, avisale a GSG.";
}

// ── Pedido de pase a producción ──────────────────────────────────────────────

export const PALABRA_DEL_PASE = "PRODUCCION";

/** La confirmación tipeada del pedido de pase: «PRODUCCIÓN», sin importar mayúsculas ni tilde. */
export function confirmaElPase(texto: unknown): boolean {
  if (typeof texto !== "string") return false;
  return (
    texto
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .trim()
      .toUpperCase() === PALABRA_DEL_PASE
  );
}

// ── Instrucciones ────────────────────────────────────────────────────────────

/**
 * Lo que la persona hace ELLA MISMA dentro de ARCA (decisión del dueño 05/11/2026: GSG no entra a su
 * ARCA ni usa delegación a su CUIT; su clave fiscal queda con ella). El «pedido de certificado» es el
 * archivo .csr que arma el sistema; el «certificado» es el .crt que devuelve ARCA. Producción va
 * primero: es el que factura en serio; homologación queda como opcional.
 */
export const INSTRUCCIONES_DEL_PEDIDO: Readonly<Record<"pruebas" | "produccion", { titulo: string; pasos: string[] }>> = {
  produccion: {
    titulo: "En ARCA, con tu clave fiscal nivel 3 (unos 5 minutos)",
    pasos: [
      "Entrá a arca.gob.ar → «Iniciar sesión» con tu CUIT y tu clave fiscal. Buscá «Administración de Certificados Digitales» y entrá (si no aparece, tu clave no es nivel 3).",
      "Tocá «Agregar alias». En «Alias» poné gsg-erp; en «Archivo» subí el pedido de certificado que bajaste acá (pedido-arca-….csr) y tocá «Agregar alias».",
      "En la lista, tocá «Ver» al lado de gsg-erp y después «Descargar»: ese archivo (.crt) es tu certificado. Lo subís o lo pegás en el paso 3 de acá.",
      "Volvé al inicio de ARCA y abrí «Administrador de Relaciones de Clave Fiscal» → «Nueva relación» → «Buscar» → ARCA → «WebServices» → «Facturación Electrónica».",
      "En «Representante» tocá «Buscar» y elegí el certificado gsg-erp (figura como «computador fiscal»). Confirmá. No le das permiso a nadie: lo asociás a tu propio certificado.",
    ],
  },
  pruebas: {
    titulo: "Opcional: probar antes en homologación (WSASS)",
    pasos: [
      "En ARCA abrí «WSASS - Autogestión Certificados Homologación» (si no aparece, sumalo en Administrador de Relaciones de Clave Fiscal).",
      "«Nuevo certificado»: poné gsg-erp y pegá el pedido de certificado (el botón «Copiar» de acá lo deja listo para pegar).",
      "Copiá el certificado que te muestra y pegalo en el paso 3. Después, en «Crear autorización a servicio», autorizá ese certificado para «wsfe».",
    ],
  },
};
