> **Decisión del dueño (17/11/2026, vía ORQ-007):** opción A (llave en la base, firmada y auditada; alta sin tocar Vercel) y la C después. Donde §3 y §5 difieren, manda §5 (correcciones del refutador). Diseño, sin código.

# GSG-FACT-006 · Facturación real por negocio sin tocar Vercel en cada alta

Pregunta del dueño (14/11): «Por cada alta vamos a tener que modificar vercel?»
**Respuesta corta:** hoy sí, sólo para pasar un negocio a facturar en real (ARCA_REAL_TENANTS + redeploy).
Para que el negocio abra, entre y facture en pruebas: no. Base: `main` @ c15c3f7. Sólo análisis, sin código.

## 1. Qué se lee y dónde

| Variable | Dónde se lee | Qué decide |
|---|---|---|
| `ARCA_INVOICING_ENABLED` | `src/lib/fiscal.ts:30`, `src/lib/flags/facturacion.ts:183`, `src/lib/fiscal/guarda-simulado.ts:29`, `src/app/api/ready/motor-arca.ts:101`; corte del cron `src/app/api/cron/arca-outbox/route.ts:37-39` | GLOBAL: si se emite/drena el outbox. Off = nadie habla con ARCA (ni el cron toca la base). Interruptor general que ya existe. |
| `ARCA_MODO` | `modoDesdeEnv` (`src/plugins/arca/afip/factory.ts`) | GLOBAL: techo stub / homologación / real. |
| `ARCA_REAL_TENANTS` | `src/lib/fiscal/modo-del-negocio.ts:54-71` (parseo); se usa en el despacho `src/lib/arca-dispatch.ts:317` (pantallas) y `:388` (emisión) y en la ficha del pase `src/lib/operador/pase-a-real.server.ts:197` | POR NEGOCIO, «segunda llave»: un negocio marcado real (`Tenant.arcaHomologacion=false`, `prisma/schema.prisma:378`) sólo emite en real si su slug está en la lista **y** tiene certificado de producción (`modoDelNegocio`, `modo-del-negocio.ts:74-109`). Si falta, falla cerrado: no emite nada. |

Fuera de la base, por negocio:
- **Subdominio `<slug>.gsgapp.com.ar`: no hace falta tocar Vercel.** `extractSubdomain` (`src/lib/tenant.ts:42-55`) lo saca del host con `APP_BASE_DOMAIN` (global, una sola vez) y el comodín `*.gsgapp.com.ar` está en el proyecto (`docs/runbooks/facturacion/publicacion.md:88`, verificado el 05/11). Eso sí: `docs/runbooks/factoque/ALTA-WEB.md:42` todavía lo marca «provisional a confirmar»: hay que alinear ese doc.
- **`TENANT_HOST_MAP`** (`src/lib/tenant.ts:67`): sólo para dominios propios/ajenos (p. ej. `facturita-gsg.vercel.app`). Un alta self-serve en el subdominio no lo necesita.
- **Certificados:** por negocio, cifrados en la base (`TenantFiscalCredential`, ADR-066, `FISCAL_MASTER_KEY` global). Nada en Vercel.
- **Cron:** uno solo, global (`vercel.json` → `/api/cron/arca-outbox`), recorre todos los negocios. Nada por alta.

Conclusión: **la única intervención en Vercel por negocio es `ARCA_REAL_TENANTS` + redeploy.**

## 2. «Facturación real» en /operador hoy

Tarjeta `PaseARealCard` (`src/app/operador/(console)/tenants/[id]/page.tsx:818`), núcleo puro `src/lib/operador/pase-a-real.ts:1-30`, seis condiciones (`precondicionesDelPase`, `:262`):
1. CUIT válido. 2. Punto de venta 1–99999. 3. Certificado de PRODUCCIÓN del mismo CUIT (delegación no alcanza).
4. Condición IVA que emite (RI/Monotributo/Exento). 5. **`ARCA_MODO=real` y slug en `ARCA_REAL_TENANTS`** (`precondicionDeModo`, `:244-260`). 6. Cero comprobantes de la etapa de pruebas (pendientes, en outbox o autorizados).
Además: tipear el slug, CH sólo con el dueño (`:348`, `requiereOkDelDuenio`), huella de la ficha; una fila de AuditLog por cambio. «Volver a pruebas» nunca se bloquea.
En Factoque, el cliente no pasa solo: el asistente (`src/lib/fiscal/asistente-arca.ts:100-104`) deja **pedir** el pase cuando sus condiciones propias están; lo aplica un operador.
Relación con la variable: la condición 5 lee la variable; y aun después del pase, el despacho la vuelve a exigir en cada emisión (`arca-dispatch.ts:388`). Hoy hay **dos** pasos manuales por negocio: el pase del operador y la variable del dueño + redeploy.

