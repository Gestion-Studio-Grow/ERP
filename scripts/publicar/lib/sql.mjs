// ============================================================================
// ¿Esta migración es ADITIVA? — el detector que frena la publicación automática.
// ============================================================================
//
// Regla del dueño (Factory-GSG CLAUDE.md, «la orquestadora gestiona las cuentas»): se publica
// sola sólo una migración aditiva. Lo demás es owner-level: el workflow FRENA con
// «REQUIERE REVISIÓN DEL DUEÑO» y el dueño decide.
//
// CRITERIO: FALLA CERRADA ESTRICTA. No se busca «lo peligroso»: se reconoce, sentencia por
// sentencia, una gramática corta de formas aditivas. Cualquier sentencia que no calce entera, frena.
//   · CREATE TABLE T (…) de una tabla nueva (columnas, PK/UNIQUE/FK/CHECK; defaults constantes).
//   · ALTER TABLE T ADD [COLUMN] c tipo [NULL | NOT NULL] [DEFAULT constante] — NOT NULL sólo con
//     DEFAULT si la tabla ya existe; REFERENCES/UNIQUE/CHECK en línea, sólo sobre tablas nuevas.
//   · CREATE [UNIQUE] INDEX [CONCURRENTLY] [IF NOT EXISTS] … ON T [USING método] ("col" [ASC|DESC]
//     [NULLS FIRST|LAST], …) [INCLUDE (…)] [WHERE predicado simple]. Sin expresiones. UNIQUE sólo
//     sobre tablas nuevas.
//   · ALTER TABLE T ADD [CONSTRAINT c] FOREIGN KEY / UNIQUE / PRIMARY KEY / CHECK — sólo si T la crea
//     esta misma migración (más arriba).
//   · CREATE TYPE T AS ENUM ('…') · ALTER TYPE T ADD VALUE [IF NOT EXISTS] '…' [BEFORE|AFTER '…'].
//   · RLS sobre tablas nuevas: ALTER TABLE T ENABLE|FORCE ROW LEVEL SECURITY;
//     DROP POLICY IF EXISTS p ON T (no-op: la tabla es nueva); CREATE POLICY p ON T
//     USING ("tenantId" = current_setting('app.current_tenant_id', true)) [WITH CHECK (lo mismo)].
//   · Constante = literal ('…', número, true/false/null), CURRENT_TIMESTAMP, now(),
//     gen_random_uuid(), ARRAY[…] de constantes, con casts `::tipo`. Ninguna otra función.
// Todo lo demás frena: INSERT/UPDATE/DELETE/COPY/MERGE, DO, triggers, reglas, funciones, vistas,
// COMMENT, SET, GRANT, SET DEFAULT, CHECK/FK/UNIQUE sobre tablas existentes, etc.
//
// CÓMO LEE EL SQL. No es un parser de Postgres: es un lector conservador. Se tokeniza (comentarios
// `--` y `/* */` anidados, strings '…' / E'…', "identificadores", cuerpos $tag$…$tag$) y se parte
// por `;` de nivel superior. Si algo no se puede leer (un string o comentario sin cerrar), frena.

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


