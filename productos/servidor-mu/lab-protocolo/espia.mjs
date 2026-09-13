#!/usr/bin/env node
// Espía de protocolo MU — el banco de trabajo para descubrir cómo habla un cliente.
//
// QUÉ HACE: se para en un puerto, deja que el cliente del juego se conecte, y
// registra CADA BYTE que pasa, ya desarmado en paquetes. Dos modos:
//
//   escucha  — solo escucha. El cliente se conecta, manda lo suyo, y como nadie
//              le contesta se corta. Suena inútil y no lo es: los primeros
//              paquetes que manda un cliente ANTES de recibir nada son la puerta
//              de entrada a todo el protocolo.
//   proxy    — se pone en el medio entre el cliente y un servidor de verdad, y
//              registra las dos direcciones. Este es el modo que enseña: ves la
//              pregunta y la respuesta juntas.
//
// PARA QUÉ SIRVE DE VERDAD: correlo primero contra TU servidor de Season 6 que
// ya funciona (modo proxy, cliente S6 → OpenMU). Vas a ver el protocolo que ya
// está documentado, y así comprobás que la herramienta lee bien. Recién cuando
// confiás en la herramienta la apuntás a lo desconocido.
//
// LÍMITE: esto se usa contra TU cliente y TU servidor. No lo pongas en el medio
// de un servidor comercial ajeno.

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

// ── Framing de MU ────────────────────────────────────────────────────────────
// Un paquete arranca con un byte que dice cómo se mide y si viene cifrado.
// Esto no cambió entre seasons: es lo único que podés dar por sentado cuando
// mirás un protocolo que no conocés.
const TIPOS = {
  0xC1: { bytesLargo: 1, cifrado: false },
  0xC2: { bytesLargo: 2, cifrado: false },
  0xC3: { bytesLargo: 1, cifrado: true },
  0xC4: { bytesLargo: 2, cifrado: true },
};

// Va acumulando bytes del socket y suelta paquetes completos. TCP no respeta
// los límites de tus mensajes: podés recibir medio paquete, o tres y medio.
class Desarmador {
  constructor() { this.buf = Buffer.alloc(0); }

  empujar(chunk) {
    this.buf = Buffer.concat([this.buf, chunk]);
    const paquetes = [];
    for (;;) {
      if (this.buf.length < 1) break;
      const tipo = TIPOS[this.buf[0]];

      if (!tipo) {
        // Byte que no arranca ningún paquete conocido. No lo tiramos en
        // silencio: si aparece, es un dato (¿otro framing? ¿basura? ¿desincronía?).
        paquetes.push({ basura: true, bytes: this.buf.subarray(0, 1) });
        this.buf = this.buf.subarray(1);
        continue;
      }

      const cab = 1 + tipo.bytesLargo;
      if (this.buf.length < cab) break;
      const largo = tipo.bytesLargo === 1
        ? this.buf[1]
        : (this.buf[1] << 8) | this.buf[2];

      // Un largo menor que la cabecera nos dejaría en un bucle infinito.
      if (largo < cab) {
        paquetes.push({ basura: true, bytes: this.buf.subarray(0, 1) });
        this.buf = this.buf.subarray(1);
        continue;
      }
      if (this.buf.length < largo) break;   // todavía no llegó entero

      const bytes = this.buf.subarray(0, largo);
      this.buf = this.buf.subarray(largo);
      paquetes.push({
        bytes,
        cifrado: tipo.cifrado,
        // En un paquete cifrado el "opcode" que leemos no es el real: está
        // adentro de lo cifrado. Lo anotamos igual, marcado.
        opcode: bytes.length > cab ? bytes[cab] : null,
        subopcode: bytes.length > cab + 1 ? bytes[cab + 1] : null,
      });
    }
    return paquetes;
  }
}

// ── Presentación ─────────────────────────────────────────────────────────────
const hexDump = (buf) => {
  const lineas = [];
  for (let i = 0; i < buf.length; i += 16) {
    const trozo = buf.subarray(i, i + 16);
    const hex = [...trozo].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(47);
    const txt = [...trozo].map(b => (b >= 0x20 && b < 0x7f) ? String.fromCharCode(b) : '.').join('');
    lineas.push(`  ${i.toString(16).padStart(4, '0')}  ${hex}  |${txt}|`);
  }
  return lineas.join('\n');
};

