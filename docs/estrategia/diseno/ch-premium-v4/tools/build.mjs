// Build self-contained deliverable: embed generated images as data URIs.
import { readFileSync, writeFileSync } from "node:fs";
const SRC = process.argv[2], ASSETS = process.argv[3], OUT = process.argv[4];
const USED = ["hero","ritual","facial","masaje","cejas","botanico","espacio","detalle"];
let html = readFileSync(SRC, "utf8");
const map = {};
for (const n of USED) {
  const b64 = readFileSync(`${ASSETS}/${n}.jpg`).toString("base64");
  map[n] = `data:image/jpeg;base64,${b64}`;
}
// 1) inject CH_IMG map before </head> so imgUrl() and static refs resolve to data URIs
const inject = `<script>window.CH_IMG=${JSON.stringify(map)};</script>\n</head>`;
html = html.replace("</head>", inject);
// 2) replace static literal refs (HTML <img src>) — dynamic ${..} refs handled by imgUrl()
html = html.replace(/ch-premium-assets\/([a-z0-9-]+)\.jpg/gi, (m, n) => map[n] || m);
writeFileSync(OUT, html);
const kb = Math.round(Buffer.byteLength(html) / 1024);
console.log(`built ${OUT} — ${kb}KB, ${USED.length} images embedded`);
