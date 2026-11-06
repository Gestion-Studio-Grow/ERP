# QA fiscal · Homologación ARCA — 06/11/2026

Arnés: `QA_OUT=<carpeta fuera de git> node --import tsx scripts/qa/homologacion-arca-e2e.mjs` (base efímera + navegador
real a 390 px, PORT 3243). Genera capturas, un PDF por caso (`AAAA-MM-DD_caso-N-….pdf`) y `resumen.txt`.

**Modo: SIMULADO.** No hay certificado de homologación en el entorno (`ARCA_CERT_PEM`/`ARCA_KEY_PEM`,
`src/plugins/arca/afip/signer.ts:72`; por negocio, `TenantFiscalCredential`, `prisma/schema.prisma:402`), el CUIT de
prueba del código es inventado (`CUIT_DE_PRUEBA`, `src/plugins/arca/afip/prueba.ts:23`) y el proxy bloquea
`wsaahomo.afip.gov.ar` / `wswhomo.afip.gov.ar` (403). El modo se elige con `ARCA_MODO` (`src/plugins/arca/afip/factory.ts:64`).

**Resultado: 8/8 pasan** + `contrato-arca.test.ts` 50/50 contra el simulador SOAP.

| # | Caso | Resultado |
|---|---|---|
| 1 | B con chip | PASA · Factura B 00004-00000002, CAE STUB |
| 2 | A a un inscripto | PASA · Factura A 00004-00000001 |
| 3 | A sin régimen → B | PASA · «Falta un dato para la Factura A» → «Hacer Factura B» |
| 4 | C en Factoque | PASA · Factura C 00002-00000001 |
| 5 | Tope mensual | PASA · el 6.º bloqueado al abrir, «Ver los planes» |
| 6 | Rechazo de ARCA | PASA · «Rechazada por ARCA» + motivo, no gasta cupo (factura rechazada sembrada; el camino SOAP del rechazo, en el test de contrato) |
| 7 | Nota de crédito | PASA · NC C (tipo 13) autorizada, la C «Anulada con nota de crédito» |
| 8 | CAE, PDF y WhatsApp | PASA · CAE, wa.me con el texto, PDF 200 application/pdf con datos del emisor |

## Hallazgos (no bloquean)
- Factoque «Mis facturas» a 390 px: la columna «Estado» queda fuera de la vista (tabla `min-w-[560px]`,
  `src/app/facturita/app/facturas/page.tsx:37`).
- El motivo del rechazo muestra el código de ARCA adelante («10015: …»): `motivoLegible`
  (`src/lib/facturita-core.ts:308`) sólo saca rótulos que empiezan con letra.

## Falta para la homologación real
Certificado WSASS + delegación `wsfe` del dueño (guía: `docs/facturacion/guia-arca-a-produccion.md`), cargarlo en un
negocio de prueba y correr la factura de verificación desde Vercel (o habilitar los dos hosts de ARCA acá), y grabar
las respuestas reales (BACKLOG ENG-317). El arnés con cert presente se corta a propósito: todavía no siembra la
credencial cifrada del negocio.
