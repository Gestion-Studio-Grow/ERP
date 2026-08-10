#!/usr/bin/env node
// ============================================================================
// ILUSTRAR — foto → ilustración aesthetic vía API de imagen de Google (Gemini).
// ============================================================================
//
// POR QUÉ EXISTE: Claude NO genera ni edita imágenes (ni por API). Para producir
// piezas visuales de marca — el caso que lo disparó: la foto del equipo en versión
// ilustrada con frase manuscrita — hace falta un proveedor de imagen externo.
// Este script es ese puente, y queda versionado para reusarse en el GENERADOR DE
// PRESET POR IA (CLAUDE.md → playbooks), donde la generación de piezas por tenant
// se repite y a mano no escala.
//
// REGLA DE CREDENCIALES (FASE 2, no negociable): la key la pega el DUEÑO, nunca el
// agente. Se lee de `GEMINI_API_KEY` del entorno. NO se commitea, NO se pega en el
// chat de una sesión (queda en el historial). `.gitignore` ya ignora `.env*`.
//
// REGLA DE GASTO (DEMO → VENTA → INVERSIÓN): esto CUESTA por imagen. Para una pieza
// suelta de preventa sale más barato hacerlo a mano en la app. Se justifica cuando
// hay volumen (contenido por tenant, presets) o cuando la venta ya está cerrada.
//
// USO:
//   # 0) Descubrir qué modelos de imagen habilita TU key (hacelo primero):
//   node scripts/ilustrar.mjs --list-models
//
//   # 1) Ilustrar una foto con un preset del catálogo:
//   node scripts/ilustrar.mjs --input assets/fuente/equipo-espejo.jpg \
//                             --preset aesthetic-ilustrado \
//                             --output out/equipo-ilustrado.png
//
//   # 2) O con un prompt libre:
//   node scripts/ilustrar.mjs --input foto.jpg --prompt "..." --output salida.png
//
// NOTA DE RED (contenedor remoto): el `fetch` nativo de Node IGNORA HTTPS_PROXY salvo
// que corras con NODE_USE_ENV_PROXY=1 (Node >= 22.21). En una laptop sin proxy da igual.
//   NODE_USE_ENV_PROXY=1 node scripts/ilustrar.mjs ...
//
// — Elaborado por GSG
// ============================================================================

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const API = "https://generativelanguage.googleapis.com/v1beta";

// Sin default hardcodeado a propósito: los IDs de modelo de imagen de Google rotan
// seguido y un ID inventado falla con un 404 confuso. `--list-models` pregunta la
// verdad a la API; el elegido se fija acá o en GEMINI_IMAGE_MODEL.
const MODELO = process.env.GEMINI_IMAGE_MODEL || "";

const MIMES = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const EXT_POR_MIME = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

// ---------------------------------------------------------------------------
// Argumentos
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const clave = a.slice(2);
    const siguiente = argv[i + 1];
    if (siguiente === undefined || siguiente.startsWith("--")) {
      args[clave] = true;
    } else {
      args[clave] = siguiente;
      i++;
    }
  }
  return args;
}

function salir(mensaje) {
  console.error(`\n✖ ${mensaje}\n`);
  process.exit(1);
}

function leerKey() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    salir(
      "Falta GEMINI_API_KEY.\n\n" +
        "  · En la laptop:  export GEMINI_API_KEY='...'  (o .env.local, que ya está gitignoreado)\n" +
        "  · En Claude Code web: cargala como variable de entorno DEL ENVIRONMENT.\n\n" +
        "  Nunca la pegues en el chat ni la commitees.",
    );
  }
  return key;
}

function avisarProxy() {
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
    console.warn(
      "⚠ HTTPS_PROXY está seteado pero NODE_USE_ENV_PROXY no.\n" +
        "  El fetch nativo de Node va a ignorar el proxy y esto puede colgarse.\n" +
        "  Recorré con: NODE_USE_ENV_PROXY=1 node scripts/ilustrar.mjs ...\n",
    );
  }
}

// ---------------------------------------------------------------------------
// Llamada HTTP — un solo lugar para el manejo de errores de la API
// ---------------------------------------------------------------------------
async function pedir(url, key, opciones = {}) {
  let respuesta;
  try {
    respuesta = await fetch(url, {
      ...opciones,
      headers: { "x-goog-api-key": key, ...(opciones.headers || {}) },
    });
  } catch (error) {
    salir(
      `No se pudo alcanzar la API de Google: ${error.message}\n` +
        "  Si estás en el contenedor remoto puede ser la política de egress del environment.\n" +
        "  Probá con NODE_USE_ENV_PROXY=1; si sigue, hay que habilitar generativelanguage.googleapis.com.",
    );
  }

  const cuerpo = await respuesta.text();
  if (!respuesta.ok) {
    let detalle = cuerpo.slice(0, 600);
    try {
      detalle = JSON.stringify(JSON.parse(cuerpo).error ?? JSON.parse(cuerpo), null, 2);
    } catch {
      /* el cuerpo no era JSON; mostramos el texto crudo */
    }
    salir(`La API respondió HTTP ${respuesta.status}:\n${detalle}`);
  }

  try {
    return JSON.parse(cuerpo);
  } catch {
    salir(`La API devolvió algo que no es JSON:\n${cuerpo.slice(0, 400)}`);
  }
}

