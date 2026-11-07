# Profe Matías — checklist para venderla «terminada y probada» (07/11/2026)

Base: `main` 1bd3399 contra el relevamiento del Key User (Factory-GSG
`00-ESTADO/reingenieria-2026-10/key-users/matias-profe.md`, hecho sobre b45d376f). Sólo lectura: no se construyó nada.

## Ya resuelto en main desde el relevamiento (Tanda 2A)
| Ítem | Dónde |
|---|---|
| E16 Reprogramar (mover sin cancelar) | `src/lib/padel/acciones.ts:341` `moverHorario` |
| E17 Lluvia: suspender el día y mover/cancelar las afectadas | `acciones.ts:643` `suspenderDia`, `:670` `bloquearRango` |
| E14/B4 Saldo a favor al cancelar pagada | `acciones.ts:20`, `:1026` `devolverSaldo` (estado ACREDITADO, sin migración) |
| E20 Clases sin cerrar | `acciones.ts:550` `cerrarPasada` |
| E24 Deuda y «Cobrar todo» | `acciones.ts:431`, `:763` |
| E26 Recordatorios en tanda | `acciones.ts:486` `recordarVarios` |
| E9 Alta/edición de alumno | `acciones.ts:695`, `:723` |
| B3 «no…» cancelaba sola | `whatsapp-cloud.ts:85-96` (sólo CANCELAR exacto) |
| B5 tope 60 · B7 barra · B8 rubro | sin `take: 60`; sin `fixed bottom` en `_aviso.tsx`; `padel-clases.ts:22` `["profe-padel"]` |
Pruebas del módulo: 131 casos en `src/lib/padel/*.test.ts`.

## Falta (orden recomendado)
| # | Qué | Gate 2 | Estimación |
|---|---|---|---|
| 0 | Confirmar que `20261015120000_modulo_padel_clases` está aplicada en Neon y el tenant dado de alta (no figura en `ESTADO-ACTUAL.md`) | lectura | 0,5 h (dueño/DBA) |
| 1 | **E4 Clubes**: tabla `PadelClub` + `clubId` nulable en `PadelClase` y `PadelDisponibilidad`; club en Agendar, Semana, turnero y WhatsApp | sí | 1 tanda (~1,5 d) |
| 2 | **E8 Clase fija semanal**: `PadelSerie` (alumno, día, hora, club, desde/hasta) + generador de las próximas N semanas que respeta bloqueos y choques; cancelar «sólo esta» o «toda la serie» | sí | 1 tanda (~2 d) |
| 3 | **E23 Paquetes 4/8 clases**: `PadelPaquete` (comprado, usadas, vence, pago) que paga la clase al darla; deuda y link del alumno lo muestran | sí (plata → certificación) | 1 tanda + cert (~2,5 d) |
| 4 | **E7 Grupal con participantes**: hoy es sólo `personas` 2–4 (`acciones.ts:932`), un solo alumno paga; falta lista de integrantes y cobro por persona | sí | ~1,5 d |
| 5 | B1 alumno preelegido en Agendar y B2 pedido vencido en «Pagar» — **a verificar** en `AgendarHoja.tsx` y `alumno/[token]/page.tsx` (el form cambió de archivo) | no | 0,5 d |
| 6 | Marca de Matías (logo/paleta) en `src/lib/padel/marca.ts` — autorización ya registrada (README) | no | 0,5 d cuando lleguen los archivos |
| 7 | Datos reales provisionales (precios, alias, celular, clubes) con Matías | no | llamada |
| 8 | UAT clic por clic del profe + alumno (E1–E36) en un base local con seed y QA de Matías en su teléfono | no | 1 d |

Total estimado: ~9–10 días de trabajo en 4–5 tandas; las migraciones 1–4 conviene escribirlas juntas y
llevarlas en un solo Gate 2. WhatsApp Business (E35) queda fuera de «terminada»: es opcional y con costo.
