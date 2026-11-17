/**
 * Unboxing Fest · planilla central de leads y canjes (Google Apps Script, gratis).
 * Es la fuente de verdad del «un premio por persona»: los equipos consultan acá antes de dar un código
 * y el stand valida acá cada canje, así un código no se cobra dos veces aunque haya varias tablets.
 *
 * Instalación (una vez, desde la cuenta corporativa que va a ser dueña de los datos):
 *   1. Planilla nueva → Extensiones → Apps Script → pegar este archivo.
 *   2. Configuración del proyecto → Propiedades del script:
 *        TOKEN        = una clave larga al azar (va dentro de la página: sólo frena el ruido, no es secreta);
 *        STAFF_KEY    = la clave del equipo del stand (abre el panel y autoriza canjes; NO va en la página);
 *        STAND_SECRET = otra clave larga al azar (firma la llave en vivo y las tarjetas; NO va en la página).
 *   3. Implementar → Nueva implementación → Aplicación web · Ejecutar como: yo · Acceso: cualquier usuario.
 *   4. Copiar la URL /exec y el TOKEN en la configuración del juego (endpoint, endpointToken).
 *
 * Acciones (POST, JSON con token y accion):
 *   leads     → guarda leads (idempotente por id); marca «duplicado» si el email o WhatsApp ya tenían premio.
 *   consultar → ¿ese email o WhatsApp ya tiene premio? (antes de dar un código nuevo).
 *   canjear   → valida un código y lo marca canjeado UNA sola vez (con lock: dos tablets a la vez no lo cobran dos veces).
 *   buscar    → código de una persona que lo perdió (por email o WhatsApp). Sólo lo usa el panel del stand.
 *   staff     → ¿la clave del equipo es correcta? (login del panel).
 *   pantalla  → (equipo) clave derivada para que la pantalla del stand dibuje el QR que cambia cada minuto.
 *   activar   → activa el premio de un código con la llave en vivo del stand (t) o con una tarjeta única (c).
 *
 * Llave por persona: el premio de un código vale recién cuando se activa EN el stand, escaneando el QR en vivo
 * (cambia cada 60 s y sólo se puede generar con STAND_SECRET) o con una tarjeta de un solo uso. Las tablets del
 * equipo (con la clave cargada) activan solas lo que se juega en ellas. canjear y buscar exigen la clave del equipo.
 */
var COLS = ['recibido', 'id', 'fecha', 'equipo', 'modo', 'origen', 'juego', 'nombre', 'email', 'whatsapp', 'mayor_edad',
  'acepta_privacidad', 'acepta_novedades', 'acepta_whatsapp', 'version_tyc', 'puntaje', 'nivel', 'premio', 'codigo',
  'senales', 'duplicado', 'canjeado_en', 'canjeado_equipo', 'verificado_wa', 'whatsapp_real', 'activado_en', 'activado_con'];
var ALF = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var C = {}; COLS.forEach(function (c, i) { C[c] = i; });

function doPost(e) {
  var out = { ok: false };
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.object === 'whatsapp_business_account') return json_(whatsapp_(e, b));
    var props = PropertiesService.getScriptProperties(), token = props.getProperty('TOKEN');
    if (!token || b.token !== token) { out.error = 'token'; return json_(out); }
    // la clave del equipo tiene que ser larga: con 4 dígitos se adivina probando (12 caracteres o más)
    var staffKey = props.getProperty('STAFF_KEY'), esEquipo = !!staffKey && staffKey.length >= 12 && String(b.staff || '') === staffKey;
    var acc = b.accion || 'leads';
    if (acc === 'hora') return json_({ ok: true, ahora: Date.now() });
    if (acc === 'staff') return json_({ ok: esEquipo });
    if ((acc === 'canjear' || acc === 'buscar' || acc === 'pantalla') && !esEquipo) return json_({ ok: false, error: 'staff' });
    if (acc === 'pantalla') { var hoy = diaDe_(Math.floor(Date.now() / 60000)), cl = {}; cl[hoy] = clavePantalla_(hoy); cl[hoy + 1] = clavePantalla_(hoy + 1); return json_({ ok: true, claves: cl, ahora: Date.now() }); }
    var sh = hoja_(false);
    // consultas sin escribir: no toman el lock (no frenan los canjes)
    if (acc === 'consultar' || acc === 'estado' || acc === 'buscar') {
      var data0 = sh.getLastRow() ? sh.getDataRange().getValues() : [COLS];
      if (acc === 'consultar') out = { ok: true, ya: !!persona_(data0, b.email, b.whatsapp) };
      else if (acc === 'estado') { var e2 = fila_(data0, b.codigo); out = { ok: true, existe: !!e2, verificado: !!(e2 && e2.r[C.verificado_wa]) }; }
      else { var r = persona_(data0, b.q, b.q); out = { ok: true, codigo: r ? r[C.codigo] : '', canjeado: r ? !!r[C.canjeado_en] : false }; }
      return json_(out);
    }
    var lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return json_({ ok: false, error: 'ocupado' });
    try {
      hoja_(true); // el encabezado se escribe dentro del lock: dos primeros pedidos a la vez no lo duplican
      var data = sh.getDataRange().getValues();
      if (acc === 'leads') out = leads_(sh, data, b, esEquipo);
      else if (acc === 'activar') out = activar_(sh, data, b, esEquipo);
      else if (acc === 'canjear') out = canjear_(sh, data, b);
      else out = { ok: false, error: 'accion' };
    } finally { lock.releaseLock(); }
  } catch (err) { out = { ok: false, error: String(err) }; }
  return json_(out);
}

