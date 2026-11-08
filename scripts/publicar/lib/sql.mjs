// ============================================================================
// ¿Esta migración es ADITIVA? — el detector que frena la publicación automática.
// ============================================================================
//
// Regla del dueño (Factory-GSG CLAUDE.md, «la orquestadora gestiona las cuentas»): se publica
// sola sólo una migración aditiva. Las irreversibles (DROP, enum, borrado de datos, renombres)
// son owner-level: el workflow FRENA y el dueño decide.
//
// CÓMO LEE EL SQL. No es un parser de Postgres: es un lector conservador.
//   1. Saca los comentarios (`--` y `/* */` anidados) respetando strings ('…', E'…'),
//      identificadores ("…") y cuerpos $tag$…$tag$. El texto que queda tiene EL MISMO LARGO que
//      el original (los comentarios se pisan con espacios y se conservan los saltos de línea),
//      así cada hallazgo se informa con su número de línea real.
//   2. NO saca los strings: `EXECUTE 'DROP TABLE x'` ejecuta lo que hay adentro del string,
//      así que un DROP dentro de un string también frena. Un falso positivo frena (y el dueño
//      mira); un falso negativo publica algo irreversible. Se elige siempre lo primero.
//   3. El SQL dinámico (`EXECUTE …`) frena, salvo UN idioma reconocido letra por letra: el bloque
//      de RLS por tenant que usan los módulos del ERP (ENABLE RLS + DROP POLICY IF EXISTS +
//      CREATE POLICY tenant_isolation) y SÓLO sobre tablas que la misma migración crea.
//   4. Si algo no se puede leer (un string o comentario sin cerrar), frena.

const IDENT_CHAR = /[A-Za-z0-9_$\u0080-\uffff]/;

/**
 * Pisa con espacios los comentarios SQL, conservando largo y saltos de línea.
 * @returns {{ texto: string, error: string | null }}
 */
export function limpiarComentarios(sql) {
  const out = [];
  const n = sql.length;
  let i = 0;
  const blanco = (s) => s.replace(/[^\n]/g, " ");
  while (i < n) {
    const c = sql[i];
    const sig = sql[i + 1];
    // Comentario de línea.
    if (c === "-" && sig === "-") {
      let j = i;
      while (j < n && sql[j] !== "\n") j++;
      out.push(blanco(sql.slice(i, j)));
      i = j;
      continue;
    }
    // Comentario de bloque (Postgres los anida).
    if (c === "/" && sig === "*") {
      let j = i + 2;
      let prof = 1;
      while (j < n && prof > 0) {
        if (sql[j] === "/" && sql[j + 1] === "*") {
          prof++;
          j += 2;
        } else if (sql[j] === "*" && sql[j + 1] === "/") {
          prof--;
          j += 2;
        } else j++;
      }
      if (prof > 0) return { texto: "", error: `comentario /* sin cerrar (línea ${linea(sql, i)})` };
      out.push(blanco(sql.slice(i, j)));
      i = j;
      continue;
    }
    // String: '…' estándar ('' escapa) o E'…' (además \ escapa).
    if (c === "'") {
      const prev = sql[i - 1];
      const prevPrev = sql[i - 2];
      const conEscape = (prev === "E" || prev === "e") && !(prevPrev && IDENT_CHAR.test(prevPrev));
      let j = i + 1;
      let cerrado = false;
      while (j < n) {
        if (conEscape && sql[j] === "\\") {
          j += 2;
          continue;
        }
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2;
            continue;
          }
          cerrado = true;
          j++;
          break;
        }
        j++;
      }
      if (!cerrado) return { texto: "", error: `string '…' sin cerrar (línea ${linea(sql, i)})` };
      out.push(sql.slice(i, j));
      i = j;
      continue;
    }
    // Identificador entre comillas dobles ("" escapa).
    if (c === '"') {
      let j = i + 1;
      let cerrado = false;
      while (j < n) {
        if (sql[j] === '"') {
          if (sql[j + 1] === '"') {
            j += 2;
            continue;
          }
          cerrado = true;
          j++;
          break;
        }
        j++;
      }
      if (!cerrado) return { texto: "", error: `identificador "…" sin cerrar (línea ${linea(sql, i)})` };
      out.push(sql.slice(i, j));
      i = j;
      continue;
    }
    // Cuerpo $tag$…$tag$ (funciones, DO). Su contenido es SQL que se ejecuta: se limpia igual,
    // recursivamente. Si no se puede limpiar (p. ej. es texto con un apóstrofo suelto), queda
    // entero: se escanea de más, nunca de menos.
    if (c === "$" && !(i > 0 && IDENT_CHAR.test(sql[i - 1]))) {
      const m = /^\$([A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const fin = sql.indexOf(tag, i + tag.length);
        if (fin < 0) return { texto: "", error: `cuerpo ${tag} sin cerrar (línea ${linea(sql, i)})` };
        const cuerpo = sql.slice(i + tag.length, fin);
        const dentro = limpiarComentarios(cuerpo);
        out.push(tag, dentro.error ? cuerpo : dentro.texto, tag);
        i = fin + tag.length;
        continue;
      }
    }
    out.push(c);
    i++;
  }
  return { texto: out.join(""), error: null };
}

/**
 * Sobre un texto YA limpio de comentarios: pisa con espacios el CONTENIDO de los strings '…'
 * (mismo largo). Sirve para ubicar sentencias reales: un `; CREATE TABLE` adentro de un string no
 * es una sentencia. Los cuerpos $tag$ son código y se recorren igual.
 */
export function enmascararStrings(texto, { cuerpos = true } = {}) {
  const out = [];
  let i = 0;
  const n = texto.length;
  while (i < n) {
    const c = texto[i];
    if (c === "'") {
      const prev = texto[i - 1];
      const conEscape = (prev === "E" || prev === "e") && !(texto[i - 2] && IDENT_CHAR.test(texto[i - 2]));
      let j = i + 1;
      while (j < n) {
        if (conEscape && texto[j] === "\\") { j += 2; continue; }
        if (texto[j] === "'") { if (texto[j + 1] === "'") { j += 2; continue; } break; }
        j++;
      }
      out.push("'", texto.slice(i + 1, Math.min(j, n)).replace(/[^\n]/g, " "), j < n ? "'" : "");
      i = j + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      while (j < n) {
        if (texto[j] === '"') { if (texto[j + 1] === '"') { j += 2; continue; } break; }
        j++;
      }
      out.push(texto.slice(i, Math.min(j + 1, n)));
      i = j + 1;
      continue;
    }
    if (c === "$" && !(i > 0 && IDENT_CHAR.test(texto[i - 1]))) {
      const m = /^\$([A-Za-z_\u0080-\uffff][A-Za-z0-9_\u0080-\uffff]*)?\$/.exec(texto.slice(i));
      if (m) {
        const fin = texto.indexOf(m[0], i + m[0].length);
        if (fin >= 0) {
          const cuerpo = texto.slice(i + m[0].length, fin);
          out.push(m[0], cuerpos ? enmascararStrings(cuerpo) : cuerpo.replace(/[^\n]/g, " "), m[0]);
          i = fin + m[0].length;
          continue;
        }
      }
    }
    out.push(c);
    i++;
  }
  return out.join("");
}

