# Porción 3 (25/09): «Números del negocio» en el celular

Cambio: src/app/admin/(dashboard)/inicio/CifraDeRenglon.tsx (nuevo; la cifra que antes dibujaba
NumeroDeRenglon dentro de InicioRenglon.tsx, igual en la PC, con tope max-lg:max-w-40 + text-balance
en el celular). InicioRenglon.tsx: NumeroDeRenglon carga el número y dibuja <CifraDeRenglon>.
Helper compartido: src/test/navegador-componentes.ts (Chromium + CSS real + esbuild), usado por
cifra-de-renglon-celular.test.ts y tabla-negocios-celular.test.ts.

Comandos y resultado:
- node --import tsx --test inicio/cifra-de-renglon-celular.test.ts operador/(console)/tabla-negocios-celular.test.ts
  → 6/6 verde (numeros-celular-test.txt)
- node --import tsx --test inicio/*.test.ts operador/(console)/negocios-core.test.ts src/lib/buscador/*.test.ts
  → 78/78 verde, 0 saltados (incluye buscar-cajero-postgres en base efímera) (regresion-porcion-3.txt)
- npx tsc --noEmit → 2 errores, ninguno en archivos de este frente (tsc-porcion-3.txt: src/lib/caja/un-solo-esperado-*)
- npx eslint (archivos de este frente) → 0

Medido a 390 px (Chromium, CSS real): con tope, el nombre de la app ocupa 182 px de 358 con la frase
de la caja cerrada y con un motivo largo real; sin tope el motivo «Todavía no subiste el extracto del
banco de septiembre» dejaba el nombre en menos del 45 % (el test lo exige y lo comprueba quitando el tope).
En la PC (1440) la cifra sigue midiendo 17rem (272 px).
