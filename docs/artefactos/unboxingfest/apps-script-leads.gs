/**
 * Unboxing Fest · planilla central de leads y canjes (Google Apps Script, gratis).
 * Es la fuente de verdad del «un premio por persona»: los equipos consultan acá antes de dar un código
 * y el stand valida acá cada canje, así un código no se cobra dos veces aunque haya varias tablets.
 *
 * Instalación (una vez, desde la cuenta corporativa que va a ser dueña de los datos):
 *   1. Planilla nueva → Extensiones → Apps Script → pegar este archivo.
 *   2. Configuración del proyecto → Propiedades del script → TOKEN = una clave larga al azar.
 *   3. Implementar → Nueva implementación → Aplicación web · Ejecutar como: yo · Acceso: cualquier usuario.
 *   4. Copiar la URL /exec y el TOKEN en la configuración del juego (endpoint, endpointToken).
 *
 * Acciones (POST, JSON con token y accion):
 *   leads     → guarda leads (idempotente por id); marca «duplicado» si el email o WhatsApp ya tenían premio.
 *   consultar → ¿ese email o WhatsApp ya tiene premio? (antes de dar un código nuevo).
 *   canjear   → valida un código y lo marca canjeado UNA sola vez (con lock: dos tablets a la vez no lo cobran dos veces).
 *   buscar    → código de una persona que lo perdió (por email o WhatsApp). Sólo lo usa el panel del stand.
 */
var COLS = ['recibido', 'id', 'fecha', 'equipo', 'modo', 'origen', 'juego', 'nombre', 'email', 'whatsapp', 'mayor_edad',
  'acepta_privacidad', 'acepta_novedades', 'acepta_whatsapp', 'version_tyc', 'puntaje', 'nivel', 'premio', 'codigo',
  'senales', 'duplicado', 'canjeado_en', 'canjeado_equipo', 'verificado_wa', 'whatsapp_real'];
var C = {}; COLS.forEach(function (c, i) { C[c] = i; });

function doPost(e) {
  var out = { ok: false };
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.object === 'whatsapp_business_account') return json_(whatsapp_(e, b));
    var token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token || b.token !== token) { out.error = 'token'; return json_(out); }
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var sh = hoja_(), data = sh.getDataRange().getValues();
      var acc = b.accion || 'leads';
      if (acc === 'leads') out = leads_(sh, data, b);
      else if (acc === 'consultar') out = { ok: true, ya: !!persona_(data, b.email, b.whatsapp) };
      else if (acc === 'canjear') out = canjear_(sh, data, b);
      else if (acc === 'estado') { var e2 = fila_(data, b.codigo); out = { ok: true, existe: !!e2, verificado: !!(e2 && e2.r[C.verificado_wa]) }; }
      else if (acc === 'buscar') { var r = persona_(data, b.q, b.q); out = { ok: true, codigo: r ? r[C.codigo] : '', canjeado: r ? !!r[C.canjeado_en] : false }; }
      else out = { ok: false, error: 'accion' };
    } finally { lock.releaseLock(); }
  } catch (err) { out = { ok: false, error: String(err) }; }
  return json_(out);
}

function leads_(sh, data, b) {
  var ids = {}; for (var i = 1; i < data.length; i++) ids[data[i][C.id]] = true;
  var filas = [], recibidos = [];
  (b.leads || []).slice(0, 50).forEach(function (l) {
    var id = limpia_(l.id).slice(0, 64); if (!id) return;
    if (!ids[id]) {
      var em = limpia_(l.email).toLowerCase(), tel = soloTel_(l.whatsapp);
      // duplicado = esta persona ya tenía un premio válido (el primero gana; los siguientes no se canjean)
      var dup = (em || tel) && persona_(data.concat(filas), em, tel);
      var f = [new Date(), id, limpia_(l.fecha), limpia_(l.equipo), limpia_(l.modo), limpia_(l.origen), limpia_(l.juego),
        limpia_(l.nombre), em, limpia_(l.whatsapp), !!l.mayor_edad, !!l.acepta_privacidad, !!l.acepta_novedades,
        !!l.acepta_whatsapp, limpia_(l.version_tyc), Number(l.puntaje) || 0, limpia_(l.nivel), limpia_(l.premio),
        limpia_(l.codigo).toUpperCase(), limpia_(l.senales), dup ? 'sí' : '', '', '', '', ''];
      filas.push(f); ids[id] = true;
    }
    recibidos.push(id);
  });
  if (filas.length) sh.getRange(sh.getLastRow() + 1, 1, filas.length, COLS.length).setValues(filas);
  return { ok: true, recibidos: recibidos };
}

