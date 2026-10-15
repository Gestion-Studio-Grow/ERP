// Levanta la demo completa del turnero en local: back (8787) + front estático (5173), dos servidores separados.
//
//   npm run turnero
//
// Turnero:              http://localhost:5173/turnero/
// Backoffice conectado: http://localhost:5173/club/?api=http://localhost:8787  (pide la clave que se imprime abajo)
import { crearApp } from "./back/servidor.mjs";
import { crearFront } from "./servir-front.mjs";

const PB = Number(process.env.PORT ?? 8787), PF = Number(process.env.FRONT_PORT ?? 5173);
const api = `http://localhost:${PB}`;
const back = crearApp({ entorno: { TURNERO_ORIGENES: `http://localhost:${PF},http://127.0.0.1:${PF}`, ...process.env } });
back.servidor.listen(PB, () => {
  crearFront({ api }).listen(PF, () => {
    console.log(`\n  Turnero Break Point — DEMO (WhatsApp y Google simulados, nada se guarda)\n`);
    console.log(`  Turnero:              http://localhost:${PF}/turnero/`);
    console.log(`  Backoffice conectado: http://localhost:${PF}/club/?api=${api}#clave=${back.staffClave}`);
    console.log(`  API:                  ${api}/api/salud\n`);
  });
});
