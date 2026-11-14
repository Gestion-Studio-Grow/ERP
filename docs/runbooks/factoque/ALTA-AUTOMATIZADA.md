# Alta automatizada de un negocio Factoque

Orden del dueño 08/11/2026: el alta de un negocio Factoque deja de hacerse a mano en `/operador`.
Código: `scripts/factoque/alta-negocio.mts` (CLI) · `src/lib/factoque/` (lógica y tests).

## Comando

```bash
OPERATOR_DATABASE_URL=… RESEND_API_KEY=… RESEND_FROM_EMAIL=… \
node --import tsx scripts/factoque/alta-negocio.mts \
  --nombre "Almacén Don Pepe" --slug don-pepe --cuit 20-12345678-6 \
  --condicion-iva monotributo --punto-venta 3 --email titular@dominio.com \
  [--titular "Nombre y apellido"] [--operador quien-corre]
```

| Flag | Qué va |
|---|---|
| `--nombre` | nombre del negocio |
| `--slug` | nombre corto: también es el subdominio (`<slug>.gsgapp.com.ar`) |
| `--cuit` | 11 números (con o sin guiones); se valida el dígito verificador |
| `--condicion-iva` | `monotributo`, `ri` (responsable inscripto) o `exento` |
| `--punto-venta` | el que ARCA habilitó para ese CUIT (1 a 99999) |
| `--email` | el del titular: es su usuario |

Base: `OPERATOR_DATABASE_URL` (o `DATABASE_URL`). Correrlo contra producción es **Gate de la orquestadora/dueño**, no de
quien construye.

## Qué hace (una transacción: queda todo o nada)

1. Crea el negocio con la fábrica de ADR-019 (`provisionTenant`): vertical `facturita`, módulos `arca` + `clients`,
   subdominio = slug, ARCA en **pruebas** (`arcaHomologacion = true`).
2. Graba CUIT, punto de venta (con el candado: un CUIT no repite punto de venta entre negocios) y condición frente al IVA.
3. Crea al titular como `OWNER` (trae `billing:manage`) con una contraseña provisoria generada y lo marca
   `mustChangePassword`: en el primer ingreso el login lo manda a elegir una propia.
4. Audita (`factoque.alta` + `fiscal.*`), sin la contraseña.
5. Manda el **mail aparte** al titular con dirección, usuario y contraseña provisoria (Resend, `src/lib/notifications.ts`).

**Idempotente:** re-correrlo no duplica. Si el slug existe, completa lo que falte (CUIT, punto de venta, IVA, módulos,
dirección, titular). Si un dato ya cargado no coincide, **se niega** y no toca nada: eso se corrige desde la ficha.

## La contraseña

Nunca se imprime, ni va a logs, auditoría, commits ni mensajes. Hasta que se entrega queda en
`~/.gsg/factoque-claves/<slug>.clave` (0600; otra carpeta con `FACTOQUE_CLAVES_DIR`), que se borra sola cuando el mail
sale. El script imprime sólo: slug, URL, usuario y `contraseña: enviada | pendiente de envío (motivo) | sin cambios`.

- **Pendiente porque el mail no salió** (sin `RESEND_*`): re-correr el mismo comando cuando esté, o entregarla a mano y
  después `node --import tsx scripts/factoque/alta-negocio.mts --confirmar-envio --slug <slug>` (borra el archivo).
- **Pendiente por la columna `mustChangePassword`**: si la base no tiene `prisma/pending-gate2/MustChangePassword.sql`
  aplicado, la provisoria no obligaría a cambiarse → **no se manda**. Aplicarla es Gate 2 (dueño); después, re-correr.

## Qué queda para el dueño / el titular

Sólo ARCA con **clave fiscal**, que la hace el titular (o su estudio) en arca.gob.ar: habilitar el punto de venta y
generar el certificado. Después, en la ficha del negocio: cargar el certificado («Paso 3»), «Verificar con ARCA» y el
«Pase a facturación real» (`docs/runbooks/arca/PRUEBA-CLIENTE-NUEVO.md`).
