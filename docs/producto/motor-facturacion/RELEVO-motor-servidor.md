# Relevo · motor de facturación, lado del servidor (06/11/2026)

Sesión dueña: motor (createInvoice, facturarPagoMP, outbox). Orquestadora: `session_01BtqRUMRxtuioUdy9mdPkVn`.
Pantallas: otra sesión (B2, `session_01BtqRUMEBydQsYUkz5gMmjG`). No tocarlas.

## PR1: hecho (rama `claude/motor-facturacion`, apilada sobre #13)
- Reintentos con escalera de 1, 5, 15 y 60 min. Se detiene con ≥ 4 intentos y ≥ 24 h desde `createdAt` (`src/lib/arca-reintentos.ts`).
- Contrato de estados v1.1: el tope por defecto viene de la política de reintentos (`src/lib/facturacion/estado-comprobante.ts`).
- Clave de origen (`src/lib/facturacion/clave-origen.ts`):
  - Las claves `mp:payment:<id>` se guardan como `mp:<id>`.
  - `manual:` está frenada hasta aplicar `prisma/pending-gate2/cobro_facturado_clave_origen.sql` (Gate 2).
- Lock por serie: `src/lib/arca-reserva.ts` (toma) y `src/lib/facturacion/serie-numeracion.ts`. Prueba: `src/lib/arca-envios-serie-postgres.test.ts`.
- Candado por (negocio, clave) en `src/lib/facturacion/cobros-facturados.ts` (`tomarClaves`).
- Certificación: rechazada en la primera vuelta (C1, C2), las dos corregidas y vueltas a probar.
- Deuda: login ARCA en paralelo; contrato v1.2 candidato (detenido por configuración con ≥ 4 intentos sale como «revisión»).

## PR3 (fiscal): por hacer, rama nueva desde `claude/motor-facturacion`
1. **Letra automática según la condición de IVA:** ya existe `decidirComprobante` en el Core (la usa `serie-numeracion.ts`). Revisar que createInvoice o el despacho la usen siempre.
2. **`CondicionIVAReceptorId` obligatorio (RG 5616):** controlarlo en la validación local (`ComprobanteInvalidoError` = rechazo, no se reintenta).
3. **Umbral de identificación del consumidor final**, parametrizado: $417.288 en efectivo y $208.644 en otros medios. Ambos montos provisionales a confirmar. Hay una prueba previa: `src/lib/umbral-en-los-seis-caminos-postgres.test.ts`.
4. **Fecha ±5 días** (provisional a confirmar). La ventana ya se controla en el despacho (`fechaDeEnvio`); parametrizarla.
5. **NC por reembolso total o parcial:** usar `crearNotaDeCreditoInTx` (invoice-core) con la clave de origen `mp:refund:<id>`, que el CHECK ya admite, a través del libro de cobros. Va sin `appointmentId`.
6. **Contracargo:** se abre un caso, sin NC.
7. **Certificación adversarial fiscal** sobre el diff, en Postgres con RLS y dos negocios.

Informe ≤ 200 palabras a la orquestadora por PR. PR a `main` sin mergear, commit por pathspec.
