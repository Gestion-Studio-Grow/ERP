// Prueba del desarmador: le mandamos paquetes MU conocidos, partidos como los
// parte TCP en la vida real, y verificamos que salgan enteros y bien leídos.
import net from 'node:net';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Anclado a la carpeta del script: la prueba tiene que correr desde donde sea.
const AQUI = path.dirname(fileURLToPath(import.meta.url));
process.chdir(AQUI);

const PUERTO = 45999;
const hijo = spawn('node', [path.join(AQUI, 'espia.mjs'), '--puerto', String(PUERTO), '--nombre', 'prueba'], { stdio: ['ignore','pipe','pipe'] });
let salida = '';
hijo.stdout.on('data', d => salida += d);

await new Promise(r => setTimeout(r, 700));

// Paquetes reales del connect server de MU:
const paquetes = [
  Buffer.from('c1040600', 'hex'),          // C1, largo 4, opcode 06
  Buffer.from('c20006f40300', 'hex'),      // C2, largo 6, opcode F4 subopcode 03
  Buffer.from('c30a0102030405060708', 'hex'), // C3 cifrado, largo 10
];
const todo = Buffer.concat(paquetes);

const sock = net.createConnection({ host: '127.0.0.1', port: PUERTO }, async () => {
  // Partido en pedazos feos: medio paquete, byte suelto, y el resto de una.
  sock.write(todo.subarray(0, 2));
  await new Promise(r => setTimeout(r, 120));
  sock.write(todo.subarray(2, 3));
  await new Promise(r => setTimeout(r, 120));
  sock.write(todo.subarray(3));
  await new Promise(r => setTimeout(r, 400));
  sock.end();
});

await new Promise(r => setTimeout(r, 1200));
hijo.kill('SIGINT');
await new Promise(r => setTimeout(r, 600));

const archivo = fs.readdirSync('capturas').filter(f => f.startsWith('prueba-')).sort().pop();
const lineas = fs.readFileSync(`capturas/${archivo}`, 'utf8').trim().split('\n').map(JSON.parse);

let fallos = 0;
const esperar = (cond, msg) => { if (!cond) { console.log('  FALLO: ' + msg); fallos++; } else console.log('  ok: ' + msg); };

console.log(`Paquetes reconstruidos: ${lineas.length}`);
esperar(lineas.length === 3, 'salieron exactamente 3 paquetes de un stream partido en 3 pedazos arbitrarios');
esperar(lineas[0]?.hex === 'c1040600' && lineas[0]?.opcode === 6, 'paquete C1: bytes exactos y opcode 06');
esperar(lineas[1]?.hex === 'c20006f40300' && lineas[1]?.opcode === 0xf4 && lineas[1]?.subopcode === 3, 'paquete C2: largo de 2 bytes, opcode F4 subopcode 03');
esperar(lineas[2]?.cifrado === true && lineas[2]?.largo === 10, 'paquete C3: marcado como cifrado, largo 10');
esperar(!lineas.some(l => l.basura), 'ningún byte quedó huérfano');

fs.rmSync(`capturas/${archivo}`);
console.log(fallos === 0 ? '\nTODO OK' : `\n${fallos} FALLOS`);
process.exit(fallos === 0 ? 0 : 1);