## 3. Propuesta: la segunda llave pasa a la base

**Qué es la habilitación.** Un registro «este negocio está habilitado a facturar en real», con quién (`operator:<nombre>`), cuándo, y una foto de lo que se verificó (CUIT, PV, huella del certificado de producción). Lo escribe SÓLO la action del pase a real, en la misma transacción que `arcaHomologacion=false`, después de `requireOperator()` y de las 6 condiciones (la 5 pasa a ser sólo «plataforma en real»). CH: sólo el dueño, como hoy.

**Dónde vive (sin migración, recomendado):** en AuditLog, con el patrón ya probado de los interruptores (`src/cambios/interruptores.ts:9-20`): entity `ArcaReal`, acción `arca-real.habilitar` / `arca-real.revocar`, canal `operador`, manda la última fila válida; `audit()` rechaza esa entidad desde la app del negocio (como `Interruptor`/`CierreDiario`). Sin tabla nueva → **no es Gate 2**.

**Firma de la fila (endurecimiento clave).** El riesgo nuevo es que hoy la segunda llave vive en otro sistema (Vercel) que quien tiene acceso a la base no puede tocar. Para no perder esa separación: la fila lleva un HMAC sobre `tenantId|slug|CUIT|huella del certificado|fecha` con una clave del servidor (variable nueva, una sola vez, o derivada de `FISCAL_MASTER_KEY` con etiqueta propia — provisional a confirmar con el dueño, es un secreto → §C). El despacho verifica el HMAC: una fila escrita a mano en la base no habilita nada, y si cambian el certificado o el CUIT la habilitación cae sola (hay que volver a pasar).

**Regla en el despacho (`modoDelNegocio`):** `habilitado = slug ∈ ARCA_REAL_TENANTS  O  habilitación en base vigente (última fila = habilitar, HMAC válido, CUIT y certificado iguales a los actuales)`. El núcleo puro recibe un booleano en vez de la lista.

**Re-chequeo en la emisión.** Además del HMAC, el despacho exige en cada emisión lo barato de las 6 condiciones: CUIT válido, PV, condición IVA, certificado de producción del mismo CUIT (los simulados ya se cuentan, `arca-dispatch.ts:398`). La condición 6 completa queda en el pase (es una consulta cara).

**Transición sin cortar a CH.** Unión (variable O base): CH sigue habilitado por la variable el día del deploy; ningún negocio pierde nada. Después, el dueño pasa a CH por la base desde la consola y, cuando quiera, vacía la variable. La variable queda sólo como lista heredada; el interruptor general es el que ya existe (`ARCA_INVOICING_ENABLED=false` o `ARCA_MODO≠real`).

**Apagar un negocio en un incidente (sin deploy):** en la ficha, «Revocar facturación real» (fila `revocar`, sin condiciones, como «Volver a pruebas»). Efecto inmediato en el próximo despacho: el negocio queda marcado real sin llave → `modoDelNegocio` falla cerrado y no emite nada (no cae a pruebas). Los envíos del outbox reintentan dentro de su ventana de 24 h; si el incidente dura más, «Volver a pruebas». Si el negocio está en la variable, revocar en la base NO alcanza: hay que sacarlo de la variable (por eso conviene vaciarla pronto). Todos a la vez: `ARCA_INVOICING_ENABLED=false` (requiere redeploy; sigue siendo §C del dueño).

**Si alguien con acceso a la base prende la llave sin cumplir:** sin la clave del HMAC no puede fabricar una habilitación válida. Si además pone `arcaHomologacion=false` a mano, el despacho sigue exigiendo techo real + certificado de producción de ese CUIT + re-chequeo → sin certificado de producción emitido por ARCA no hay CAE real posible. Quien tiene base Y la clave (o el servidor) ya podía todo antes; no empeora.

## 4. Opciones

