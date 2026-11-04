// buscatufoto · limpieza por retención.
//
// QUÉ HACE: para cada álbum (`BtfAlbum`) cuya `fecha` (AAAA-MM-DD) sea anterior a hoy − 90 días, borra del
// almacén S3 el original (bucket privado), la previa y la miniatura (bucket público) de cada medio, y marca el
// medio como borrado (`subido = false`, `oculto = true`: el schema no tiene un campo «borrado» y este script no
// agrega migraciones). Los pedidos (`BtfPedido`) NO se tocan: son el comprobante de la venta.
//
// POR QUÉ: Ley 25.326 (Protección de Datos Personales): las imágenes de personas, y más las de menores, no se
// guardan más tiempo que el necesario para la finalidad (vender las fotos del evento). La retención de 90 días
// es PROVISIONAL, a confirmar por un abogado; se cambia con `--dias N`.
//
// CÓMO SE CORRE (lo corre el dueño a mano, nunca solo ni desde la app):
//   node --import tsx scripts/btf-limpieza.mjs                 -> DRY-RUN: lista qué borraría, NO borra
//   node --import tsx scripts/btf-limpieza.mjs --aplicar       -> borra de verdad (dato productivo)
//   node --import tsx scripts/btf-limpieza.mjs --dias 120 [--aplicar]
// Necesita DATABASE_URL y BTF_S3_* en el entorno (o en .env); si faltan, sale con código 2.
// Sólo marca un medio si se borraron sus tres objetos; lo que falló queda para la próxima corrida.

import "dotenv/config";

const AYUDA = `buscatufoto · limpieza por retención (Ley 25.326, retención provisional a confirmar)

Uso:
  node --import tsx scripts/btf-limpieza.mjs [--dias N] [--aplicar]

  --dias N    antigüedad en días contada desde la fecha del álbum (default 90)
  --aplicar   borra de verdad; sin esta opción sólo lista (dry-run)
  --help      muestra esta ayuda

Borra originales, previas y miniaturas del almacén y marca los medios como borrados.
Los pedidos no se borran. Lo corre el dueño a mano.`;

function leerArgs(argv) {
  if (argv.includes("--help") || argv.includes("-h")) return { ayuda: true };
  const aplicar = argv.includes("--aplicar");
  const i = argv.indexOf("--dias");
  const dias = i >= 0 ? Number(argv[i + 1]) : 90;
  if (!Number.isInteger(dias) || dias <= 0) {
    console.error(`--dias inválido: "${argv[i + 1]}" (tiene que ser un entero mayor que 0)`);
    process.exit(1);
  }
  return { ayuda: false, aplicar, dias };
}

/** AAAA-MM-DD de hoy − dias (UTC). */
function fechaDeCorte(dias, hoy = new Date()) {
  const d = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

const FECHA_VALIDA = /^\d{4}-\d{2}-\d{2}$/;

async function main() {
  const args = leerArgs(process.argv.slice(2));
  if (args.ayuda) {
    console.log(AYUDA);
    return 0;
  }

  // Imports diferidos: `--help` no necesita base ni almacén.
  const { configS3, borrarObjeto } = await import("../src/lib/btf/s3.ts");
  if (!process.env.DATABASE_URL?.trim()) {
    console.error("Falta DATABASE_URL en el entorno: no hay base contra la que correr.");
    return 2;
  }
  const s3 = configS3();
  if (!s3) {
    console.error("Falta configurar el almacén (BTF_S3_ENDPOINT, BTF_S3_KEY, BTF_S3_SECRET, BTF_S3_BUCKET_ORIGINALES, BTF_S3_BUCKET_PREVIAS, BTF_PREVIAS_URL_PUBLICA).");
    return 2;
  }
  const { basePrisma: db } = await import("../src/lib/prisma-base.ts");

  const corte = fechaDeCorte(args.dias);
  console.log(`${args.aplicar ? "APLICAR" : "DRY-RUN"} · álbumes con fecha anterior a ${corte} (${args.dias} días)`);

  try {
    const albumes = (
      await db.btfAlbum.findMany({
        where: { fecha: { lt: corte, not: "" } },
        select: { id: true, slug: true, nombre: true, fecha: true },
        orderBy: { fecha: "asc" },
      })
    ).filter((a) => FECHA_VALIDA.test(a.fecha));

    let totalMedios = 0;
    let totalBytes = 0n;
    let fallidos = 0;

    for (const album of albumes) {
      // Pendientes = no marcados todavía como borrados.
      const medios = await db.btfMedio.findMany({
        where: { albumId: album.id, NOT: { subido: false, oculto: true } },
        select: { id: true, peso: true, claveOriginal: true, clavePrevia: true, claveMiniatura: true },
      });
      if (medios.length === 0) continue;
      const bytes = medios.reduce((s, m) => s + BigInt(m.peso), 0n);
      totalMedios += medios.length;
      totalBytes += bytes;
      console.log(`- ${album.fecha} · ${album.nombre} (${album.slug}) · ${medios.length} medios · ${bytes} bytes`);
      if (!args.aplicar) continue;

      const borrados = [];
      for (const m of medios) {
        const r = await Promise.all([
          m.claveOriginal ? borrarObjeto(s3.bucketOriginales, m.claveOriginal) : true,
          m.clavePrevia ? borrarObjeto(s3.bucketPrevias, m.clavePrevia) : true,
          m.claveMiniatura ? borrarObjeto(s3.bucketPrevias, m.claveMiniatura) : true,
        ]);
        if (r.every(Boolean)) borrados.push(m.id);
        else fallidos++;
      }
      if (borrados.length > 0) {
        // where acotado a ids concretos de este álbum (lección DB-1: nunca un update/delete masivo sin where).
        await db.btfMedio.updateMany({
          where: { albumId: album.id, id: { in: borrados } },
          data: { subido: false, oculto: true },
        });
      }
      console.log(`  borrados ${borrados.length}/${medios.length}`);
    }

    console.log(`Total: ${albumes.length} álbumes vencidos · ${totalMedios} medios pendientes · ${totalBytes} bytes`);
    if (!args.aplicar) console.log("Dry-run: no se borró nada. Para borrar, repetir con --aplicar.");
    if (fallidos > 0) {
      console.error(`${fallidos} medios no se pudieron borrar del almacén; quedan para la próxima corrida.`);
      return 1;
    }
    return 0;
  } finally {
    await db.$disconnect();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (e) => {
    console.error("btf-limpieza falló:", e instanceof Error ? e.message : e);
    process.exit(1);
  },
);