const etiqueta = (p) => {
  if (p.basura) return 'BASURA';
  const op = p.opcode === null ? '??' : p.opcode.toString(16).padStart(2, '0').toUpperCase();
  const sub = p.subopcode === null ? '' : ':' + p.subopcode.toString(16).padStart(2, '0').toUpperCase();
  return `${p.cifrado ? 'CIFRADO ' : ''}op ${op}${sub}`;
};

// ── Programa ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const opt = (n, def) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};

const modo    = args.includes('--proxy') ? 'proxy' : 'escucha';
const puerto  = Number(opt('puerto', '44405'));
const destino = opt('destino', '');          // ip:puerto, solo en modo proxy
const etiquetaSesion = opt('nombre', 'sesion');

if (modo === 'proxy' && !destino) {
  console.error('Modo proxy sin --destino. Ejemplo:');
  console.error('  node espia.mjs --proxy --puerto 44405 --destino 127.0.0.1:44405');
  process.exit(1);
}

const sello = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const archivoLog = path.join(AQUI, 'capturas', `${etiquetaSesion}-${sello}.jsonl`);
fs.mkdirSync(path.dirname(archivoLog), { recursive: true });
const log = fs.createWriteStream(archivoLog, { flags: 'a' });

let nConexion = 0;
const vistos = new Map();   // clave -> cantidad, para el resumen al salir

const registrar = (conn, dir, p) => {
  const clave = `${dir} ${etiqueta(p)}`;
  vistos.set(clave, (vistos.get(clave) ?? 0) + 1);

  log.write(JSON.stringify({
    t: Date.now(), conn, dir,
    cifrado: !!p.cifrado, basura: !!p.basura,
    opcode: p.opcode ?? null, subopcode: p.subopcode ?? null,
    largo: p.bytes.length,
    hex: p.bytes.toString('hex'),
  }) + '\n');

  const flecha = dir === 'cliente' ? '▶ CLIENTE' : '◀ SERVIDOR';
  console.log(`\n[${conn}] ${flecha}  ${etiqueta(p)}  (${p.bytes.length} bytes)`);
  console.log(hexDump(p.bytes));
};

const servidor = net.createServer((sockCliente) => {
  const id = ++nConexion;
  const desdeCliente = new Desarmador();
  console.log(`\n=== [${id}] conectó ${sockCliente.remoteAddress} ===`);

  let sockServidor = null;
  if (modo === 'proxy') {
    const [hostD, puertoD] = destino.split(':');
    const desdeServidor = new Desarmador();
    sockServidor = net.createConnection({ host: hostD, port: Number(puertoD) }, () => {
      console.log(`[${id}] proxy conectado a ${destino}`);
    });
    sockServidor.on('data', (d) => {
      for (const p of desdeServidor.empujar(d)) registrar(id, 'servidor', p);
      if (!sockCliente.destroyed) sockCliente.write(d);
    });
    sockServidor.on('error', (e) => console.log(`[${id}] error del destino: ${e.message}`));
    sockServidor.on('close', () => sockCliente.destroy());
  }

  sockCliente.on('data', (d) => {
    for (const p of desdeCliente.empujar(d)) registrar(id, 'cliente', p);
    if (sockServidor && !sockServidor.destroyed) sockServidor.write(d);
  });
  sockCliente.on('error', (e) => console.log(`[${id}] error del cliente: ${e.message}`));
  sockCliente.on('close', () => {
    console.log(`\n=== [${id}] se cortó ===`);
    if (sockServidor) sockServidor.destroy();
  });
});

servidor.listen(puerto, '0.0.0.0', () => {
  console.log(`Espía escuchando en 0.0.0.0:${puerto}  (modo ${modo}${modo === 'proxy' ? ' → ' + destino : ''})`);
  console.log(`Capturando a ${path.relative(process.cwd(), archivoLog)}`);
  console.log('Apuntá el cliente a la IP de esta máquina y ese puerto. Ctrl+C para cerrar.\n');
});

process.on('SIGINT', () => {
  console.log('\n\n── Resumen de la sesión ──');
  if (vistos.size === 0) {
    console.log('No pasó ningún paquete. El cliente ni siquiera llegó a conectarse:');
    console.log('revisá IP, puerto y firewall antes de sacar conclusiones del protocolo.');
  } else {
    for (const [k, v] of [...vistos].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(4)}×  ${k}`);
    }
  }
  console.log(`\nCaptura completa en: ${archivoLog}`);
  log.end(() => process.exit(0));
});