function canjear_(sh, data, b) {
  var cod = limpia_(b.codigo).toUpperCase();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][C.codigo]).toUpperCase() !== cod) continue;
    if (data[i][C.duplicado]) return { ok: true, estado: 'duplicado' };
    if (data[i][C.canjeado_en]) return { ok: true, estado: 'ya_canjeado', cuando: Utilities.formatDate(new Date(data[i][C.canjeado_en]), 'America/Argentina/Buenos_Aires', 'HH:mm') };
    sh.getRange(i + 1, C.canjeado_en + 1, 1, 2).setValues([[new Date(), limpia_(b.equipo)]]);
    return { ok: true, estado: 'ok', nombre: String(data[i][C.nombre]).split(' ')[0], premio: data[i][C.premio], verificado: !!data[i][C.verificado_wa] };
  }
  return { ok: true, estado: 'no_existe' };
}

// primera fila NO duplicada con ese email o WhatsApp (últimos 10 dígitos)
function persona_(data, email, tel) {
  var em = limpia_(email).toLowerCase(), t = soloTel_(tel);
  if (em.indexOf('@') < 0) em = '';
  for (var i = 1; i < data.length; i++) {
    if (data[i][C.duplicado]) continue;
    if ((em && String(data[i][C.email]).toLowerCase() === em) || (t && soloTel_(data[i][C.whatsapp]) === t)) return data[i];
  }
  return null;
}
function soloTel_(v) { var t = String(v || '').replace(/\D/g, '').slice(-10); return t.length >= 8 ? t : ''; }
// Verificación del webhook de WhatsApp (Meta manda hub.challenge una vez, al configurarlo)
function doGet(e) {
  var p = (e && e.parameter) || {}, props = PropertiesService.getScriptProperties();
  if (p['hub.mode'] === 'subscribe' && p['hub.verify_token'] && p['hub.verify_token'] === props.getProperty('WA_VERIFY_TOKEN')) return ContentService.createTextOutput(p['hub.challenge']);
  return json_({ ok: true, servicio: 'unboxingfest' });
}

// WhatsApp Cloud API → webhook: cuando una persona manda «… Mi código es FO-XXXXX» al número de la marca,
// se marca su lead como verificado y se guarda el número REAL desde el que escribió.
// No se responde por WhatsApp: recibir no tiene costo y la confirmación la ve la persona en la página del juego.
// Seguridad: Apps Script no deja leer el encabezado de firma de Meta; por eso la URL del webhook lleva ?k=WA_WEBHOOK_KEY.
function whatsapp_(e, b) {
  var key = PropertiesService.getScriptProperties().getProperty('WA_WEBHOOK_KEY');
  if (!key || !e.parameter || e.parameter.k !== key) return { ok: false, error: 'key' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = hoja_(), data = sh.getDataRange().getValues(), n = 0;
    (b.entry || []).forEach(function (en) { (en.changes || []).forEach(function (ch) {
      ((ch.value && ch.value.messages) || []).forEach(function (m) {
        var txt = (m.text && m.text.body) || '', mt = /FO-?[A-Z2-9]{5}/i.exec(txt); if (!mt) return;
        var f = fila_(data, mt[0].toUpperCase().replace(/^FO-?/, 'FO-')); if (!f) return;
        sh.getRange(f.i + 1, C.verificado_wa + 1, 1, 2).setValues([['sí', '+' + String(m.from || '').replace(/\D/g, '')]]);
        f.r[C.verificado_wa] = 'sí'; n++;
      });
    }); });
    return { ok: true, verificados: n };
  } finally { lock.releaseLock(); }
}
function fila_(data, codigo) { var c = limpia_(codigo).toUpperCase(); for (var i = 1; i < data.length; i++) if (String(data[i][C.codigo]).toUpperCase() === c) return { i: i, r: data[i] }; return null; }
function hoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('leads') || ss.insertSheet('leads');
  if (sh.getLastRow() === 0) { sh.appendRow(COLS); sh.setFrozenRows(1); }
  return sh;
}
// Texto plano, sin fórmulas (evita inyección de fórmulas en la planilla) y con largo acotado.
function limpia_(v) { var s = String(v == null ? '' : v).slice(0, 120); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
