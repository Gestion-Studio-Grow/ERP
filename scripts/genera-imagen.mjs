// CLI fino sobre la capacidad compartida de imagen IA (src/lib/imagen).
// No reimplementa nada: parsea flags y llama a `generarImagen()`. Pensado para
// generar el hero/onboarding de cualquier tenant a mano o desde un script mayor.
//
// Uso (tsx registra TypeScript para poder importar el modulo .ts):
//   node --import tsx scripts/genera-imagen.mjs --prompt "hero con toallas y velas" \
//        --out public/tenants/ch/hero.jpg --rubro estetica --aspect 4:5
//
// Flags:
//   --prompt   (obligatorio)  pedido especifico de la imagen
//   --out      (obligatorio)  ruta de guardado (se crean los directorios)
//   --rubro    (opcional)     estetica | carniceria | velas | padel | ... (elige el estilo)
//   --tenant   (opcional)     slug del tenant, solo metadato
//   --aspect   (opcional)     1:1 | 4:3 | 3:4 | 4:5 | 5:4 | 16:9 | 9:16  (default 1:1)
//   --provider (opcional)     pollinations | gemini | fal | replicate | bfl  (default pollinations)
//   --estilo   (opcional)     override de estilo (pisa al preset del rubro)
//   --seed     (opcional)     semilla numerica (reproducibilidad)
//
// El default (pollinations) es GRATIS y NO necesita clave: funciona ya. gemini/fal
// requieren su env var (GEMINI_API_KEY / FAL_KEY); sin ella, mensaje claro y exit 1
// SIN romper nada (no llama a la API).
//
// Se corre con `node --import tsx` (ver Uso arriba) para poder importar el .ts.
import { generarImagen } from "../src/lib/imagen/index.ts";

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.prompt || !args.out) {
    console.error(
      "Faltan flags obligatorios.\n" +
        'Uso: node --import tsx scripts/genera-imagen.mjs --prompt "..." --out ruta.jpg [--rubro estetica] [--aspect 4:5] [--provider pollinations] [--tenant ch] [--estilo "..."] [--seed 42]',
    );
    process.exit(1);
  }

  try {
    const res = await generarImagen({
      prompt: args.prompt,
      outPath: args.out,
      rubro: args.rubro,
      tenant: args.tenant,
      aspectRatio: args.aspect,
      provider: args.provider,
      estilo: args.estilo,
      seed: args.seed !== undefined ? Number(args.seed) : undefined,
    });
    console.log(`OK  imagen guardada en ${res.outPath}`);
    console.log(`    proveedor: ${res.provider}  ${res.contentType}  ${res.bytes} bytes`);
    console.log(`    prompt final: ${res.promptFinal}`);
  } catch (err) {
    // Mensaje claro y sin stack ruidoso para errores esperados (falta clave, prompt malo).
    console.error(`ERROR  ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

main();