// ── Motivos concretos ───────────────────────────────────────────────────────
// Sólo dan el NOMBRE del problema en el comentario del PR. NO deciden qué pasa: decide la gramática
// de `sentenciaPermitida` (falla cerrada). Corren sobre el texto canónico de cada sentencia que NO
// es una forma permitida (incluido lo que hay dentro de strings y cuerpos $$: `EXECUTE 'DROP …'`).
const REGLAS = [
  ...BLOQUEOS,
  { regla: "ESCRIBE DATOS", re: /\bINSERT\s+INTO\b|(?<!\b(?:ON|BEFORE|AFTER|OR|FOR|DO|OF|INSTEAD|GRANT|REVOKE)\s)\bUPDATE\s+(?:ONLY\s+)?(?:"|[A-Za-z_])(?!\w*\s+(?:CASCADE|RESTRICT|NO|SET)\b)/gi, motivo: "escribe datos" },
  { regla: "TRIGGER", re: /\bCREATE\s+(?:CONSTRAINT\s+)?TRIGGER\b/gi, motivo: "un trigger corre código en cada escritura (aunque la tabla sea nueva)" },
  { regla: "EXTENSIÓN", re: /\bCREATE\s+EXTENSION\b/gi, motivo: "instala una extensión de Postgres" },
  { regla: "SECURITY DEFINER", re: /\bSECURITY\s+DEFINER\b/gi, motivo: "función que corre con permisos del dueño" },
  { regla: "OWNER TO", re: /\bOWNER\s+TO\b/gi, motivo: "cambia el dueño de un objeto" },
];

const REVISION = "REQUIERE REVISIÓN DEL DUEÑO";

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

/**
 * Tablas que la migración crea con certeza: `CREATE TABLE T (…)` de nivel superior, sin IF NOT
 * EXISTS y en el esquema public. Uno dentro de un DO o una función puede no ejecutarse nunca.
 */
export function tablasCreadas(texto) {
  const r = tokenizar(texto);
  const set = new Set();
  if (r.error) return set;
  for (const s of sentencias(r.tokens)) {
    if (!esW(s[0], "create") || !esW(s[1], "table")) continue;
    const t = leerTabla(s, 2);
    if (t && esP(s[t.fin], "(")) set.add(t.nombre);
  }
  return set;
}

// ── Gramática permitida ─────────────────────────────────────────────────────
// Únicas funciones que se pueden llamar: las de default. Una función que ya existe en la base
// (o un operador que la envuelve) puede hacer cualquier cosa.
const FUNCIONES_OK = new Set(["now", "gen_random_uuid"]);
// Operadores de comparación/aritmética de los tipos del sistema (CHECK y WHERE de índice parcial).
const OPERADORES_OK = new Set(["=", "<>", "!=", "<", ">", "<=", ">=", "+", "-", "*", "/", "%", "||", "~", "~*", "!~", "!~*"]);
// Palabras que pueden aparecer en un CHECK o un WHERE de índice (las columnas van "entre comillas").
const PALABRAS_EXPR = new Set(["and", "or", "not", "is", "null", "true", "false", "in", "between", "like", "ilike", "distinct", "from", "current_timestamp"]);
// Palabras que siguen al nombre base de un tipo (DOUBLE PRECISION, TIMESTAMP(3) WITH TIME ZONE…).
const PALABRAS_TIPO = new Set(["precision", "varying", "with", "without", "time", "zone"]);
// Tipos con los que una columna agregada nullable y sin DEFAULT queda en NULL en todas las filas que
// ya existen (lista blanca; serial*, identity, dominios, arrays, etc. se rellenan o no se sabe → no vacía).
const TIPO_VACIO = /^(?:text|uuid|jsonb|integer|int|int4|bigint|int8|boolean|bool|timestamptz|(?:varchar|character varying) \( N \)|(?:numeric|decimal)(?: \( N(?: , N)? \))?|timestamp(?: \( N \))?(?: (?:with|without) time zone)?)$/;
const SERIALES = new Set(["serial", "serial2", "serial4", "serial8", "smallserial", "bigserial"]);
const PRED_TENANT = ['"tenantId"', "=", "current_setting", "(", "'app.current_tenant_id'", ",", "true", ")"];

// ── Molde RLS de los módulos (bloque DO) ────────────────────────────────────
// Plantilla literal de las migraciones históricas (lanzamiento_base, modulo_taller, modulo_inmobiliaria,
// modulo_padel_clases, modulo_proyectos, profeturnos_clubes_serie_grupal; lead_campania en su forma de
// una sola tabla). Se compara token a token (sólo cambian espacios y comentarios): cualquier otra
// diferencia en el cuerpo frena. `__tablas__` = lista literal de 'Nombres' creados más arriba en la
// misma migración; `__T__` = el nombre de UNA tabla creada más arriba (el mismo en las tres sentencias).
const MOLDE_RLS_LOOP = `
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[ __tablas__ ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', t);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I '
      || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
      || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))',
      t
    );
  END LOOP;
END`;
const MOLDE_RLS_UNA = `
BEGIN
  EXECUTE 'ALTER TABLE "__T__" ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS tenant_isolation ON "__T__"';
  EXECUTE 'CREATE POLICY tenant_isolation ON "__T__" '
       || 'USING ("tenantId" = current_setting(''app.current_tenant_id'', true)) '
       || 'WITH CHECK ("tenantId" = current_setting(''app.current_tenant_id'', true))';
END`;
const MOLDES_RLS = [MOLDE_RLS_LOOP, MOLDE_RLS_UNA].map((m) => tokenizar(m).tokens);
const NOMBRE_SIMPLE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Cuerpo de un DO contra los moldes RLS. Devuelve las tablas (todas creadas más arriba) o null si
 * el cuerpo no es EXACTAMENTE uno de los moldes; `ajenas` junta nombres que no crea la migración.
 */
function moldeRls(cuerpo, creadas, ajenas) {
  for (const molde of MOLDES_RLS) {
    const tablas = [];
    let una = null;
    let j = 0;
    let ok = true;
    const nombre = (n) => {
      if (!NOMBRE_SIMPLE.test(n)) return false;
      if (!creadas.has(n)) ajenas.push(n);
      tablas.push(n);
      return true;
    };
    for (const m of molde) {
      const t = cuerpo[j];
      if (m.k === "w" && m.low === "__tablas__") {
        // 'A', 'B', … (al menos una; strings simples, sin prefijo ni escapes)
        do {
          const x = cuerpo[j];
          if (!x || x.k !== "s" || x.unicode || !/^'[^']*'$/.test(x.raw) || !nombre(x.raw.slice(1, -1))) { ok = false; break; }
          j++;
        } while (esP(cuerpo[j], ",") && j++);
        if (!ok) break;
        continue;
      }
      if (!t || t.k !== m.k || t.unicode) { ok = false; break; }
      if (m.k === "s" && m.raw.includes('"__T__"')) {
        const [antes, despues] = m.raw.split('"__T__"');
        const n = t.raw.startsWith(antes + '"') && t.raw.endsWith('"' + despues) ? t.raw.slice(antes.length + 1, t.raw.length - despues.length - 1) : null;
        if (n === null || (una !== null && n !== una) || (una === null && !nombre(n))) { ok = false; break; }
        una = n;
      } else if ((m.k === "w" ? t.low !== m.low : t.raw !== m.raw)) { ok = false; break; }
      j++;
    }
    if (ok && j === cuerpo.length) return tablas;
    ajenas.length = 0;
  }
  return null;
}

class NoPermitida extends Error {
  /** @param {string} regla @param {string} motivo @param {any} [tok] */
  constructor(regla, motivo, tok) {
    super(motivo);
    this.regla = regla;
    this.tok = tok;
  }
}
const GENERICA = "no es una de las formas aditivas que se publican solas";

/**
 * Lee la sentencia `s` (tokens de nivel superior, sin `;`) contra la gramática permitida.
 * Devuelve { rls: tabla | null } si calza entera; si no, tira NoPermitida (con el motivo concreto
 * si lo hay). `creadas` = tablas creadas por sentencias ANTERIORES de la misma migración;
 * `colsNuevas` = tabla existente → columnas que esta migración le agregó nullable y sin DEFAULT
 * (en las filas que ya existen valen NULL: una FK que las incluye no las toca); `enums` = tipos
 * enum creados por sentencias anteriores de la misma migración.
 */
function sentenciaPermitida(s, creadas, colsNuevas = new Map(), enums = new Set()) {
  let i = 0;
  const cur = () => s[i];
  const no = (motivo = GENERICA, regla = REVISION) => { throw new NoPermitida(regla, motivo, s[i] ?? s[s.length - 1]); };
  const veoW = (...v) => esW(s[i], ...v);
  const comeW = (...v) => (esW(s[i], ...v) ? (i++, true) : false);
  const pideW = (...v) => { if (!comeW(...v)) no(); };
  const comeP = (v) => (esP(s[i], v) ? (i++, true) : false);
  const pideP = (v) => { if (!comeP(v)) no(); };
  const fin = () => { if (i !== s.length) no(); };
  const ident = () => {
    const n = identDe(s[i]);
    if (n === null) no();
    i++;
    return n;
  };
  const tabla = () => {
    const t = leerTabla(s, i);
    if (!t) no("tabla de otro esquema o nombre ilegible");
    i = t.fin;
    return t.nombre;
  };
  const numero = () => { if (!s[i] || s[i].k !== "n") no(); i++; };
  const columnas = () => {
    pideP("(");
    do ident(); while (comeP(","));
    pideP(")");
  };
  const llamada = (t) => {
    if (t && (t.k === "w" || t.k === "q") && esP(s[i + 1], "("))
      no(`llama a \`${t.raw}\`: sólo se permiten now(), gen_random_uuid() y CURRENT_TIMESTAMP`, "FUNCIÓN NO RECONOCIDA");
  };
  /** Lee un tipo; devuelve true si está en la lista blanca de «columna agregada vacía». */
  const tipo = () => {
    if (s[i]?.k !== "w" && !(s[i]?.k === "q" && !s[i].unicode)) no();
    const desde = i;
    i++;
    if (comeP(".")) ident();
    const mods = () => { if (comeP("(")) { numero(); while (comeP(",")) numero(); pideP(")"); } };
    mods();
    while (veoW(...PALABRAS_TIPO)) { i++; mods(); }
    while (comeP("[")) { if (s[i]?.k === "n") i++; pideP("]"); }
    // Postgres trata `serial`/"serial"… sin esquema como serial aunque haya un tipo con ese nombre.
    if (i === desde + 1 && SERIALES.has(identDe(s[desde]) ?? "")) return false;
    if (i === desde + 1 && s[desde].k === "q") return enums.has(identDe(s[desde]));
    if (s.slice(desde, i).some((t) => t.unicode || (t.k !== "w" && t.k !== "n" && t.k !== "p"))) return false;
    return TIPO_VACIO.test(s.slice(desde, i).map((t) => (t.k === "w" ? t.low : t.k === "n" ? "N" : t.raw)).join(" "))
      || (i === desde + 1 && enums.has(s[desde].low));
  };
  const constante = () => {
    if (comeP("(")) { constante(); pideP(")"); }
    else {
      if (s[i]?.k === "o" && (s[i].raw === "-" || s[i].raw === "+") && s[i + 1]?.k === "n") i++;
      const t = s[i];
      if (t && t.k === "s" && !t.unicode) i++;
      else if (t && t.k === "n") i++;
      else if (esW(t, "true", "false", "null")) i++;
      else if (esW(t, "current_timestamp")) { i++; if (comeP("(")) { numero(); pideP(")"); } }
      else if (t && t.k === "w" && FUNCIONES_OK.has(t.low) && esP(s[i + 1], "(") && esP(s[i + 2], ")")) i += 3;
      else if (esW(t, "array") && esP(s[i + 1], "[")) {
        i += 2;
        if (!comeP("]")) { do constante(); while (comeP(",")); pideP("]"); }
      } else {
        llamada(t);
        no("el DEFAULT no es una constante");
      }
    }
    while (comeP("::")) tipo();
  };
  /** CHECK (…) / WHERE: columnas "entre comillas", literales, operadores del sistema; sin funciones. */
  const expresion = (hasta) => {
    for (; i < hasta; i++) {
      const t = s[i];
      if (t.k === "q" && !t.unicode) { llamada(t); continue; }
      const agrupa = t.k === "w" && ["in", "and", "or", "not"].includes(t.low); // `IN (…)`, `AND (…)`
      if (t.k === "w" && PALABRAS_EXPR.has(t.low) && (agrupa || !esP(s[i + 1], "("))) continue;
      if (t.k === "w" && FUNCIONES_OK.has(t.low) && esP(s[i + 1], "(") && esP(s[i + 2], ")")) { i += 2; continue; }
      if (t.k === "w") { llamada(t); no(`\`${t.raw}\` no es una columna "entre comillas" ni una palabra permitida en una condición`); }
      if (t.k === "s" && !t.unicode) continue;
      if (t.k === "n") continue;
      if (t.k === "p" && ["(", ")", ","].includes(t.raw)) continue;
      if (t.k === "p" && t.raw === "::") { i++; tipo(); i--; continue; }
      if (t.k === "o" && OPERADORES_OK.has(t.raw)) continue;
      no(`\`${t.raw}\` no está permitido en una condición`);
    }
  };
  const parentesis = () => {
    if (!esP(s[i], "(")) no();
    let prof = 0;
    for (let j = i; j < s.length; j++) {
      if (esP(s[j], "(") || esP(s[j], "[")) prof++;
      else if (esP(s[j], ")") || esP(s[j], "]")) if (--prof === 0) return j;
    }
    return no();
  };
  const chequeo = () => {
    const c = parentesis();
    i++;
    expresion(c);
    i = c + 1;
  };
  const diferible = () => {
    for (;;) {
      if (comeW("deferrable")) continue;
      if (veoW("not") && esW(s[i + 1], "deferrable")) { i += 2; continue; }
      if (comeW("initially")) { pideW("deferred", "immediate"); continue; }
      return;
    }
  };
  const referencias = () => {
    tabla();
    if (esP(s[i], "(")) columnas();
    if (comeW("match")) pideW("full", "simple");
    while (comeW("on")) {
      pideW("delete", "update");
      if (comeW("cascade", "restrict")) continue;
      if (comeW("no")) { pideW("action"); continue; }
      pideW("set");
      pideW("null", "default");
      if (esP(s[i], "(")) columnas();
    }
    diferible();
  };
  // Restricción de tabla (sólo tablas nuevas): PK / UNIQUE / FK / CHECK.
  const restriccion = () => {
    if (comeW("constraint")) ident();
    if (comeW("primary")) { pideW("key"); columnas(); diferible(); }
    else if (comeW("unique")) {
      if (comeW("nulls")) { comeW("not"); pideW("distinct"); }
      columnas();
      diferible();
    } else if (comeW("foreign")) { pideW("key"); columnas(); pideW("references"); referencias(); }
    else if (comeW("check")) chequeo();
    else no();
  };
  // Restricción sobre una TABLA EXISTENTE: sólo las dos que no mueven ni exponen datos, y siempre
  // incluyendo al menos una columna agregada vacía por esta migración (nullable, sin DEFAULT, tipo de
  // la lista blanca TIPO_VACIO): en las filas que ya existen vale NULL, así que ni la FK (MATCH SIMPLE)
  // las toca ni el UNIQUE puede chocar con duplicados existentes.
  //   ADD CONSTRAINT n FOREIGN KEY (cols) REFERENCES t (cols) [ON DELETE RESTRICT|NO ACTION|SET NULL*] [ON UPDATE RESTRICT|NO ACTION|CASCADE] [NOT VALID]
  //     * ON DELETE SET NULL sólo si TODAS las columnas de la FK son agregadas vacías por esta migración:
  //       sólo anula esa columna nueva en la fila que referencia (no borra filas ni pisa datos previos).
  //       Si la FK incluye una columna existente, SET NULL anularía un dato previo → revisión del dueño.
  //     (ON DELETE CASCADE / SET DEFAULT sobre una tabla con datos → revisión del dueño)
  //   ADD CONSTRAINT n UNIQUE (cols)
  const propiasNuevas = (t, desde, todas = false) => {
    const propias = [];
    for (let j = desde + 1; j < i - 1; j += 2) propias.push(identDe(s[j]));
    return propias[todas ? "every" : "some"]((c) => colsNuevas.get(t)?.has(c));
  };
  const restriccionExistente = (t) => {
    const existente = (m) => no(m, "RESTRICCIÓN EN TABLA EXISTENTE");
    if (!comeW("constraint")) existente("restricción sin nombre sobre una tabla que no crea esta migración");
    ident();
    if (comeW("unique")) {
      const desde = i;
      columnas();
      if (!propiasNuevas(t, desde))
        no("UNIQUE sobre columnas que ya tienen datos: rompe el deploy si hay duplicados y cruza tenants", "ÚNICO EN TABLA EXISTENTE");
      return;
    }
    if (!comeW("foreign")) existente("restricción sobre una tabla que no crea esta migración: sólo se publican solas FOREIGN KEY y UNIQUE");
    pideW("key");
    const desde = i;
    columnas();
    if (!propiasNuevas(t, desde))
      existente("FK sobre columnas que ya tienen datos: puede rechazar escrituras o borrar en cascada filas existentes");
    const todasNuevas = propiasNuevas(t, desde, true);
    pideW("references");
    tabla();
    columnas();
    while (comeW("on")) {
      // ON UPDATE CASCADE (el default de Prisma) sólo reescribe la clave en filas que ya apuntan al
      // padre, y las existentes tienen NULL en la columna nueva; ON DELETE sólo RESTRICT / NO ACTION.
      const borrado = comeW("delete");
      if (!borrado) pideW("update");
      if (comeW("restrict")) continue;
      if (comeW("no")) { pideW("action"); continue; }
      if (!borrado && comeW("cascade")) continue;
      // ON DELETE SET NULL sin lista de columnas: sólo si todas las de la FK son nuevas y vacías.
      if (borrado && todasNuevas && veoW("set") && esW(s[i + 1], "null") && !esP(s[i + 2], "(")) { i += 2; continue; }
      if (veoW("cascade", "set"))
        existente(todasNuevas
          ? "FK con ON DELETE CASCADE / SET DEFAULT sobre una tabla que ya tiene datos"
          : "FK con ON DELETE CASCADE / SET NULL / SET DEFAULT que incluye columnas con datos previos");
      no();
    }
    if (comeW("not")) pideW("valid");
  };
  const columna = (nueva) => {
    const nombreCol = ident();
    const tipoVacio = tipo();
    let conDefault = false;
    let obligatoria = false;
    while (i < s.length) {
      if (comeW("constraint")) ident();
      if (veoW("not") && esW(s[i + 1], "null")) { i += 2; obligatoria = true; }
      else if (comeW("null")) { /* nullable */ }
      else if (comeW("default")) { constante(); conDefault = true; }
      else if (!nueva)
        no("restricción, clave o columna generada en una columna nueva de una tabla existente", "RESTRICCIÓN EN TABLA EXISTENTE");
      else if (comeW("primary")) pideW("key");
      else if (comeW("unique")) { /* tabla nueva */ }
      else if (comeW("references")) referencias();
      else if (comeW("check")) chequeo();
      else no();
    }
    if (!nueva && obligatoria && !conDefault)
      no("agrega una columna obligatoria sin valor por defecto a una tabla existente (falla si tiene filas)", "NOT NULL SIN DEFAULT");
    return { nombre: nombreCol, vacia: tipoVacio && !obligatoria && !conDefault };
  };
  /** Corre `f` sobre el tramo s[a, b) como si fuera la sentencia entera. */
  const tramo = (a, b, f) => {
    const s0 = s;
    s = s0.slice(0, b);
    i = a;
    try { f(); fin(); } finally { s = s0; }
  };

  // ── formas de nivel superior ──
  if (comeW("create")) {
    if (comeW("table")) {
      if (veoW("if")) no("CREATE TABLE IF NOT EXISTS: la tabla puede existir");
      const t = tabla();
      const c = parentesis();
      if (c !== s.length - 1) no("CREATE TABLE con opciones después de las columnas");
      if (creadas.has(t)) no();
      for (const [a, b] of partirComas(s, i + 1, c)) {
        if (a >= b) no();
        tramo(a, b, () => (esW(s[a], "constraint", "primary", "unique", "foreign", "check") ? restriccion() : columna(true)));
      }
      return { crea: t };
    }
    if (comeW("type")) {
      const e = ident();
      pideW("as");
      pideW("enum");
      pideP("(");
      if (!comeP(")")) {
        do { if (s[i]?.k !== "s" || s[i].unicode) no(); i++; } while (comeP(","));
        pideP(")");
      }
      fin();
      return { enum: e };
    }
    if (veoW("unique", "index")) {
      const unico = comeW("unique");
      pideW("index");
      comeW("concurrently");
      if (comeW("if")) { pideW("not"); pideW("exists"); }
      if (!veoW("on")) ident();
      pideW("on");
      comeW("only");
      const t = tabla();
      const existente = !creadas.has(t);
      if (comeW("using")) pideW("btree", "hash", "gin", "gist", "brin", "spgist");
      pideP("(");
      let conNueva = false;
      do {
        if (s[i]?.k !== "q" || s[i].unicode) {
          llamada(s[i]);
          no("el índice sólo puede listar columnas \"entre comillas\" (sin expresiones ni clases de operadores)");
        }
        if (colsNuevas.get(t)?.has(identDe(s[i]))) conNueva = true;
        i++;
        comeW("asc", "desc");
        if (comeW("nulls")) pideW("first", "last");
      } while (comeP(","));
      pideP(")");
      if (unico && existente && !conNueva)
        no("índice único sobre columnas que ya tienen datos: rompe el deploy si hay duplicados y cruza tenants", "ÚNICO EN TABLA EXISTENTE");
      if (comeW("include")) columnas();
      if (comeW("nulls")) {
        if (unico && existente) no("NULLS NOT DISTINCT en un índice único sobre una tabla que ya existe", "ÚNICO EN TABLA EXISTENTE");
        comeW("not");
        pideW("distinct");
      }
      if (comeW("where")) expresion(s.length);
      fin();
      return {};
    }
    if (comeW("policy")) {
      ident();
      pideW("on");
      const t = tabla();
      if (!creadas.has(t)) no("agrega una política de acceso a una tabla que no crea esta migración", "POLÍTICA EN TABLA EXISTENTE");
      if (comeW("as")) pideW("permissive");
      if (comeW("for")) pideW("all");
      const predicado = () => {
        let abiertos = 0;
        while (comeP("(")) abiertos++;
        if (!abiertos) no();
        const politica = () => no("la política no es la de aislamiento por tenant (\"tenantId\" = current_setting('app.current_tenant_id', true))", "POLÍTICA DISTINTA");
        for (const raw of PRED_TENANT) {
          if (!s[i] || (s[i].k === "w" ? s[i].low : s[i].raw) !== raw || s[i].unicode) politica();
          i++;
        }
        if (comeP("::")) pideW("text");
        for (; abiertos > 0; abiertos--) if (!comeP(")")) politica();
      };
      pideW("using");
      predicado();
      if (comeW("with")) { pideW("check"); predicado(); }
      fin();
      return { rls: t };
    }
    if (veoW("trigger") || (veoW("constraint") && esW(s[i + 1], "trigger")))
      no("un trigger corre código en cada escritura (aunque la tabla sea nueva)", "TRIGGER");
    if (veoW("rule") || (veoW("or") && esW(s[i + 1], "replace")))
      no(veoW("rule") ? "una regla puede reescribir o descartar escrituras" : "reemplaza una función/vista que puede existir", veoW("rule") ? "RULE" : "CREATE OR REPLACE");
    no();
  }
  if (comeW("alter")) {
    if (comeW("type")) {
      ident();
      pideW("add");
      pideW("value");
      if (comeW("if")) { pideW("not"); pideW("exists"); }
      if (s[i]?.k !== "s" || s[i].unicode) no();
      i++;
      if (comeW("before", "after")) { if (s[i]?.k !== "s" || s[i].unicode) no(); i++; }
      fin();
      return {};
    }
    pideW("table");
    comeW("only");
    const t = tabla();
    const nueva = creadas.has(t);
    if (i >= s.length) no();
    for (const [a, b] of partirComas(s, i, s.length)) {
      if (a >= b) no();
      tramo(a, b, () => {
        if (comeW("add")) {
          if (veoW("constraint", "primary", "unique", "foreign", "check", "exclude")) {
            if (nueva) { restriccion(); return; }
            restriccionExistente(t);
            return;
          }
          comeW("column");
          const siNoExiste = comeW("if") && (pideW("not"), pideW("exists"), true);
          const c = columna(nueva);
          // Con IF NOT EXISTS la columna puede existir ya (con datos): no cuenta como vacía.
          if (!nueva && c.vacia && !siNoExiste) {
            if (!colsNuevas.has(t)) colsNuevas.set(t, new Set());
            colsNuevas.get(t).add(c.nombre);
          }
          return;
        }
        if (veoW("enable", "force") && esW(s[i + 1], "row")) {
          if (!nueva) no("prende RLS sobre una tabla que no crea esta migración (Gate 2 del dueño)", "RLS EN TABLA EXISTENTE");
          i++;
          pideW("row");
          pideW("level");
          pideW("security");
          return;
        }
        if (comeW("alter")) {
          comeW("column");
          ident();
          if (veoW("set") && esW(s[i + 1], "default")) no("cambia el valor por defecto de una columna existente", "DEFAULT CAMBIADO");
        }
        no();
      });
    }
    return {};
  }
  if (comeW("drop")) {
    // Sólo el no-op del molde RLS: DROP POLICY IF EXISTS p ON <tabla creada más arriba>.
    if (!(comeW("policy") && comeW("if") && comeW("exists"))) no("borra un objeto", "DROP");
    ident();
    pideW("on");
    const t = tabla();
    if (!creadas.has(t)) no("borra una política de una tabla que no crea esta migración", "DROP");
    fin();
    return {};
  }
  if (veoW("insert", "update", "delete", "copy", "merge", "with", "truncate"))
    no("lee o escribe datos (aunque la tabla sea nueva)", "ESCRIBE DATOS");
  if (comeW("do")) {
    const d = s[i];
    if (!d || d.k !== "d" || d.tag !== "$$" || i + 1 !== s.length) no("bloque de código (DO): no se puede asegurar qué ejecuta", "BLOQUE DO");
    const ajenas = [];
    const tablas = moldeRls(d.dentro, creadas, ajenas);
    if (tablas && ajenas.length)
      no(`el molde RLS prende RLS sobre tablas que no crea esta migración: ${ajenas.join(", ")}`, "RLS EN TABLA EXISTENTE");
    if (!tablas) no("bloque de código (DO) que no es exactamente el molde RLS de los módulos", "BLOQUE DO");
    return { rls: tablas };
  }
  return no();
}

/** @typedef {{ regla: string, motivo: string, linea: number, fragmento: string }} Hallazgo */

/**
 * Analiza el SQL de UNA migración.
 * @param {string} sql
 * @returns {{ bloqueos: Hallazgo[], avisos: Hallazgo[], rlsNuevas: string[] }}
 *   `avisos` queda por compatibilidad: con el criterio de falla cerrada no hay «pasa con aviso».
 */
export function analizarSql(sql) {
  /** @type {Hallazgo[]} */
  const bloqueos = [];
  const tk = tokenizar(sql);
  if (tk.error || !tk.tokens) {
    bloqueos.push({ regla: "ILEGIBLE", motivo: `no se pudo leer el SQL: ${tk.error} — ${REVISION}`, linea: 0, fragmento: "" });
    return { bloqueos, avisos: [], rlsNuevas: [] };
  }
  const fragmento = (/** @type {string} */ txt) =>
    txt.slice(0, 80).replace(/\s+/g, " ").replace(/`/g, "'").replace(/@/g, "@​").trim();
  const creadas = new Set();
  const rlsNuevas = new Set();
  const colsNuevas = new Map();
  const enums = new Set();
  for (const s of sentencias(tk.tokens)) {
    try {
      const r = sentenciaPermitida(s, creadas, colsNuevas, enums);
      if (r.crea) creadas.add(r.crea);
      if (r.enum) enums.add(r.enum);
      for (const t of [].concat(r.rls ?? [])) rlsNuevas.add(t);
    } catch (e) {
      if (!(e instanceof NoPermitida)) throw e;
      const desde = s[0].pos;
      const ultimo = s[s.length - 1];
      const texto = canonico(s, 0);
      const base = { linea: linea(sql, desde), fragmento: fragmento(sql.slice(desde, ultimo.pos + ultimo.raw.length)) };
      const reglas = new Map();
      if (e.regla !== REVISION) reglas.set(e.regla, e.message);
      for (const r of REGLAS) if (!reglas.has(r.regla) && texto.match(r.re)) reglas.set(r.regla, r.motivo);
      if (!reglas.size) reglas.set(REVISION, e.message);
      for (const [regla, motivo] of reglas) bloqueos.push({ regla, motivo: `${motivo} — ${REVISION}`, ...base });
    }
  }
  return { bloqueos, avisos: [], rlsNuevas: [...rlsNuevas] };
}