export function linea(texto, offset) {
  let l = 1;
  for (let k = 0; k < offset && k < texto.length; k++) if (texto[k] === "\n") l++;
  return l;
}


// ── Tokenizador ─────────────────────────────────────────────────────────────
// Las reglas NO se aplican sobre el SQL tal como viene: Postgres acepta `UPDATE"Venta"SET…` o
// `ON"Venta"` sin espacios, y una regex con \s+ no lo ve. Primero se parte el SQL en tokens
// (palabras, "identificadores", 'strings', cuerpos $tag$…$tag$, números, operadores) y se rearma un
// TEXTO CANÓNICO con exactamente un separador entre tokens (los saltos de línea se conservan, así los
// hallazgos traen la línea real). Sobre ese texto corren las reglas; sobre los tokens corre la lista
// permitida (ver `sentenciaPermitida`).

const WORD0 = /[A-Za-z_\u0080-￿]/;
const WORDN = /[A-Za-z0-9_$\u0080-￿]/;
const OPCH = "+-*/<>=~!@#%^&|`?";
const RE_DOLAR = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/;

/**
 * @typedef {{ k: "w"|"q"|"s"|"d"|"n"|"p"|"o", raw: string, low: string, pos: number, nl: number,
 *   dentro?: Token[], cuerpoPos?: number }} Token
 *   w palabra · q "identificador" · s 'string' · d $tag$cuerpo$tag$ · n número · p puntuación · o operador
 */

/** @returns {{ tokens: Token[] | null, error: string | null, nlFinal: number }} */
export function tokenizar(sql, base = 0) {
  /** @type {Token[]} */
  const toks = [];
  const n = sql.length;
  let i = 0;
  let nl = 0;
  const falla = (msg, at) => ({ tokens: null, error: `${msg} (línea ${linea(sql, at)})`, nlFinal: 0 });
  const push = (k, desde, hasta, extra = {}) => {
    const raw = sql.slice(desde, hasta);
    toks.push({ k, raw, low: raw.toLowerCase(), pos: base + desde, nl, ...extra });
    nl = 0;
  };
  // Cierra un '…' (o "…") que abre en `j`; con `barra`, \ escapa. Devuelve el índice después del cierre.
  const cerrar = (j, q, barra) => {
    j++;
    while (j < n) {
      if (barra && sql[j] === "\\") { j += 2; continue; }
      if (sql[j] === q) { if (sql[j + 1] === q) { j += 2; continue; } return j + 1; }
      j++;
    }
    return -1;
  };
  while (i < n) {
    const c = sql[i];
    const s = sql[i + 1];
    if (/\s/.test(c)) { if (c === "\n") nl++; i++; continue; }
    if (c === "-" && s === "-") { while (i < n && sql[i] !== "\n") i++; continue; }
    if (c === "/" && s === "*") {
      const desde = i;
      let prof = 1;
      i += 2;
      while (i < n && prof > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") { prof++; i += 2; }
        else if (sql[i] === "*" && sql[i + 1] === "/") { prof--; i += 2; }
        else { if (sql[i] === "\n") nl++; i++; }
      }
      if (prof > 0) return falla("comentario /* sin cerrar", desde);
      continue;
    }
    // U&'…' / U&"…": escapes unicode, se conservan pegados (una regla los frena).
    if ((c === "U" || c === "u") && s === "&" && (sql[i + 2] === "'" || sql[i + 2] === '"')) {
      const fin = cerrar(i + 2, sql[i + 2], false);
      if (fin < 0) return falla("U&… sin cerrar", i);
      push(sql[i + 2] === "'" ? "s" : "q", i, fin, { unicode: true });
      i = fin;
      continue;
    }
    // Strings: '…', E'…' (\ escapa), B'…', X'…', N'…'. El prefijo queda pegado.
    if (c === "'" || (/[EeBbXxNn]/.test(c) && s === "'")) {
      const pre = c === "'" ? 0 : 1;
      const fin = cerrar(i + pre, "'", c === "E" || c === "e");
      if (fin < 0) return falla("string '…' sin cerrar", i);
      push("s", i, fin);
      i = fin;
      continue;
    }
    if (c === '"') {
      const fin = cerrar(i, '"', false);
      if (fin < 0) return falla('identificador "…" sin cerrar', i);
      push("q", i, fin);
      i = fin;
      continue;
    }
    if (c === "$") {
      const m = RE_DOLAR.exec(sql.slice(i, i + 200));
      if (m) {
        const tag = m[0];
        const fin = sql.indexOf(tag, i + tag.length);
        if (fin < 0) return falla(`cuerpo ${tag} sin cerrar`, i);
        // El cuerpo es código (DO, funciones): se tokeniza también. Si no se puede, frena.
        const cuerpo = sql.slice(i + tag.length, fin);
        const dentro = tokenizar(cuerpo, base + i + tag.length);
        if (dentro.error) return { tokens: null, error: `dentro de ${tag}: ${dentro.error}`, nlFinal: 0 };
        push("d", i, fin + tag.length, { dentro: dentro.tokens, tag, nlFinal: dentro.nlFinal });
        i = fin + tag.length;
        continue;
      }
      let j = i + 1;
      while (j < n && /[0-9]/.test(sql[j])) j++;
      push("w", i, j); // $1 (parámetro) o $ suelto
      i = j;
      continue;
    }
    if (WORD0.test(c)) {
      let j = i + 1;
      while (j < n && WORDN.test(sql[j])) j++;
      push("w", i, j);
      i = j;
      continue;
    }
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s ?? ""))) {
      const m = /^(?:[0-9][0-9_]*(?:\.[0-9_]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(sql.slice(i, i + 100));
      push("n", i, i + m[0].length);
      i += m[0].length;
      continue;
    }
    if (c === ":" && (s === ":" || s === "=")) { push("p", i, i + 2); i += 2; continue; }
    if ("()[],;.:".includes(c)) { push("p", i, i + 1); i++; continue; }
    if (OPCH.includes(c)) {
      let j = i + 1;
      while (j < n && OPCH.includes(sql[j]) && !(sql[j] === "-" && sql[j + 1] === "-") && !(sql[j] === "/" && sql[j + 1] === "*")) j++;
      push("o", i, j);
      i = j;
      continue;
    }
    push("o", i, i + 1);
    i++;
  }
  return { tokens: toks, error: null, nlFinal: nl };
}