function leads_(sh, data, b, esEquipo) {
  var ids = {}; for (var i = 1; i < data.length; i++) ids[data[i][C.id]] = true;
  var filas = [], recibidos = [];
  (b.leads || []).slice(0, 50).forEach(function (l) {
    var id = limpia_(l.id).slice(0, 64); if (!id) return;
    if (!ids[id]) {
      var em = limpia_(l.email).toLowerCase(), tel = soloTel_(l.whatsapp);
      // duplicado = esta persona ya tenía un premio válido (el primero gana; los siguientes no se canjean)
      var dup = (em || tel) && persona_(data.concat(filas), em, tel);
      var cod = limpia_(l.codigo).toUpperCase(), rep = !!cod && data.concat(filas).some(function (r) { return String(r[C.codigo]).toUpperCase() === cod; });
      var f = [new Date(), id, limpia_(l.fecha), limpia_(l.equipo), limpia_(l.modo), limpia_(l.origen), limpia_(l.juego),
        limpia_(l.nombre), em, limpia_(l.whatsapp), !!l.mayor_edad, !!l.acepta_privacidad, !!l.acepta_novedades,
        !!l.acepta_whatsapp, limpia_(l.version_tyc), Number(l.puntaje) || 0, limpia_(l.nivel), limpia_(l.premio),
        cod, limpia_(l.senales) + (rep ? ' codigo-repetido' : ''), dup ? 'sí' : '', '', '', '', '',
        // jugado en una tablet del equipo (clave cargada) = ya está en el stand: queda activado
        esEquipo ? new Date() : '', esEquipo ? 'equipo:' + limpia_(b.equipo) : ''];
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
    if (!data[i][C.activado_en]) return { ok: true, estado: 'sin_activar', nombre: String(data[i][C.nombre]).split(' ')[0] };
    if (data[i][C.canjeado_en]) return { ok: true, estado: 'ya_canjeado', cuando: Utilities.formatDate(new Date(data[i][C.canjeado_en]), 'America/Argentina/Buenos_Aires', 'HH:mm') };
    sh.getRange(i + 1, C.canjeado_en + 1, 1, 2).setValues([[new Date(), limpia_(b.equipo)]]);
    return { ok: true, estado: 'ok', nombre: String(data[i][C.nombre]).split(' ')[0], premio: data[i][C.premio], verificado: !!data[i][C.verificado_wa], activado_con: String(data[i][C.activado_con]).split(':')[0] };
  }
  return { ok: true, estado: 'no_existe' };
}

// ---- Llave por persona ----
// Activa el premio de UN código. Vale con: la llave en vivo del stand (t, últimos 3 minutos), una tarjeta de un solo
// uso (c = SERIE-CLAVE) o la clave del equipo (activación en el mostrador). Si el lead todavía no llegó, viene adjunto.
function activar_(sh, data, b, esEquipo) {
  if (b.lead && b.lead.codigo) { leads_(sh, data, { leads: [b.lead], equipo: b.equipo }, false); data = sh.getDataRange().getValues(); }
  var f = fila_(data, b.codigo); if (!f) return { ok: true, estado: 'no_existe' };
  if (f.r[C.duplicado]) return { ok: true, estado: 'duplicado' };
  if (f.r[C.activado_en]) return { ok: true, estado: 'ok', ya: true };
  var con = '';
  if (esEquipo && !b.t && !b.c) con = 'mostrador:' + limpia_(b.equipo);
  else if (b.t) { if (!llaveVivoValida_(String(b.t).toUpperCase())) return { ok: true, estado: 'llave_vencida' }; con = 'stand'; }
  else if (b.c) {
    var m = /^([A-Z0-9]{3,8})-([A-Z2-9]{6})$/.exec(String(b.c).toUpperCase());
    if (!m || firma_(secreto_(), 'tarjeta:' + m[1], 6) !== m[2]) return { ok: true, estado: 'tarjeta_invalida' };
    con = 'tarjeta:' + m[1];
    for (var i = 1; i < data.length; i++) if (data[i][C.activado_con] === con) return { ok: true, estado: 'tarjeta_usada' };
  } else return { ok: true, estado: 'sin_llave' };
  sh.getRange(f.i + 1, C.activado_en + 1, 1, 2).setValues([[new Date(), con]]);
  return { ok: true, estado: 'ok' };
}
function secreto_() { var s = PropertiesService.getScriptProperties().getProperty('STAND_SECRET'); if (!s || s.length < 16) throw new Error('falta STAND_SECRET'); return s; }
// La pantalla recibe una clave DERIVADA: le alcanza para dibujar el QR en vivo, pero no sirve para fabricar tarjetas.
function clavePantalla_(dia) { return hex_(Utilities.computeHmacSha256Signature('pantalla-v1:' + dia, secreto_())); }
function diaDe_(ventana) { return Math.floor((ventana * 60000 - 3 * 3600000) / 86400000); } // día en hora de Argentina
function llaveVivo_(ventana) { return firma_(clavePantalla_(diaDe_(ventana)), 'vivo:' + ventana, 5); }
function llaveVivoValida_(t) { var w = Math.floor(Date.now() / 60000); for (var k = 0; k <= 2; k++) if (llaveVivo_(w - k) === t) return true; return false; }
function firma_(clave, texto, n) { var b = Utilities.computeHmacSha256Signature(texto, clave), s = ''; for (var i = 0; i < n; i++) s += ALF[(b[i] + 256) % 32]; return s; }
function hex_(b) { return b.map(function (x) { return ('0' + ((x + 256) % 256).toString(16)).slice(-2); }).join(''); }
// Tarjetas con QR único (opcional): Ejecutar → generarTarjetas. Llena la hoja «tarjetas» con serie, clave y link para la imprenta.
function generarTarjetas(desde, cantidad) {
  desde = desde || 1; cantidad = cantidad || 500;
  var base = PropertiesService.getScriptProperties().getProperty('BASE_URL') || 'https://unboxingfest.gsgapp.com.ar/juegos/unboxingfest/activar.html';
  var ss = SpreadsheetApp.getActiveSpreadsheet(), sh = ss.getSheetByName('tarjetas') || ss.insertSheet('tarjetas'), filas = [];
  if (sh.getLastRow() === 0) sh.appendRow(['serie', 'clave', 'link']);
  for (var n = desde; n < desde + cantidad; n++) { var serie = ('0000' + n).slice(-5), cl = firma_(secreto_(), 'tarjeta:' + serie, 6); filas.push([serie, cl, base + '?c=' + serie + '-' + cl]); }
  sh.getRange(sh.getLastRow() + 1, 1, filas.length, 3).setValues(filas);
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

// WhatsApp Cloud API → webhook: cuando una persona manda «… Mi código es FO-XXXXXXX» al número de la marca,
// se marca su lead como verificado y se guarda el número REAL desde el que escribió.
// No se responde por WhatsApp: recibir no tiene costo y la confirmación la ve la persona en la página del juego.
// Seguridad: Apps Script no deja leer el encabezado de firma de Meta; por eso la URL del webhook lleva ?k=WA_WEBHOOK_KEY.
function whatsapp_(e, b) {
  var key = PropertiesService.getScriptProperties().getProperty('WA_WEBHOOK_KEY');
  if (!key || !e.parameter || e.parameter.k !== key) return { ok: false, error: 'key' };
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var sh = hoja_(true), data = sh.getDataRange().getValues(), n = 0;
    (b.entry || []).forEach(function (en) { (en.changes || []).forEach(function (ch) {
      ((ch.value && ch.value.messages) || []).forEach(function (m) {
        var txt = (m.text && m.text.body) || '', mt = /FO-?[A-Z2-9]{7}/i.exec(txt); if (!mt) return;
        var f = fila_(data, mt[0].toUpperCase().replace(/^FO-?/, 'FO-')); if (!f) return;
        sh.getRange(f.i + 1, C.verificado_wa + 1, 1, 2).setValues([['sí', '+' + String(m.from || '').replace(/\D/g, '')]]);
        f.r[C.verificado_wa] = 'sí'; n++;
      });
    }); });
    return { ok: true, verificados: n };
  } finally { lock.releaseLock(); }
}
function fila_(data, codigo) { var c = limpia_(codigo).toUpperCase(); for (var i = 1; i < data.length; i++) if (String(data[i][C.codigo]).toUpperCase() === c) return { i: i, r: data[i] }; return null; }
function hoja_(conEncabezado) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('leads') || ss.insertSheet('leads');
  if (conEncabezado && sh.getLastRow() === 0) { sh.appendRow(COLS); sh.setFrozenRows(1); }
  return sh;
}
// Texto plano, sin fórmulas (evita inyección de fórmulas en la planilla) y con largo acotado.
function limpia_(v) { var s = String(v == null ? '' : v).slice(0, 120); return /^[=+\-@]/.test(s) ? "'" + s : s; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
