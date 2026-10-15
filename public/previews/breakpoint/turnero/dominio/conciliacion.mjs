// CONCILIACIÓN DE COMPROBANTES — Turnero de Break Point Pádel.
//
// Lee un comprobante de transferencia (el texto que manda el cliente por WhatsApp, o el texto que sale del OCR de
// la imagen) y decide contra qué seña pendiente va. Puro: sin red, sin disco, sin reloj propio. Lo usan el back
// (servidor.mjs → nucleo.mjs) y los tests.
//
// Dos niveles de confianza, dicho con honestidad (docs/tenants/breakpoint/TURNERO-PLAN.md):
//   · "comprobante": el cliente mandó una captura que coincide (cuenta del club, monto, código, fecha). Alcanza
//     para dejar el turno firme, pero una captura se puede editar.
//   · "acreditado": el movimiento aparece en la cuenta real del club (Mercado Pago / banco). Eso es post-venta,
//     con las credenciales que pega el dueño; en la demo no existe.
//
// Ante la duda, NO se confirma solo: va a la bandeja "a revisar" del backoffice y decide una persona.

const MESES = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 };
const pad = (n) => String(n).padStart(2, "0");

/** "21.000,50" · "21000" · "21,000.50" → 21000.5 (formato argentino primero). */
export function numeroArgentino(txt) {
  let s = String(txt ?? "").replace(/[^\d.,]/g, "");
  if (!s) return null;
  const coma = s.lastIndexOf(","), punto = s.lastIndexOf(".");
  if (coma > punto) s = s.replace(/\./g, "").replace(",", "."); // 21.000,50
  else if (punto > coma && coma >= 0) s = s.replace(/,/g, ""); // 21,000.50
  else if (punto >= 0 && /\.\d{3}$/.test(s)) s = s.replace(/\./g, ""); // 21.000
  else if (coma >= 0 && /,\d{3}$/.test(s)) s = s.replace(/,/g, ""); // 21,000
  else s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Normaliza un texto de comprobante (acentos fuera, espacios simples). */
const plano = (t) => String(t ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[ \t]+/g, " ");

/**
 * Extrae los datos de un comprobante. Devuelve `confianza` entre 0 y 1 según cuántos datos clave se pudieron leer
 * (multiplicada por la confianza del OCR si vino de una imagen).
 */
export function leerComprobante(texto, { confianzaOcr = 1 } = {}) {
  const t = plano(texto);
  const out = { monto: null, fecha: null, hora: null, operacion: null, ref: null, destino: { cbu: null, cvu: null, alias: null }, titular: null, confianza: 0 };

  // Monto: "$ 21.000,00" · "ARS 21000" · "Monto: 21.000" · "Importe $21.000". Se prefiere el que tiene etiqueta.
  const conEtiqueta = t.match(/(?:monto|importe|total|transferiste|enviaste)\s*(?:transferido|enviado)?\s*[:\-]?\s*(?:\$|ars)?\s*([\d.,]+\d)/i);
  const conSigno = t.match(/(?:\$|ars)\s*([\d.,]+\d)/i);
  const m = conEtiqueta ?? conSigno;
  if (m) {
    const n = numeroArgentino(m[1]);
    if (n != null && n > 0 && n < 10_000_000) out.monto = Math.round(n * 100) / 100;
  }

  // Fecha: 15/10/2026 · 15-10-26 · 2026-10-15 · "15 de octubre de 2026" · "15 oct 2026".
  let f = t.match(/\b(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})\b/);
  if (f) {
    const anio = f[3].length === 2 ? 2000 + Number(f[3]) : Number(f[3]);
    out.fecha = `${anio}-${pad(f[2])}-${pad(f[1])}`;
  } else if ((f = t.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    out.fecha = `${f[1]}-${f[2]}-${f[3]}`;
  } else if ((f = t.match(/\b(\d{1,2})\s*(?:de\s+)?([a-z]{3,10})\.?\s*(?:de\s+)?(\d{4})\b/i))) {
    const mes = MESES[f[2].toLowerCase()] ?? Object.entries(MESES).find(([k]) => k.startsWith(f[2].toLowerCase().slice(0, 3)))?.[1];
    if (mes) out.fecha = `${f[3]}-${pad(mes)}-${pad(f[1])}`;
  }
  if (out.fecha && !/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(out.fecha)) out.fecha = null;
  const h = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::[0-5]\d)?\s*(?:hs|h)?\b/);
  if (h) out.hora = `${pad(h[1])}:${h[2]}`;

  // Número de operación / comprobante / transacción.
  const op = t.match(/(?:n(?:ro|°|º|o)?\.?\s*(?:de\s+)?)?(?:operacion|comprobante|transaccion|referencia bancaria|id de (?:la )?transferencia|codigo de identificacion|coelsa id)\s*(?:n(?:ro|°|º|o)?\.?)?\s*[:#\-]?\s*((?=[a-z\-]*\d)[a-z0-9][a-z0-9\-]{5,39})/i);
  if (op && !/^bp-/i.test(op[1])) out.operacion = op[1].toUpperCase();

  // Código de referencia del turno (lo damos nosotros: BP-XXXX).
  const ref = t.match(/\bBP-?([A-HJ-NP-Z2-9]{4})\b/i);
  if (ref) out.ref = `BP-${ref[1].toUpperCase()}`;

  // Destino: CBU/CVU (22 dígitos; CVU empieza con 000) y alias (6 a 20, letras/números/puntos/guiones).
  for (const d of t.match(/\b\d{22}\b/g) ?? []) {
    if (d.startsWith("000")) out.destino.cvu ??= d;
    else out.destino.cbu ??= d;
  }
  const alias = t.match(/alias\s*(?:destino|del destinatario)?\s*[:\-]?\s*([a-z0-9][a-z0-9.\-]{4,19})/i);
  if (alias) out.destino.alias = alias[1].toLowerCase();

  const tit = String(texto ?? "").match(/(?:^|\n)\s*(?:de|titular|origen|ordenante|enviado por)\s*[:\-]\s*(\p{L}[\p{L} .']{2,60})/iu);
  if (tit) out.titular = tit[1].trim().replace(/\s+/g, " ");

  // Confianza: monto vale doble (sin monto no hay nada que conciliar).
  const puntos = (out.monto != null ? 2 : 0) + (out.fecha ? 1 : 0) + (out.operacion ? 1 : 0) + (out.destino.cbu || out.destino.cvu || out.destino.alias ? 1 : 0);
  out.confianza = Math.round((puntos / 5) * Math.max(0, Math.min(1, confianzaOcr)) * 100) / 100;
  return out;
}

/** Huella estable del comprobante (para detectar el mismo comprobante mandado dos veces sin nº de operación). */
export function huella(c) {
  const base = [c.monto, c.fecha, c.hora, c.operacion, c.destino?.cbu, c.destino?.cvu, c.destino?.alias, c.titular].map((x) => x ?? "").join("|").toLowerCase();
  let h = 0x811c9dc5; // FNV-1a 32 bits: alcanza para deduplicar, no es criptográfica (no hace falta)
  for (let i = 0; i < base.length; i++) { h ^= base.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16).padStart(8, "0");
}

/** "0001234567" → "••••4567": así se loguea cualquier dato de un comprobante. Nunca el comprobante entero. */
export function enmascarar(s) {
  const v = String(s ?? "");
  return v.length <= 4 ? "••••" : `••••${v.slice(-4)}`;
}

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
/** Mismo celular aunque venga con o sin 54/9/0/15: se comparan los últimos 10 dígitos. */
export const mismoTel = (a, b) => { const x = soloDigitos(a).slice(-10), y = soloDigitos(b).slice(-10); return x.length === 10 && x === y; };

/** ¿El destino del comprobante es una cuenta del club? null = el comprobante no lo dice. */
export function destinoEsDelClub(destino, club) {
  const tiene = destino && (destino.cbu || destino.cvu || destino.alias);
  if (!tiene) return null;
  const alias = (club.alias ?? []).map((a) => a.toLowerCase());
  const cuentas = [...(club.cbu ?? []), ...(club.cvu ?? [])];
  return Boolean((destino.alias && alias.includes(destino.alias)) || (destino.cbu && cuentas.includes(destino.cbu)) || (destino.cvu && cuentas.includes(destino.cvu)));
}

const diasEntre = (a, b) => (Date.UTC(...b.split("-").map((x, i) => (i === 1 ? x - 1 : +x))) - Date.UTC(...a.split("-").map((x, i) => (i === 1 ? x - 1 : +x)))) / 86400000;

/**
 * Decide qué hacer con un comprobante.
 *
 * @param comprobante  salida de leerComprobante
 * @param remitenteTel el número de WhatsApp que lo mandó
 * @param pendientes   [{ reservaId, ref, senaPendiente, saldo, tel, creadaFecha }] señas que esperan pago
 * @param club         { alias: [], cbu: [], cvu: [] } cuentas donde el club recibe
 * @param usados       { operaciones: Set, huellas: Set } lo que ya se concilió
 * @param hoy          "AAAA-MM-DD"
 * @returns { decision: "confirmar"|"parcial"|"revisar"|"rechazar", reservaId?, aplicar?, excedente?, motivo, sugerida? }
 */
export function conciliar({ comprobante: c, remitenteTel, pendientes, club, usados, hoy, minConfianza = 0.6, diasVentana = 2 }) {
  const firma = huella(c);
  if (c.monto == null || c.confianza < minConfianza) return { decision: "revisar", motivo: "No pudimos leer bien el comprobante (monto, fecha o cuenta).", huella: firma };
  if ((c.operacion && usados.operaciones.has(c.operacion)) || usados.huellas.has(firma)) return { decision: "rechazar", motivo: "Ese comprobante ya se usó para otra seña.", huella: firma };

  const delClub = destinoEsDelClub(c.destino, club);
  if (delClub === false) return { decision: "rechazar", motivo: "La transferencia no fue a una cuenta del club.", huella: firma };

  if (c.fecha) {
    const d = diasEntre(c.fecha, hoy);
    if (d < -1) return { decision: "revisar", motivo: "El comprobante tiene una fecha futura.", huella: firma };
    if (d > diasVentana) return { decision: "revisar", motivo: `El comprobante es de hace más de ${diasVentana} días.`, huella: firma };
  }

  // ¿A qué turno va? 1) código BP-XXXX · 2) el celular de quien manda · 3) sólo el monto (nunca automático).
  let candidata = null, por = null;
  if (c.ref) {
    candidata = pendientes.find((p) => p.ref === c.ref) ?? null;
    if (!candidata) return { decision: "revisar", motivo: `El código ${c.ref} no corresponde a ninguna seña pendiente.`, huella: firma };
    por = "código";
  } else {
    const delMismo = pendientes.filter((p) => mismoTel(p.tel, remitenteTel));
    if (delMismo.length === 1) { candidata = delMismo[0]; por = "celular"; }
    else if (delMismo.length > 1) {
      const exactas = delMismo.filter((p) => p.senaPendiente === c.monto);
      if (exactas.length === 1) { candidata = exactas[0]; por = "celular y monto"; }
      else return { decision: "revisar", motivo: "Tiene más de un turno con seña pendiente y el comprobante no dice cuál (falta el código BP).", huella: firma };
    } else {
      const porMonto = pendientes.filter((p) => p.senaPendiente === c.monto);
      return { decision: "revisar", motivo: "No sabemos de quién es: no trae código BP y el número no tiene turnos con seña.", sugerida: porMonto.length === 1 ? porMonto[0].reservaId : null, huella: firma };
    }
  }

  if (c.fecha && candidata.creadaFecha && diasEntre(candidata.creadaFecha, c.fecha) < -1) {
    return { decision: "revisar", reservaId: candidata.reservaId, motivo: "El comprobante es anterior a la reserva.", huella: firma };
  }
  if (delClub === null) return { decision: "revisar", reservaId: candidata.reservaId, motivo: "El comprobante no muestra a qué cuenta se transfirió.", huella: firma };

  const monto = Math.round(c.monto);
  if (monto < candidata.senaPendiente) {
    return { decision: "parcial", reservaId: candidata.reservaId, aplicar: monto, falta: candidata.senaPendiente - monto, motivo: `Llegó una parte de la seña (por ${por}).`, huella: firma };
  }
  const aplicar = Math.min(monto, candidata.saldo);
  const excedente = monto - aplicar;
  return { decision: "confirmar", reservaId: candidata.reservaId, aplicar, excedente, motivo: excedente > 0 ? `Seña cubierta (por ${por}); sobran ${excedente} para revisar.` : `Seña cubierta (por ${por}).`, huella: firma };
}