| | Qué | Costo | Riesgo |
|---|---|---|---|
| **A (recomendada)** | Habilitación en AuditLog (patrón interruptores) + HMAC + unión con la variable + re-chequeo en la emisión + botón Revocar. Escrita por el pase del operador. | ~1,5 sesiones (1 construcción Opus alto + certificación adversarial, es plata/seguridad). Sin Gate 2. Un secreto nuevo, una vez (§C). | Bajo-medio: AuditLog no tiene unicidad → la regla «última fila válida» tiene que ser determinista (orden por `createdAt, id`). Lectura extra por emisión (una consulta indexada por tenant+entity). |
| B | Columnas en `Tenant` (`arcaRealHabilitadoAt`, `arcaRealHabilitadoPor`, `arcaRealFirma`) + fila de AuditLog. | ~1,5–2 sesiones + **Gate 2** (migración aditiva) + coordinar el orden deploy/migración. | Medio: Prisma lee todas las columnas en un `findUnique` sin `select`; si el código sale antes que la migración, se rompe todo lo que lee `Tenant` (también CH). Más limpio a la larga. |
| C (complemento, decisión del dueño) | Sobre A: que el pedido de pase del cliente de Factoque se aplique solo cuando las 6 condiciones dan verde (sin operador). Es lo que pide literalmente «alta sin intervención». | +1 sesión. | Promesa fiscal sin humano: requiere OK registrado del dueño. |
| D (descartada) | Escribir `ARCA_REAL_TENANTS`/Edge Config por API de Vercel desde el alta. | ~1 sesión. | Sigue dependiendo de Vercel por alta; token de Vercel en la app = superficie nueva. |
| E (descartada) | Borrar la segunda llave: alcanza con pase + certificado. | 0,5 sesión. | Pierde la capa de consentimiento y la defensa contra quien tiene la base. |

**Recomendación:** A ahora (saca a Vercel del alta, sin Gate 2); C como decisión separada del dueño.
Lo IRREVERSIBLE que se eleva: el secreto del HMAC (Vercel, una vez), vaciar `ARCA_REAL_TENANTS` y pasar CH por la base (dueño), la decisión de C.

## 5. Refutador (gsg-certificador, Opus alto) y correcciones incorporadas a A

Con la unión, CH NO se corta el día del deploy. Pero:
**Bloqueantes (el diseño se corrige):**
1. No hay camino para firmar a CH: `decidirPase` da «sin-cambios» si ya está en real (`pase-a-real.ts:345-347`) y la condición 6 lo traba siempre (`pase-a-real.server.ts:96-120`). → Acción nueva «Firmar habilitación» para negocios YA en real (CH: sólo el dueño), con las condiciones 1-5, sin la 6; y un chequeo previo a vaciar la variable que liste negocios en real sin fila válida.
2. La revocación se deshace con sólo acceso a la base: copiar una fila `habilitar` vieja con fecha futura. → El HMAC firma `accion|id de fila|createdAt|tenantId|slug|CUIT|huella cert|kid`; se rechazan fechas futuras; las revocaciones también se firman.
**A corregir:**
3. «Volver a pruebas» no revoca (`pase-a-real.server.ts:290`). → Volver a pruebas escribe `revocar` en la misma transacción; la habilitación queda atada al pase.
4. Modo que falla cerrado → el envío queda DETENIDO, no reintenta (`arca-reintentos.ts:126`, `arca-dispatch.ts:772`). Corrijo §3: revocar detiene los envíos; el cliente puede renovar su certificado (`asistente-arca.server.ts:171`) y eso cae la habilitación → aviso en ficha/monitor, re-firma, y relanzar detenidos.
5. Sumar `ArcaReal` a las entidades que la purga no borra (`audit-retention.ts:31`), si no a los 18 meses CH pierde la llave.
6. No derivar de `FISCAL_MASTER_KEY` (rota con `kekId`): clave propia con su id en la fila; `/api/ready` avisa si falta.
**Menores:** una sola función de servidor para «habilitado» (hoy 4 lugares: `arca-dispatch.ts:317,:388`, `pase-a-real.server.ts:197`→`facturita-arca.ts:33`, `arca-pruebas-actions.ts:104`); `monitor-core.ts:253` debe reflejar la revocación; revocar CH pide el dueño.
**No pudo romper:** replay entre negocios, firma por delegación, renombre de slug, `audit()` desde la app del negocio.

**Costo revisado de A con correcciones:** ~2 sesiones (1 construcción Opus alto + certificación adversarial + 1 vuelta de corrección). Sigue sin Gate 2; §C: la clave nueva (una vez) y vaciar la variable.