/** Rearma el texto canónico: un separador entre tokens, mismos saltos de línea. */
function canonico(tokens, nlFinal) {
  const out = [];
  tokens.forEach((t, k) => {
    out.push(t.nl > 0 ? "\n".repeat(t.nl) : k === 0 ? "" : " ");
    if (t.k === "d") out.push(t.tag, " ", canonico(t.dentro, t.nlFinal), " ", t.tag);
    else out.push(t.raw);
  });
  out.push("\n".repeat(nlFinal));
  return out.join("");
}

/** @returns {{ texto: string, error: string | null }} */
export function canonizar(sql) {
  const r = tokenizar(sql);
  if (r.error) return { texto: "", error: r.error };
  return { texto: canonico(r.tokens, r.nlFinal), error: null };
}

// ── Identificadores ─────────────────────────────────────────────────────────
// Postgres: "Así" respeta mayúsculas; sin comillas se pliega a minúsculas. Se comparan así.
const RE_IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const RE_TABLA = String.raw`(?:(?:"public"|public)\s*\.\s*)?(${RE_IDENT})`;

export function normalizarIdent(raw) {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  return raw.toLowerCase();
}


/** `FOREACH t IN ARRAY ARRAY['A', 'B']` → { t: ['A','B'] } (null si algún elemento no es un literal simple). */
function arreglosDeLoop(texto) {
  const mapa = new Map();
  const re = /\bFOREACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+ARRAY\s+ARRAY\s*\[([^\]]*)\]/gi;
  let m;
  while ((m = re.exec(texto))) {
    const v = m[1].toLowerCase();
    const elems = m[2].split(",").map((s) => s.trim());
    const nombres = elems.map((e) => (/^'[A-Za-z_][A-Za-z0-9_]*'$/.test(e) ? e.slice(1, -1) : null));
    const previo = mapa.get(v);
    if (nombres.some((x) => x === null) || previo === null) mapa.set(v, null);
    else mapa.set(v, [...(previo ?? []), ...nombres]);
  }
  // Si la variable se asigna por otro lado (t := 'Client', t = …, SELECT … INTO t, FOR t IN SELECT,
  // DECLARE t text DEFAULT …), el FOREACH no alcanza para saber a qué tabla apunta: no se resuelve.
  for (const v of mapa.keys()) {
    const asigna = new RegExp(
      String.raw`\b${v}\s*(?::=|=)|\bINTO\s+(?:STRICT\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*,\s*)*${v}\b|\bFOR\s+${v}\s+IN\b|\b${v}\b[^;]*?\bDEFAULT\b`,
      "i",
    );
    if (asigna.test(texto)) mapa.set(v, null);
  }
  return mapa;
}

/**
 * Lee `EXECUTE [format(] '…' [|| '…']* [, var)] ;` desde `pos` (justo después de EXECUTE).
 * Devuelve null si la forma no es exactamente ésa.
 */
function leerExecute(texto, pos) {
  let i = pos;
  const ws = () => {
    while (i < texto.length && /\s/.test(texto[i])) i++;
  };
  ws();
  let conFormat = false;
  const mf = /^format\s*\(/i.exec(texto.slice(i, i + 40));
  if (mf) {
    conFormat = true;
    i += mf[0].length;
    ws();
  }
  const partes = [];
  for (;;) {
    if (texto[i] !== "'") return null;
    // E'…' no se admite acá (texto[i-1] sería E): el literal tiene que ser estándar.
    if (/[Ee]/.test(texto[i - 1] ?? "")) return null;
    let j = i + 1;
    let s = "";
    for (;;) {
      if (j >= texto.length) return null;
      if (texto[j] === "'") {
        if (texto[j + 1] === "'") {
          s += "'";
          j += 2;
          continue;
        }
        break;
      }
      s += texto[j];
      j++;
    }
    partes.push(s);
    i = j + 1;
    ws();
    if (texto[i] === "|" && texto[i + 1] === "|") {
      i += 2;
      ws();
      continue;
    }
    break;
  }
  let variable = null;
  if (conFormat) {
    if (texto[i] !== ",") return null;
    i++;
    ws();
    const mv = /^[A-Za-z_][A-Za-z0-9_]*/.exec(texto.slice(i));
    if (!mv) return null;
    variable = mv[0].toLowerCase();
    i += mv[0].length;
    ws();
    if (texto[i] !== ")") return null;
    i++;
    ws();
  }
  if (texto[i] !== ";") return null;
  return { sql: partes.join(""), conFormat, variable, fin: i + 1 };
}

const PRED_TENANT = String.raw`\(\s*"tenantId"\s*=\s*current_setting\s*\(\s*'app\.current_tenant_id'\s*,\s*true\s*\)\s*\)`;
const RE_TABLA_NC = String.raw`(?:(?:"public"|public)\s*\.\s*)?${RE_IDENT}`;
const T_DIN = String.raw`(%I|${RE_TABLA_NC})`; // %I o una tabla con nombre

/** Clasifica el SQL de un EXECUTE contra las formas permitidas del idioma RLS. */
function formaRls(sql) {
  const s = sql.trim();
  let m;
  if ((m = new RegExp(String.raw`^ALTER\s+TABLE\s+${T_DIN}\s+(ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY$`, "i").exec(s)))
    return { tipo: "rls", tabla: m[1] };
  if ((m = new RegExp(String.raw`^DROP\s+POLICY\s+IF\s+EXISTS\s+(${RE_IDENT})\s+ON\s+${T_DIN}$`, "i").exec(s)))
    return { tipo: "drop", politica: normalizarIdent(m[1]), tabla: m[2] };
  if (
    (m = new RegExp(
      String.raw`^CREATE\s+POLICY\s+(${RE_IDENT})\s+ON\s+${T_DIN}\s+USING\s*${PRED_TENANT}\s*WITH\s+CHECK\s*${PRED_TENANT}$`,
      "i",
    ).exec(s))
  )
    return { tipo: "create", politica: normalizarIdent(m[1]), tabla: m[2] };
  return null;
}

/** Quita el prefijo public. y normaliza; "%I" queda como está. */
function tablaDe(raw) {
  if (raw === "%I") return "%I";
  const m = new RegExp(String.raw`^${RE_TABLA}$`, "i").exec(raw.trim());
  return m ? normalizarIdent(m[1]) : null;
}

/**
 * Busca los EXECUTE del idioma RLS sobre tablas nuevas y devuelve los rangos a neutralizar.
 * Un DROP POLICY sólo se acepta si la misma política se recrea (CREATE POLICY) en la misma tabla.
 */
function idiomaRls(texto, creadas) {
  const loops = arreglosDeLoop(texto);
  const re = /\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE)\b)/gi;
  const candidatos = [];
  let m;
  while ((m = re.exec(texto))) {
    const ex = leerExecute(texto, m.index + m[0].length);
    if (!ex) continue;
    const forma = formaRls(ex.sql);
    if (!forma) continue;
    const t = tablaDe(forma.tabla);
    if (t === null) continue;
    let tablas;
    if (ex.conFormat) {
      // Con format(): un solo %I, ningún otro especificador, y el argumento es la variable de un
      // FOREACH sobre literales.
      if (t !== "%I") continue;
      if ((ex.sql.match(/%/g) ?? []).length !== 1) continue;
      const lista = loops.get(ex.variable);
      if (!lista || lista.length === 0) continue;
      tablas = lista;
    } else {
      if (t === "%I" || ex.sql.includes("%")) continue;
      tablas = [t];
    }
    if (!tablas.every((x) => creadas.has(x))) continue;
    candidatos.push({ ...forma, tablas, desde: m.index, hasta: ex.fin });
  }
  // La misma forma escrita como sentencias sueltas (sin EXECUTE): sólo con nombre de tabla
  // literal, al principio de una sentencia (después de `;`, del inicio, o de BEGIN/THEN/LOOP/ELSE).
  const reSuelta = /(?:^|;|\bBEGIN\b|\bTHEN\b|\bLOOP\b|\bELSE\b)(\s*)((?:DROP\s+POLICY|CREATE\s+POLICY)\b[^;]*);/gi;
  const mascara = enmascararStrings(texto);
  while ((m = reSuelta.exec(mascara))) {
    const real = texto.slice(m.index + m[0].length - m[2].length - 1, m.index + m[0].length - 1);
    const forma = formaRls(real);
    reSuelta.lastIndex = m.index + m[0].length - 1; // el `;` puede abrir la próxima
    if (!forma) continue;
    const t = tablaDe(forma.tabla);
    if (t === null || t === "%I" || !creadas.has(t)) continue;
    const desde = m.index + m[0].length - m[2].length - 1;
    candidatos.push({ ...forma, tablas: [t], desde, hasta: m.index + m[0].length });
  }
  const recreadas = new Set();
  for (const c of candidatos) if (c.tipo === "create") for (const t of c.tablas) recreadas.add(`${c.politica}@${t}`);
  const aceptados = candidatos.filter(
    (c) => c.tipo !== "drop" || c.tablas.every((t) => recreadas.has(`${c.politica}@${t}`)),
  );
  return aceptados;
}

