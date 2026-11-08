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
export function enmascararStrings(texto) {
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
          out.push(m[0], enmascararStrings(texto.slice(i + m[0].length, fin)), m[0]);
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

// ── Identificadores ─────────────────────────────────────────────────────────
// Postgres: "Así" respeta mayúsculas; sin comillas se pliega a minúsculas. Se comparan así.
const RE_IDENT = String.raw`(?:"(?:[^"]|"")+"|[A-Za-z_][A-Za-z0-9_$]*)`;
const RE_TABLA = String.raw`(?:(?:"public"|public)\s*\.\s*)?(${RE_IDENT})`;

export function normalizarIdent(raw) {
  if (raw.startsWith('"')) return raw.slice(1, -1).replace(/""/g, '"');
  return raw.toLowerCase();
}

/** Tablas que la migración crea (CREATE TABLE al principio de una sentencia). */
export function tablasCreadas(texto) {
  const set = new Set();
  const re = new RegExp(String.raw`(?:^|;)\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?${RE_TABLA}`, "gi");
  let m;
  const mascara = enmascararStrings(texto);
  while ((m = re.exec(mascara))) set.add(normalizarIdent(m[1]));
  return set;
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
    re: /\b(?:DBLINK\w*|CHR\s*\(|CONVERT_FROM\s*\(|DECODE\s*\(|PG_READ_\w+|PG_WRITE_\w+|LO_IMPORT|LO_EXPORT|PG_TERMINATE_BACKEND|PG_CANCEL_BACKEND)|\bU&'|\bCOPY\b|\bALTER\s+SYSTEM\b|\bALTER\s+DEFAULT\s+PRIVILEGES\b/gi,
    motivo: "construye o ejecuta SQL por fuera de lo que se puede leer acá",
  },
];

const AVISOS = [
  {
    regla: "UPDATE",
    re: new RegExp(String.raw`\bUPDATE\s+(?:ONLY\s+)?${RE_TABLA}\s+(?:AS\s+${RE_IDENT}\s+)?SET\b`, "gi"),
    motivo: "modifica filas existentes (backfill)",
  },
  { regla: "INSERT", re: /\bINSERT\s+INTO\b/gi, motivo: "inserta datos" },
  { regla: "SECURITY DEFINER", re: /\bSECURITY\s+DEFINER\b/gi, motivo: "función que corre con permisos del dueño" },
  { regla: "GRANT", re: /\bGRANT\b/gi, motivo: "otorga permisos" },
  { regla: "OWNER TO", re: /\bOWNER\s+TO\b/gi, motivo: "cambia el dueño de un objeto" },
];

/** @typedef {{ regla: string, motivo: string, linea: number, fragmento: string }} Hallazgo */

/**
 * Analiza el SQL de UNA migración.
 * @returns {{ bloqueos: Hallazgo[], avisos: Hallazgo[], rlsNuevas: string[] }}
 *   Hallazgo = { regla, motivo, linea, fragmento }
 */
export function analizarSql(sql) {
  const bloqueos = [];
  const avisos = [];
  const limpio = limpiarComentarios(sql);
  if (limpio.error) {
    bloqueos.push({ regla: "ILEGIBLE", motivo: `no se pudo leer el SQL: ${limpio.error}`, linea: 0, fragmento: "" });
    return { bloqueos, avisos, rlsNuevas: [] };
  }
  let texto = limpio.texto;
  const creadas = tablasCreadas(texto);

  // Neutraliza el idioma RLS reconocido (se pisa con espacios, mismo largo).
  const rls = idiomaRls(texto, creadas);
  const rlsNuevas = new Set();
  for (const r of rls.sort((a, b) => b.desde - a.desde)) {
    texto = texto.slice(0, r.desde) + texto.slice(r.desde, r.hasta).replace(/[^\n]/g, " ") + texto.slice(r.hasta);
    for (const t of r.tablas) rlsNuevas.add(t);
  }

  const hallazgo = (lista, regla, motivo, idx, largo) =>
    lista.push({
      regla,
      motivo,
      linea: linea(texto, idx),
      fragmento: texto.slice(idx, idx + Math.max(largo, 60)).replace(/\s+/g, " ").trim(),
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
      hallazgo(avisos, "TRIGGER EN TABLA EXISTENTE", "cambia qué pasa al escribir en una tabla en uso", m.index, m[0].length);
  const reNN = new RegExp(String.raw`\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:ONLY\s+)?${RE_TABLA}\s+ADD\s+(?:COLUMN\s+)?(?:IF\s+NOT\s+EXISTS\s+)?${RE_IDENT}[^,;]*?\bNOT\s+NULL\b[^,;]*`, "gi");
  for (const m of texto.matchAll(reNN))
    if (!creadas.has(normalizarIdent(m[1])) && !/\bDEFAULT\b/i.test(m[0]))
      hallazgo(avisos, "NOT NULL SIN DEFAULT", "falla si la tabla tiene filas", m.index, m[0].length);

  bloqueos.sort((a, b) => a.linea - b.linea);
  avisos.sort((a, b) => a.linea - b.linea);
  return { bloqueos, avisos, rlsNuevas: [...rlsNuevas] };
}
