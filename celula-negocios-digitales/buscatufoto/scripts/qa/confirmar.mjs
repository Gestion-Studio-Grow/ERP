import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const B='http://localhost:3100';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:{width:1280,height:900}, locale:'es-AR'});
const c=await ctx.newPage(); const errs=[]; c.on('pageerror',e=>errs.push(e.message));
const log=(...a)=>console.log('·',...a);
const pedidos=(pg)=>pg.evaluate(()=>new Promise(r=>{const q=indexedDB.open('buscatufoto'); q.onsuccess=()=>{const t=q.result.transaction('pedidos').objectStore('pedidos').count(); t.onsuccess=()=>r(t.result)}}));
try {
  await c.goto(B+'/a/10k-costanera-muestra'); await c.waitForFunction(()=>document.querySelectorAll('img[src^="blob:"]').length>=18,null,{timeout:60000});
  // 1) continuar → volver → continuar no cobra
  await c.getByRole('button',{name:'Agregar'}).first().click();
  await c.getByRole('button',{name:/Ver carrito/}).click();
  const d=c.locator('dialog[open]');
  await d.getByRole('button',{name:/Continuar al pago/}).click(); await c.waitForTimeout(200);
  await c.getByLabel('Tu nombre').fill('Prueba'); await d.getByLabel('Email').fill('p@qa.test');
  await d.getByRole('button',{name:/Volver al carrito/}).click(); await c.waitForTimeout(200);
  await d.getByRole('button',{name:/Continuar al pago/}).click(); await c.waitForTimeout(800);
  log('FIX1 pedidos tras continuar/volver/continuar:', await pedidos(c), '| sigue en pago:', await c.getByLabel('Tu nombre').isVisible());
  // 3) cambio de precio durante el pago
  const p=await ctx.newPage();
  await p.goto(B+'/panel'); await p.getByRole('button',{name:/cuenta de muestra/}).click(); await p.waitForTimeout(1500);
  await p.getByRole('link',{name:/10K de la Costanera/}).first().click(); await p.waitForTimeout(600);
  await p.getByRole('link',{name:'Precios'}).last().click(); await p.waitForTimeout(600);
  await p.getByLabel('Precio por foto (ARS)').fill('4000');
  await p.getByRole('button',{name:/^Guardar/}).first().click(); await p.waitForTimeout(800);
  log('panel precios:', (await p.locator('[role=status],[role=alert]').allInnerTexts()).join(' / ').slice(0,150));
  await c.bringToFront(); await c.waitForTimeout(800);
  log('FIX3 aviso en pago:', (await d.locator('[role=alert]').allInnerTexts()).join(' / ').slice(0,200), '| botón:', await d.getByRole('button',{name:/^Pagar/}).innerText());
  await d.getByRole('button',{name:/^Pagar/}).click(); await c.waitForTimeout(800);
  log('FIX3 tras pagar con total viejo → pedidos:', await pedidos(c), '|', (await d.locator('[role=alert]').allInnerTexts()).join(' / ').slice(0,200));
  const acept=d.getByRole('button',{name:/Aceptar el total nuevo/}); if (await acept.isVisible().catch(()=>false)) await acept.click();
  log('botón ahora:', await d.getByRole('button',{name:/^Pagar/}).innerText());
  await d.getByRole('button',{name:/^Pagar/}).click(); await c.waitForURL(/pedido/,{timeout:10000});
  log('FIX3 pagó tras aceptar → pedidos:', await pedidos(c), '|', (await c.locator('main').innerText()).match(/Escribile[^\n]*/)?.[0]);
  // 4) decimales
  await p.bringToFront();
  const cant=p.getByLabel('Cantidad').first(); await cant.fill('1.5');
  await p.getByRole('button',{name:/^Guardar/}).first().click(); await p.waitForTimeout(600);
  log('FIX4 cantidad 1.5:', (await p.locator('[role=alert]').allInnerTexts()).join(' / ').slice(0,160));
  await p.getByRole('button',{name:/Descartar/}).first().click().catch(()=>{});
  // 7) renombrar cupón no borra usos (pagar con LLEGADA primero)
  await c.goto(B+'/a/10k-costanera-muestra'); await c.waitForTimeout(1500);
  await c.getByRole('button',{name:'Agregar'}).first().click(); await c.getByRole('button',{name:/Ver carrito/}).click();
  await c.locator('#cupon-comprador').fill('LLEGADA'); await c.getByRole('button',{name:'Aplicar'}).click();
  await d.getByRole('button',{name:/Continuar al pago/}).click(); await c.getByLabel('Tu nombre').fill('Cupon'); await d.getByLabel('Email').fill('c@qa.test');
  await d.getByRole('button',{name:/^Pagar/}).click(); await c.waitForURL(/pedido/);
  await p.getByRole('link',{name:'Cupones'}).last().click(); await p.waitForTimeout(800);
  const usosAntes=(await p.locator('main').innerText()).match(/[^\n]*uso[^\n]*/gi)?.slice(0,4).join(' / ');
  const cod=p.getByRole('textbox',{name:'Código',exact:true}).first();
  await cod.fill('LLEGADAX'); await p.getByRole('button',{name:'Guardar cupones'}).click(); await p.waitForTimeout(600);
  await cod.fill('LLEGADA'); await p.getByRole('button',{name:'Guardar cupones'}).click(); await p.waitForTimeout(600);
  const usos=await p.evaluate(()=>new Promise(r=>{const q=indexedDB.open('buscatufoto'); q.onsuccess=()=>{const t=q.result.transaction('albumes').objectStore('albumes').index('slug').get('10k-costanera-muestra'); t.onsuccess=()=>r(t.result.cupones.map(x=>x.codigo+':'+x.usos).join(','))}}));
  log('FIX7 usos tras renombrar ida y vuelta:', usos, '| texto:', usosAntes);
  // 5) borrar álbum con ventas
  await p.getByRole('link',{name:'Datos'}).last().click(); await p.waitForTimeout(500);
  p.on('dialog',dl=>dl.accept());
  await p.getByRole('button',{name:/Eliminar|Borrar/}).last().click(); await p.waitForTimeout(500);
  const conf=p.locator('dialog[open]').getByRole('button',{name:/Eliminar|Borrar/}); if (await conf.count()) await conf.last().click();
  await p.waitForTimeout(800);
  log('FIX5 borrar álbum con ventas:', (await p.locator('[role=alert]').allInnerTexts()).join(' / ').slice(0,200), '|', p.url());
  // 2) marca vacía
  await p.goto(B+'/panel/marca'); await p.waitForTimeout(1000);
  await p.getByRole('textbox',{name:'Texto',exact:true}).fill('');
  await p.getByRole('button',{name:'Guardar marca'}).click(); await p.waitForTimeout(500);
  log('FIX2 marca vacía:', (await p.locator('[role=alert]').allInnerTexts()).join(' / ').slice(0,200));
  log('FIX2 slider opacidad min:', await p.getByLabel('Opacidad').getAttribute('min'));
} catch(e){ log('ERROR', e.message.split('\n')[0]); }
log('pageerrors', errs);
await b.close();
