# QA · Facturador UX v2 — 06/11/2026

Arnés: `node --import tsx scripts/qa/facturador-ux-v2-e2e.mjs` (base efímera + ARCA simulado, PORT 3242).
Negocio A «Estética Luz» (vertical servicios, RI, 3 servicios); negocio B Factoque (monotributo).
Controles: consola, scroll horizontal, toques < 44 px (24 a 1366), vocabulario interno, callejón.

**Resultado: 15/15 OK** (390 px en todo; 1366 en login, puesta a punto, emitir B y post-emisión, Factoque C).

| Paso | Resultado | Captura |
|---|---|---|
| 1 Entrar (login) | OK 390 · 1366 | `*-1-entrar-al-panel.png` |
| 2 Puesta a punto pendiente → completar | OK **PARCIAL**: «Te faltan 2 pasos» (Factura A: Falta) → Soporte carga «A común» en la consola → Factura A: Listo, «Te falta 1 paso». Queda la conexión con ARCA (falta certificado): con ARCA simulado **no se llega a «Listo para facturar»**; el botón de la cabecera lleva al paso. | `390-2a-…`, `390-2b-…`, `*-2c-…` |
| 3 B a consumidor final con chip | OK: el chip completa detalle y precio (24.200), sale B con CAE | `*-3-B-a-consumidor-final-con-un-chip.png` |
| 4 A a RI con régimen | OK | `390-4-A-a-un-responsable-inscripto.png` |
| 5 C desde Factoque | OK 390 · 1366 | `*-5-C-desde-Factoque-monotributo.png` |
| 6 A sin régimen | OK: «Falta un dato para la Factura A», Emitir bloqueado, «Avisar a mi contador» y «Hacer Factura B» → sale B | `390-6-…png` |
| 7 Tope 5/mes | OK: con 5 emitidas el 6.º no se puede intentar: aviso arriba («Llegaste al tope…», «Las que ya emitiste siguen valiendo»), Emitir deshabilitado con el motivo, «Ver los planes» | `390-7-tope-mensual-el-6.png` |
| 8 Post-emisión | OK: CAE visible; WhatsApp `https://wa.me/?text=Hola, te paso la Factura B N.º …`; con CAE simulado no se ofrece PDF (se explica); con CAE de 14 números y datos del emisor: 200 `application/pdf` (`%PDF`), y «Descargar PDF» en el detalle | `*-8-post-emisión-….png` |

## Callejones sin salida
- Ninguno en pantalla con ARCA simulado.
- **Latente (producción):** en el resultado del panel `/admin`, con CAE real y SIN razón social/domicilio del emisor, «PDF» abre la ruta que responde **409 en texto plano**. Factoque sí pide los datos (`pdf.faltanDatos`); `EmitirDelPanel.tsx:36` no lo pasa. Sólo reportado.

## Arreglos de UI (rebuild + re-corrida verde)
- `FacturaDePrueba.tsx:64`: el botón «Emitir un comprobante de verificación…» no hacía salto de línea → 39 px de scroll horizontal a 390.
- `ObtenerAsistencia.tsx:26`: «¿Te trabaste? Obtené asistencia» medía 43 px → `py-3`.
- `AsistenteArca.tsx:44,238`: el cliente veía detalles internos del pase («CAE de homologación», «modo stub», «Avisale al dueño de GSG») → para las condiciones que resuelve nuestro equipo, «Esto lo resuelve nuestro equipo cuando pedís el pase.»

## Menores (no bloquean)
- A 390 la pestaña «Puesta a punto» queda fuera de la vista en la tira de pestañas (hay que deslizar).
- El número grande corta «00004-/00000002» en dos líneas a 390.
