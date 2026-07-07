// Publica el panel de la Célula como PRODUCTO dentro de la app (plano de plataforma / mesa de dirección).
// Fuente de verdad: este panel.html. Salida: un módulo TS bundleado que sirve el HTML detrás del
// portón protegido /operador (ADR-021). NO se copia a public/ (sería accesible sin login).
// USO: npm run publicar:direccion   (o: node celula-negocios-digitales/panel/publicar-a-app.mjs)
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SRC = path.join(HERE, 'panel.html');
const OUT_DIR = path.join(REPO, 'src', 'app', 'operador', '(console)', 'direccion');
const OUT = path.join(OUT_DIR, 'panel.generated.ts');

const html = fs.readFileSync(SRC, 'utf8');
const stamp = new Date().toISOString().slice(0, 10);
fs.mkdirSync(OUT_DIR, { recursive: true });
const contenido =
`// ⚠️ GENERADO por celula-negocios-digitales/panel/publicar-a-app.mjs — NO editar a mano.
// Fuente de verdad: celula-negocios-digitales/panel/panel.html
// Regenerar con: npm run publicar:direccion
export const PANEL_HTML: string = ${JSON.stringify(html)};
export const PANEL_PUBLICADO = ${JSON.stringify(stamp)};
`;
fs.writeFileSync(OUT, contenido);
console.log('Publicado ->', path.relative(REPO, OUT), '·', (contenido.length / 1024).toFixed(0), 'KB ·', stamp);
