# Pedido del GSG Lab al frente de Facturita — Ingresos Brutos discriminado en CABA

**Fecha dura:** 1/1/2027 (AGIP Res. 339/2026, Boletín Oficial CABA 8/9/2026, prórroga de Res. 169/2026 y 312/2026:
https://boletinoficial.buenosaires.gob.ar/normativaba/norma/875535).

**Qué exige (según prensa; leer la norma antes de construir):** discriminar Ingresos Brutos en tickets y facturas a
consumidor final emitidos en CABA. A qué contribuyentes alcanza (¿monotributistas? ¿régimen simplificado de IIBB?) y el
texto exacto de la leyenda: **[A VALIDAR con la norma y el contador]**.

**Qué hay hoy en Facturita (origin/main, 04/11/2026):** el emisor carga su número de IIBB
(`src/app/facturita/app/cuenta/DatosParaFacturas.tsx:73-92`) y se graba en `arcaIibb`
(`src/lib/facturita-actions.ts:92-100, 137`), que el PDF imprime. **No hay** leyenda ni importe de IIBB discriminado
para consumidor final en CABA.

**Por qué importa al negocio:** es el gancho con fecha más cercana para pasar usuarios gratis al plan Comerciante
Solo (ciclo del lab 04/11/2026, `CICLO-2026-11-04.md`). Una campaña «Facturita ya está lista para el 1/1» sólo se
puede hacer si la función existe y está certificada.

**Riesgo:** fiscal (comprobantes) → Gate de Excelencia + certificación adversarial sobre el diff. Sin migración si se
puede derivar del domicilio fiscal; si hace falta campo nuevo, migración aditiva sin aplicar (Gate 2).