// ---------------------------------------------------------------------------
// --list-models: qué habilita TU key, dicho por la API (no por mi memoria)
// ---------------------------------------------------------------------------
async function listarModelos(key) {
  const datos = await pedir(`${API}/models?pageSize=200`, key);
  const modelos = datos.models ?? [];

  // Heurística deliberadamente amplia: el nombre delata a los de imagen, y algunos
  // declaran el modo de salida. Mejor mostrar de más que esconder el que sirve.
  const deImagen = modelos.filter(
    (m) =>
      /image/i.test(m.name ?? "") ||
      /image/i.test(m.displayName ?? "") ||
      (m.supportedGenerationMethods ?? []).some((x) => /image/i.test(x)),
  );

  const mostrar = deImagen.length ? deImagen : modelos;
  if (!deImagen.length) {
    console.log("\n(No detecté modelos de imagen por nombre — listo todos)\n");
  }

  console.log(`\nModelos disponibles para tu key (${mostrar.length}):\n`);
  for (const m of mostrar) {
    const id = (m.name ?? "").replace(/^models\//, "");
    console.log(`  ${id}`);
    if (m.displayName) console.log(`      ${m.displayName}`);
  }
  console.log(
    "\nElegí uno y fijalo:  export GEMINI_IMAGE_MODEL='<id>'   (o pasá --model <id>)\n",
  );
}

// ---------------------------------------------------------------------------
// Presets — el catálogo de estéticas reusables
// ---------------------------------------------------------------------------
function cargarPreset(nombre) {
  const ruta = resolve(RAIZ, "scripts/presets/ilustracion.json");
  if (!existsSync(ruta)) salir(`No encuentro el catálogo de presets en ${ruta}`);

  const catalogo = JSON.parse(readFileSync(ruta, "utf8"));
  const preset = catalogo[nombre];
  if (!preset) {
    salir(
      `No existe el preset "${nombre}". Disponibles:\n  ` +
        Object.keys(catalogo).join("\n  "),
    );
  }
  return preset.prompt;
}

// ---------------------------------------------------------------------------
// Generación / edición
// ---------------------------------------------------------------------------
async function ilustrar({ key, modelo, entrada, prompt, salida, modalidades }) {
  const ext = extname(entrada).toLowerCase();
  const mime = MIMES[ext];
  if (!mime) {
    salir(
      `Extensión no soportada: "${ext}". Usá ${Object.keys(MIMES).join(", ")}.`,
    );
  }
  if (!existsSync(entrada)) salir(`No encuentro la imagen de entrada: ${entrada}`);

  const base64 = readFileSync(entrada).toString("base64");

  const cuerpo = {
    contents: [
      {
        parts: [
          { inline_data: { mime_type: mime, data: base64 } },
          { text: prompt },
        ],
      },
    ],
    generationConfig: { responseModalities: modalidades },
  };

  console.log(`→ modelo:  ${modelo}`);
  console.log(`→ entrada: ${entrada} (${mime}, ${(base64.length / 1365).toFixed(0)} KB aprox)`);
  console.log(`→ salida:  ${salida}\n`);

  const datos = await pedir(`${API}/models/${modelo}:generateContent`, key, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(cuerpo),
  });

  // La respuesta REST viene en camelCase (inlineData), pero aceptamos las dos
  // formas: el proxy o una versión distinta de la API pueden devolver snake_case.
  const partes = datos?.candidates?.[0]?.content?.parts ?? [];
  const parteImagen = partes.find((p) => p.inlineData?.data || p.inline_data?.data);

  if (!parteImagen) {
    const texto = partes.map((p) => p.text).filter(Boolean).join("\n");
    const motivo = datos?.candidates?.[0]?.finishReason;
    salir(
      "La API no devolvió ninguna imagen.\n" +
        (motivo ? `  finishReason: ${motivo}\n` : "") +
        (texto ? `  El modelo respondió en texto:\n  ${texto.slice(0, 500)}\n` : "") +
        "  Si el modelo exige texto+imagen, reintentá con --modalities TEXT,IMAGE",
    );
  }

  const inline = parteImagen.inlineData ?? parteImagen.inline_data;
  const bytes = Buffer.from(inline.data, "base64");

  // Si la salida no trae extensión, la deducimos del MIME que devolvió el modelo.
  const mimeSalida = inline.mimeType ?? inline.mime_type ?? "image/png";
  const rutaFinal = extname(salida) ? salida : salida + (EXT_POR_MIME[mimeSalida] ?? ".png");

  mkdirSync(dirname(resolve(rutaFinal)), { recursive: true });
  writeFileSync(rutaFinal, bytes);

  const acompaña = partes.map((p) => p.text).filter(Boolean).join("\n").trim();
  if (acompaña) console.log(`Nota del modelo: ${acompaña}\n`);

  console.log(`✔ Listo: ${rutaFinal} (${(bytes.length / 1024).toFixed(0)} KB)\n`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 34).join("\n"));
    return;
  }

  avisarProxy();
  const key = leerKey();

  if (args["list-models"]) {
    await listarModelos(key);
    return;
  }

  const modelo = args.model || MODELO;
  if (!modelo) {
    salir(
      "Falta el modelo de imagen.\n\n" +
        "  Corré primero:  node scripts/ilustrar.mjs --list-models\n" +
        "  y después:      export GEMINI_IMAGE_MODEL='<id>'   (o pasá --model <id>)",
    );
  }

  const entrada = args.input;
  if (!entrada) salir("Falta --input <ruta de la foto>");

  const prompt = args.prompt || (args.preset ? cargarPreset(args.preset) : null);
  if (!prompt) salir("Falta --prompt \"...\" o --preset <nombre>");

  const salida = args.output || "out/ilustracion";
  const modalidades = (args.modalities || "IMAGE")
    .split(",")
    .map((m) => m.trim().toUpperCase())
    .filter(Boolean);

  await ilustrar({ key, modelo, entrada, prompt, salida, modalidades });
}

main().catch((error) => salir(error?.stack ?? String(error)));