// ── Reglas ──────────────────────────────────────────────────────────────────
// `bloqueo`: no es aditiva (o no se puede asegurar que lo sea) → el workflow frena.
// `aviso`: es aditiva pero conviene que se lea en el comentario del PR.
const BLOQUEOS = [
  { regla: "DROP", re: /\bDROP\b/gi, motivo: "borra un objeto (tabla, columna, índice, restricción, default…)" },
  { regla: "TRUNCATE", re: /\bTRUNCATE\b/gi, motivo: "borra datos" },
  { regla: "DELETE", re: /\bDELETE\s+FROM\b/gi, motivo: "borra datos" },
  { regla: "ALTER TYPE", re: /\bALTER\s+TYPE\b/gi, motivo: "cambia un tipo/enum existente (irreversible en Postgres)" },
  {
    regla: "CAMBIO DE TIPO",
    re: new RegExp(String.raw`\bALTER\s+(?:COLUMN\s+)?${RE_IDENT}\s+(?:SET\s+DATA\s+)?TYPE\b`, "gi"),
    motivo: "cambia el tipo de una columna existente",
  },
  { regla: "RENAME", re: /\bRENAME\b/gi, motivo: "renombra: el código publicado busca el nombre viejo" },
  { regla: "SET NOT NULL", re: /\bSET\s+NOT\s+NULL\b/gi, motivo: "endurece una columna existente" },
  {
    regla: "RLS APAGADO",
    re: /\b(?:DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/gi,
    motivo: "apaga el aislamiento entre negocios",
  },
  { regla: "REVOKE", re: /\bREVOKE\b/gi, motivo: "quita permisos" },
  { regla: "ROLES", re: /\b(?:CREATE|ALTER)\s+(?:ROLE|USER)\b/gi, motivo: "crea o cambia credenciales (owner-level)" },
  {
    regla: "CAMBIO DE ROL",
    re: /\bSET\s+(?:LOCAL\s+|SESSION\s+)?(?:ROLE|SESSION\s+AUTHORIZATION)\b/gi,
    motivo: "cambia el rol con el que corre la migración",
  },
  { regla: "ALTER POLICY", re: /\bALTER\s+POLICY\b/gi, motivo: "cambia una política de aislamiento existente" },
  {
    regla: "SEARCH_PATH",
    re: /\bSET\s+(?:LOCAL\s+|SESSION\s+)?SEARCH_PATH\b|\bSET_CONFIG\s*\(/gi,
    motivo: "cambia a qué esquema apuntan los nombres",
  },
  { regla: "GRANT", re: /\bGRANT\b/gi, motivo: "otorga permisos (cambiar permisos es owner-level)" },
  { regla: "MERGE", re: /\bMERGE\s+INTO\b/gi, motivo: "MERGE puede actualizar o borrar filas existentes" },
  { regla: "UPSERT", re: /\bDO\s+UPDATE\b/gi, motivo: "ON CONFLICT DO UPDATE pisa filas existentes" },
  {
    regla: "ALTER DE OBJETO EXISTENTE",
    re: /\bALTER\s+(?:FUNCTION|PROCEDURE|ROUTINE|VIEW|MATERIALIZED\s+VIEW|TRIGGER|EXTENSION|DOMAIN|SCHEMA|DATABASE|TABLESPACE|PUBLICATION|SUBSCRIPTION|EVENT\s+TRIGGER|AGGREGATE|OPERATOR|LARGE\s+OBJECT|FOREIGN|SERVER|INDEX|STATISTICS|COLLATION|CONVERSION|TEXT\s+SEARCH|LANGUAGE|GROUP)\b/gi,
    motivo: "cambia un objeto que ya existe",
  },
  {
    regla: "EVENT TRIGGER",
    re: /\bEVENT\s+TRIGGER\b/gi,
    motivo: "un trigger de eventos corre ante cualquier DDL de la base (owner-level)",
  },
  {
    regla: "DEFAULT EN tenantId",
    re: /\bALTER\s+(?:COLUMN\s+)?(?:"tenantId"|tenantid)\s+SET\s+DEFAULT\b/gi,
    motivo: "un default de tenantId manda filas sin negocio explícito a un negocio fijo (fuga entre negocios)",
  },
  { regla: "CALL", re: /\bCALL\b/gi, motivo: "ejecuta un procedimiento que ya existe: no se puede leer qué hace" },
  {
    regla: "TABLA MOVIDA / SIN LOG",
    re: /\bSET\s+(?:SCHEMA|UNLOGGED|LOGGED|TABLESPACE)\b|\bDETACH\s+PARTITION\b/gi,
    motivo: "mueve una tabla o cambia cómo se guarda",
  },
  { regla: "SECUENCIAS", re: /\bALTER\s+SEQUENCE\b|\bSETVAL\s*\(/gi, motivo: "toca una secuencia en uso (ids repetidos)" },
  {
    regla: "TRIGGER/REGLA APAGADO",
    re: /\b(?:DISABLE|ENABLE\s+(?:REPLICA|ALWAYS))\s+(?:TRIGGER|RULE)\b/gi,
    motivo: "apaga o cambia un control de la base",
  },
  {
    regla: "RULE",
    re: /\bCREATE\s+(?:OR\s+REPLACE\s+)?RULE\b/gi,
    motivo: "una regla puede reescribir o descartar escrituras",
  },
  {
    regla: "CREATE OR REPLACE",
    re: /\bCREATE\s+OR\s+REPLACE\b/gi,
    motivo: "reemplaza una función/vista que puede existir (cambia comportamiento vigente)",
  },
  {
    regla: "SQL DINÁMICO",
    re: /\bEXECUTE\b(?!\s+(?:FUNCTION|PROCEDURE)\b)/gi,
    motivo: "SQL armado en tiempo de ejecución: no se puede asegurar que sea aditivo",
  },
  {
    regla: "SQL OFUSCADO / FUERA DE BANDA",
    re: /\b(?:DBLINK\w*|CHR\s*\(|CONVERT_FROM\s*\(|DECODE\s*\(|PG_READ_\w+|PG_WRITE_\w+|LO_IMPORT|LO_EXPORT|PG_TERMINATE_BACKEND|PG_CANCEL_BACKEND)|\bU&['"]|\bCOPY\b|\bALTER\s+SYSTEM\b|\bALTER\s+DEFAULT\s+PRIVILEGES\b/gi,
    motivo: "construye o ejecuta SQL por fuera de lo que se puede leer acá",
  },
];

const AVISOS = [
  { regla: "INSERT", re: /\bINSERT\s+INTO\b/gi, motivo: "inserta datos" },
  { regla: "EXTENSIÓN", re: /\bCREATE\s+EXTENSION\b/gi, motivo: "instala una extensión de Postgres" },
  { regla: "SECURITY DEFINER", re: /\bSECURITY\s+DEFINER\b/gi, motivo: "función que corre con permisos del dueño" },
  { regla: "OWNER TO", re: /\bOWNER\s+TO\b/gi, motivo: "cambia el dueño de un objeto" },
];



// ── Lectura por sentencias (sobre tokens) ───────────────────────────────────
const esP = (t, v) => !!t && t.k === "p" && t.raw === v;
const esW = (t, ...vs) => !!t && t.k === "w" && vs.includes(t.low);

/** Nombre de un token identificador (null si no es uno). */
function identDe(t) {
  if (!t) return null;
  if (t.k === "q" && !t.unicode) return normalizarIdent(t.raw);
  if (t.k === "w" && WORD0.test(t.raw[0])) return t.low;
  return null;
}

/** `[public .] nombre` desde ts[i]. Otro esquema → null (no se puede saber qué tabla es). */
function leerTabla(ts, i) {
  const a = identDe(ts[i]);
  if (a === null) return null;
  if (!esP(ts[i + 1], ".")) return { nombre: a, fin: i + 1 };
  if (a !== "public") return null;
  const b = identDe(ts[i + 2]);
  if (b === null || esP(ts[i + 3], ".")) return null;
  return { nombre: b, fin: i + 3 };
}

/** Índice del paréntesis/corchete que cierra el que abre en ts[i] (-1 si no cierra). */
function cierre(ts, i) {
  let prof = 0;
  for (let j = i; j < ts.length; j++) {
    if (esP(ts[j], "(") || esP(ts[j], "[")) prof++;
    else if (esP(ts[j], ")") || esP(ts[j], "]")) if (--prof === 0) return j;
  }
  return -1;
}

/** Parte ts[a, b) por las comas de nivel 0 → [[desde, hasta], …]. */
function partirComas(ts, a, b) {
  const out = [];
  let prof = 0;
  let desde = a;
  for (let j = a; j < b; j++) {
    if (esP(ts[j], "(") || esP(ts[j], "[")) prof++;
    else if (esP(ts[j], ")") || esP(ts[j], "]")) prof--;
    else if (prof === 0 && esP(ts[j], ",")) { out.push([desde, j]); desde = j + 1; }
  }
  out.push([desde, b]);
  return out;
}

function sentencias(ts) {
  const out = [];
  let actual = [];
  for (const t of ts) {
    if (esP(t, ";")) { out.push(actual); actual = []; }
    else actual.push(t);
  }
  out.push(actual);
  return out.filter((s) => s.length);
}

/** Tablas que la migración crea con certeza: `CREATE TABLE T (…)` de nivel superior, sin IF NOT EXISTS. */
function creadasDe(ts) {
  const set = new Set();
  for (const s of sentencias(ts)) {
    if (!esW(s[0], "create") || !esW(s[1], "table") || esW(s[2], "if")) continue;
    const t = leerTabla(s, 2);
    if (t && esP(s[t.fin], "(")) set.add(t.nombre);
  }
  return set;
}

/**
 * Tablas que la migración crea con certeza. Uno dentro de un DO o una función puede no ejecutarse
 * nunca (rama IF falsa), así que no cuenta; tampoco `IF NOT EXISTS` ni otro esquema.
 */
export function tablasCreadas(texto) {
  const r = tokenizar(texto);
  return r.error ? new Set() : creadasDe(r.tokens);
}

/** Columnas que la migración agrega con certeza (ADD COLUMN sin IF NOT EXISTS, a nivel superior). */
function agregadasDe(ts) {
  const mapa = new Map();
  for (const s of sentencias(ts)) {
    if (!esW(s[0], "alter") || !esW(s[1], "table")) continue;
    let i = 2;
    if (esW(s[i], "if") && esW(s[i + 1], "exists")) i += 2;
    if (esW(s[i], "only")) i++;
    const t = leerTabla(s, i);
    if (!t) continue;
    for (const [a] of partirComas(s, t.fin, s.length)) {
      if (!esW(s[a], "add")) continue;
      let j = a + 1;
      if (esW(s[j], "constraint", "primary", "unique", "check", "foreign", "exclude", "if")) continue;
      if (esW(s[j], "column")) j++;
      if (esW(s[j], "if")) continue;
      const col = identDe(s[j]);
      if (col === null) continue;
      if (!mapa.has(t.nombre)) mapa.set(t.nombre, new Set());
      mapa.get(t.nombre).add(col);
    }
  }
  return mapa;
}

/** Recorre los tokens, entrando a los cuerpos $tag$. */
function recorrer(ts, f) {
  ts.forEach((t, k) => {
    f(ts, k);
    if (t.k === "d") recorrer(t.dentro, f);
  });
}

// `ON UPDATE CASCADE`, `BEFORE UPDATE`, `INSERT OR UPDATE`, `FOR UPDATE`, `DO UPDATE` (otra regla)…
const ANTES_DE_UPDATE_NO_SENTENCIA = new Set(["on", "before", "after", "or", "for", "do", "of", "grant", "revoke", "instead"]);

/**
 * Cada `UPDATE T SET …` (también dentro de DO/funciones y CTE): si sólo escribe columnas que la
 * misma migración agrega (o T es nueva) es un backfill (aviso); si escribe una columna que ya
 * existía, PISA DATOS (bloqueo). Si no se puede leer, frena.
 */
function revisarUpdates(tokens, creadas, agregadas, hallazgo, bloqueos, avisos) {
  recorrer(tokens, (ts, k) => {
    const u = ts[k];
    if (!esW(u, "update")) return;
    const prev = ts[k - 1];
    if (esP(prev, ",") || (prev && prev.k === "w" && ANTES_DE_UPDATE_NO_SENTENCIA.has(prev.low))) return;
    const ilegible = () =>
      hallazgo(bloqueos, "UPDATE DE DATOS EXISTENTES", "no se pudo leer qué tabla o columnas escribe", u.pos, u.raw.length);
    let j = k + 1;
    if (esW(ts[j], "only")) j++;
    const t = leerTabla(ts, j);
    if (!t) return ilegible();
    j = t.fin;
    if (esP(ts[j], "*") || (ts[j] && ts[j].raw === "*")) j++;
    if (!esW(ts[j], "set")) {
      if (esW(ts[j], "as")) j++;
      if (identDe(ts[j]) !== null && !esW(ts[j], "set")) j++;
    }
    if (!esW(ts[j], "set")) return ilegible();
    j++;
    const items = [];
    let prof = 0;
    let desde = j;
    for (; j <= ts.length; j++) {
      const x = ts[j];
      if (!x) { items.push([desde, j]); break; }
      if (esP(x, "(") || esP(x, "[")) prof++;
      else if (esP(x, ")") || esP(x, "]")) { if (--prof < 0) { items.push([desde, j]); break; } }
      else if (prof === 0 && (esP(x, ";") || esW(x, "from", "where", "returning"))) { items.push([desde, j]); break; }
      else if (prof === 0 && esP(x, ",")) { items.push([desde, j]); desde = j + 1; }
    }
    const cols = [];
    let legible = items.length > 0;
    for (const [a, b] of items) {
      if (a >= b) { legible = false; continue; }
      if (esP(ts[a], "(")) {
        const c = cierre(ts, a);
        if (c < 0 || c >= b) { legible = false; continue; }
        for (const [x, y] of partirComas(ts, a + 1, c)) {
          const col = x < y ? identDe(ts[x]) : null;
          if (col === null) legible = false;
          else cols.push(col);
        }
      } else {
        const col = identDe(ts[a]);
        if (col === null) legible = false;
        else cols.push(col);
      }
    }
    const nuevas = agregadas.get(t.nombre) ?? new Set();
    const pisa = cols.filter((c) => !nuevas.has(c));
    const largo = ts[j - 1] ? ts[j - 1].pos + ts[j - 1].raw.length - u.pos : u.raw.length;
    if (creadas.has(t.nombre)) hallazgo(avisos, "UPDATE", "carga datos en una tabla nueva", u.pos, largo);
    else if (!legible || pisa.length)
      hallazgo(
        bloqueos,
        "UPDATE DE DATOS EXISTENTES",
        legible ? `escribe columnas que ya existían (${pisa.join(", ")}): pisa datos` : "no se pudo leer qué columnas escribe",
        u.pos,
        largo,
      );
    else hallazgo(avisos, "UPDATE", `backfill de columna(s) nueva(s): ${cols.join(", ")}`, u.pos, largo);
  });
}

// ── Lista permitida ─────────────────────────────────────────────────────────
// Además de las reglas de arriba (que dan el motivo concreto), cada sentencia de nivel superior
// tiene que ser de una forma conocida como aditiva. Lo que no está acá FRENA, aunque ninguna regla
// lo haya nombrado (LOCK, SELECT f(), INHERIT, ATTACH, CREATE FUNCTION, EVENT TRIGGER, otro
// esquema, …). Permitido:
//   CREATE TABLE T (…) · CREATE TYPE T AS ENUM ('…') · CREATE [UNIQUE] INDEX … ON T (…)
//   ALTER TABLE T ADD COLUMN (nullable o con DEFAULT) / ADD CONSTRAINT / ALTER COLUMN c SET DEFAULT
//     (no sobre tenantId) / ENABLE|FORCE RLS (sólo tabla nueva)
//   CREATE POLICY y CREATE TRIGGER sólo sobre tablas nuevas · INSERT sólo en tablas nuevas
//   UPDATE de backfill (lo juzga revisarUpdates) · DO con el idioma RLS reconocido y nada más
//   COMMENT ON …
// Y en todas: las funciones que se llaman tienen que ser de una lista corta de funciones del sistema
// (una función que ya existe en la base puede hacer cualquier cosa).

const LLAMADAS_OK = new Set([
  // tipos con modificador y palabras clave que van seguidas de "("
  "varchar", "character", "char", "decimal", "numeric", "timestamp", "timestamptz", "time", "timetz", "interval",
  "bit", "varbit", "varying", "float", "precision",
  "check", "unique", "key", "exists", "in", "any", "all", "some", "array", "include", "with", "as", "cast",
  "values", "and", "or", "not", "on", "using", "set", "default", "where", "then", "else", "when", "case",
  "between", "like", "ilike", "is", "null", "filter", "over", "by", "distinct", "row", "identity", "select",
  "btree", "gin", "gist", "hash", "brin", "spgist", "returning", "from", "join", "conflict",
  // funciones del sistema sin efectos
  "now", "gen_random_uuid", "uuid_generate_v4", "lower", "upper", "length", "char_length", "btrim", "trim",
  "ltrim", "rtrim", "substring", "substr", "concat", "replace", "split_part", "round", "floor", "ceil", "abs",
  "to_char", "date_trunc", "extract", "current_setting", "coalesce", "nullif", "greatest", "least", "count",
  "max", "min", "sum", "avg", "row_number", "string_agg", "array_agg", "jsonb_build_object", "json_build_object",
  "to_jsonb", "md5", "left", "right", "position", "lpad", "rpad", "array_length", "cardinality",
]);

/** Primera llamada a función no reconocida en ts[a, b) (o null). */
function llamadaDesconocida(ts, a, b) {
  for (let j = a; j < b; j++) {
    const t = ts[j];
    if (!(t.k === "w" || t.k === "q") || !esP(ts[j + 1], "(")) continue;
    if (esW(ts[j - 1], "references") || (esP(ts[j - 1], ".") && esW(ts[j - 3], "references"))) continue;
    const calificada = esP(ts[j - 1], ".");
    if (calificada && !esW(ts[j - 2], "pg_catalog")) return t;
    if (t.k === "w" && LLAMADAS_OK.has(t.low)) continue;
    return t;
  }
  return null;
}

const DECLARABLES = new Set(["text", "varchar", "name"]);
const PLPGSQL_OK = new Set(["begin", "end", "foreach", "in", "array", "loop"]);

/** Cuerpo de un DO (ya sin el idioma RLS): sólo DECLARE v text; BEGIN FOREACH … LOOP END LOOP; END. */
function cuerpoDoPermitido(ts) {
  const vars = new Set();
  let i = 0;
  if (esW(ts[0], "declare")) {
    i = 1;
    while (i < ts.length && !esW(ts[i], "begin")) {
      const v = ts[i].k === "w" ? ts[i].low : null;
      if (!v || !esW(ts[i + 1], ...DECLARABLES) || !esP(ts[i + 2], ";")) return false;
      vars.add(v);
      i += 3;
    }
  }
  if (!esW(ts[i], "begin")) return false;
  for (; i < ts.length; i++) {
    const t = ts[i];
    if (t.k === "w" && (PLPGSQL_OK.has(t.low) || vars.has(t.low))) continue;
    if (t.k === "s" && !t.unicode && t.raw[0] === "'") continue;
    if (t.k === "p" && "[],;".includes(t.raw)) continue;
    return false;
  }
  return true;
}

/**
 * ¿La sentencia `s` (tokens de nivel superior, sin el `;`) es de una forma permitida?
 * Los motivos concretos (NOT NULL sin default, función no reconocida) se agregan vía ctx.bloquear.
 */
function sentenciaPermitida(s, ctx) {
  const w = (k, ...v) => esW(s[k], ...v);
  const llamadas = (a, b) => {
    const t = llamadaDesconocida(s, a, b);
    if (t) ctx.bloquear("FUNCIÓN NO RECONOCIDA", `llama a \`${t.raw}\`: una función que ya existe en la base puede hacer cualquier cosa`, t);
  };
  if (w(0, "create") && w(1, "table")) {
    const i = w(2, "if") && w(3, "not") && w(4, "exists") ? 5 : 2;
    const t = leerTabla(s, i);
    if (!t || !esP(s[t.fin], "(") || cierre(s, t.fin) !== s.length - 1) return false;
    llamadas(t.fin, s.length);
    return true;
  }
  if (w(0, "create") && w(1, "type")) {
    const t = leerTabla(s, 2);
    if (!t || !esW(s[t.fin], "as") || !esW(s[t.fin + 1], "enum") || !esP(s[t.fin + 2], "(")) return false;
    const c = cierre(s, t.fin + 2);
    if (c !== s.length - 1) return false;
    return s.slice(t.fin + 3, c).every((x) => (x.k === "s" && !x.unicode && x.raw[0] === "'") || esP(x, ","));
  }
  if (w(0, "create") && (w(1, "index") || (w(1, "unique") && w(2, "index")))) {
    let i = w(1, "unique") ? 3 : 2;
    if (w(i, "concurrently")) i++;
    if (w(i, "if") && w(i + 1, "not") && w(i + 2, "exists")) i += 3;
    if (!w(i, "on")) {
      if (identDe(s[i]) === null) return false;
      i++;
    }
    if (!w(i, "on")) return false;
    i++;
    if (w(i, "only")) i++;
    const t = leerTabla(s, i);
    if (!t || s.slice(t.fin).some((x) => esW(x, "tablespace"))) return false;
    llamadas(t.fin, s.length);
    return true;
  }
  if (w(0, "alter") && w(1, "table")) {
    let i = 2;
    if (w(i, "if") && w(i + 1, "exists")) i += 2;
    if (w(i, "only")) i++;
    const t = leerTabla(s, i);
    if (!t || t.fin >= s.length) return false;
    const nueva = ctx.creadas.has(t.nombre);
    return partirComas(s, t.fin, s.length).every(([a, b]) => {
      if (a >= b) return false;
      if (w(a, "add")) {
        let j = a + 1;
        if (w(j, "constraint", "primary", "unique", "check", "foreign", "exclude")) {
          llamadas(j, b);
          return true;
        }
        if (w(j, "column")) j++;
        if (w(j, "if") && w(j + 1, "not") && w(j + 2, "exists")) j += 3;
        if (identDe(s[j]) === null) return false;
        const resto = s.slice(j + 1, b);
        const conDefault = resto.some((x) => esW(x, "default"));
        const obligatoria = resto.some((x, k) => (esW(x, "not") && esW(resto[k + 1], "null")) || esW(x, "primary"));
        if (!nueva && obligatoria && !conDefault)
          ctx.bloquear("NOT NULL SIN DEFAULT", "agrega una columna obligatoria sin valor por defecto a una tabla existente (falla si tiene filas)", s[a]);
        llamadas(j + 1, b);
        return true;
      }
      if (w(a, "enable", "force") && w(a + 1, "row") && w(a + 2, "level") && w(a + 3, "security") && b === a + 4) return nueva;
      if (w(a, "alter")) {
        let j = a + 1;
        if (w(j, "column")) j++;
        const col = identDe(s[j]);
        if (col === null || !w(j + 1, "set") || !w(j + 2, "default") || col.toLowerCase() === "tenantid") return false;
        if (!nueva) ctx.avisar("DEFAULT CAMBIADO", "cambia el valor por defecto de una columna existente", s[a]);
        llamadas(j + 3, b);
        return true;
      }
      return false;
    });
  }
  if (w(0, "create") && w(1, "policy")) {
    if (identDe(s[2]) === null || !w(3, "on")) return false;
    const t = leerTabla(s, 4);
    if (!t || !ctx.creadas.has(t.nombre)) return false;
    llamadas(t.fin, s.length);
    return true;
  }
  if (w(0, "create") && (w(1, "trigger") || (w(1, "constraint") && w(2, "trigger")))) {
    const on = s.findIndex((x, k) => k > 2 && esW(x, "on"));
    const t = on > 0 ? leerTabla(s, on + 1) : null;
    return !!t && ctx.creadas.has(t.nombre);
  }
  if (w(0, "insert") && w(1, "into")) {
    const t = leerTabla(s, 2);
    if (!t) return false;
    if (!ctx.creadas.has(t.nombre))
      ctx.bloquear("INSERT EN TABLA EXISTENTE", "inserta filas en una tabla en uso (usuarios, permisos o datos de un negocio)", s[0]);
    llamadas(t.fin, s.length);
    return true;
  }
  if (w(0, "update")) {
    llamadas(1, s.length);
    return true; // qué columnas pisa lo decide revisarUpdates (si no lo puede leer, frena)
  }
  if (w(0, "comment") && w(1, "on")) return !s.some((x) => x.k === "d") && llamadaDesconocida(s, 2, s.length) === null;
  if (w(0, "do")) {
    let j = 1;
    if (w(j, "language") && w(j + 1, "plpgsql")) j += 2;
    const d = s[j];
    if (!d || d.k !== "d") return false;
    j++;
    if (w(j, "language") && w(j + 1, "plpgsql")) j += 2;
    return j === s.length && cuerpoDoPermitido(d.dentro);
  }
  return false;
}

/** @typedef {{ regla: string, motivo: string, linea: number, fragmento: string }} Hallazgo */

const MOTIVO_NO_PERMITIDA =
  "no es una de las formas aditivas que se publican solas (crear tabla/tipo/índice, agregar columna o restricción, RLS por tenant en tabla nueva)";

/**
 * Analiza el SQL de UNA migración.
 * @returns {{ bloqueos: Hallazgo[], avisos: Hallazgo[], rlsNuevas: string[] }}
 *   Hallazgo = { regla, motivo, linea, fragmento }
 */
export function analizarSql(sql) {
  const bloqueos = [];
  const avisos = [];
  const ilegible = (error) => {
    bloqueos.push({ regla: "ILEGIBLE", motivo: `no se pudo leer el SQL: ${error}`, linea: 0, fragmento: "" });
    return { bloqueos, avisos, rlsNuevas: [] };
  };
  // Texto canónico: un separador entre tokens, sin comentarios, mismas líneas.
  const can = canonizar(sql);
  if (can.error) return ilegible(can.error);
  let texto = can.texto;
  const creadas = tablasCreadas(texto);

  // Neutraliza el idioma RLS reconocido (se pisa con espacios, mismo largo).
  const rls = idiomaRls(texto, creadas);
  const rlsNuevas = new Set();
  for (const r of rls.sort((a, b) => b.desde - a.desde)) {
    texto = texto.slice(0, r.desde) + texto.slice(r.desde, r.hasta).replace(/[^\n]/g, " ") + texto.slice(r.hasta);
    for (const t of r.tablas) rlsNuevas.add(t);
  }
  const tk = tokenizar(texto);
  if (tk.error) return ilegible(tk.error);

  const hallazgo = (lista, regla, motivo, idx, largo) =>
    lista.push({
      regla,
      motivo,
      linea: linea(texto, idx),
      fragmento: texto.slice(idx, idx + Math.max(largo, 60)).replace(/\s+/g, " ").replace(/`/g, "'").replace(/@/g, "@​").trim(),
      _pos: idx,
    });

  for (const r of BLOQUEOS) for (const m of texto.matchAll(r.re)) hallazgo(bloqueos, r.regla, r.motivo, m.index, m[0].length);
  for (const r of AVISOS) for (const m of texto.matchAll(r.re)) hallazgo(avisos, r.regla, r.motivo, m.index, m[0].length);

  // Prender RLS o crear políticas sobre una tabla que YA existe: es Gate 2 del dueño (con RLS y
  // sin política, el rol de la app deja de ver la tabla; una política permisiva nueva la abre).
  const reRls = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${T_DIN}\s+(?:ENABLE|FORCE)\s+ROW\s+LEVEL\s+SECURITY\b`, "gi");
  for (const m of texto.matchAll(reRls)) {
    const t = tablaDe(m[1]);
    if (t === null || t === "%I" || !creadas.has(t))
      hallazgo(bloqueos, "RLS EN TABLA EXISTENTE", "prende RLS sobre una tabla que no crea esta migración (Gate 2 del dueño)", m.index, m[0].length);
  }
  const rePol = new RegExp(String.raw`\bCREATE\s+POLICY\s+${RE_IDENT}\s+ON\s+${T_DIN}`, "gi");
  for (const m of texto.matchAll(rePol)) {
    const t = tablaDe(m[1]);
    if (t === null || t === "%I" || !creadas.has(t))
      hallazgo(bloqueos, "POLÍTICA EN TABLA EXISTENTE", "agrega una política de acceso a una tabla que no crea esta migración", m.index, m[0].length);
    else
      hallazgo(avisos, "POLÍTICA DISTINTA", "política sobre tabla nueva que no es la de aislamiento por tenant (revisar que no abra datos)", m.index, m[0].length);
  }
  // Restricciones, índices únicos y triggers sobre tablas existentes: aditivos, pero pueden fallar
  // con los datos de producción (y el build frena a mitad) o cambiar qué escrituras se aceptan.
  const reCons = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${RE_TABLA}\s+ADD\s+CONSTRAINT\b`, "gi");
  for (const m of texto.matchAll(reCons))
    if (!creadas.has(normalizarIdent(m[1])))
      hallazgo(avisos, "RESTRICCIÓN EN TABLA EXISTENTE", "puede fallar con datos existentes o rechazar escrituras", m.index, m[0].length);
  const reUniq = new RegExp(String.raw`\bCREATE\s+UNIQUE\s+INDEX\s+(?:CONCURRENTLY\s+)?(?:IF\s+NOT\s+EXISTS\s+)?(?:${RE_IDENT}\s+)?ON\s+(?:ONLY\s+)?${RE_TABLA}`, "gi");
  for (const m of texto.matchAll(reUniq))
    if (!creadas.has(normalizarIdent(m[1])))
      hallazgo(avisos, "ÚNICO EN TABLA EXISTENTE", "falla si hoy hay duplicados", m.index, m[0].length);
  const reTrig = new RegExp(String.raw`\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b[^;]*?\bON\s+${RE_TABLA}`, "gi");
  for (const m of texto.matchAll(reTrig))
    if (!creadas.has(normalizarIdent(m[1])))
      hallazgo(bloqueos, "TRIGGER EN TABLA EXISTENTE", "cambia qué pasa al escribir en una tabla en uso (puede descartar o reescribir filas)", m.index, m[0].length);

  revisarUpdates(tk.tokens, creadas, agregadasDe(tk.tokens), hallazgo, bloqueos, avisos);

  // Lista permitida: cada sentencia de nivel superior tiene que ser de una forma aditiva conocida.
  // Si no lo es y ninguna regla dio ya un motivo concreto para esa sentencia, frena igual.
  const ctx = {
    creadas,
    bloquear: (regla, motivo, t) => hallazgo(bloqueos, regla, motivo, t.pos, t.raw.length),
    avisar: (regla, motivo, t) => hallazgo(avisos, regla, motivo, t.pos, t.raw.length),
  };
  for (const s of sentencias(tk.tokens)) {
    if (sentenciaPermitida(s, ctx)) continue;
    const desde = s[0].pos;
    const ultimo = s[s.length - 1];
    const hasta = ultimo.pos + ultimo.raw.length;
    if (!bloqueos.some((b) => b._pos >= desde && b._pos < hasta))
      hallazgo(bloqueos, "SENTENCIA NO PERMITIDA", MOTIVO_NO_PERMITIDA, desde, Math.min(hasta - desde, 80));
  }

  const limpiar = (l) =>
    l.sort((a, b) => a.linea - b.linea || a._pos - b._pos).map(({ _pos, ...h }) => h);
  return { bloqueos: limpiar(bloqueos), avisos: limpiar(avisos), rlsNuevas: [...rlsNuevas] };
}
