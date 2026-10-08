import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const B='http://localhost:3100', OUT='/home/user/gsg-buscatufoto/docs/qa', A='/tmp/claude-0/qa-archivos';
const VP = process.argv[2]==='390' ? {width:390,height:844} : {width:1440,height:900};
const tag = process.argv[2]==='390' ? '390' : 'esc';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome'});
const ctx=await b.newContext({viewport:VP, locale:'es-AR', acceptDownloads:true}); const p=await ctx.newPage();
const errs=[]; p.on('pageerror',e=>errs.push(e.message));
const log=(...a)=>console.log('·',...a);
const shot=(n)=>p.screenshot({path:`${OUT}/${tag}-${n}.png`});
async function dump(){ console.log('URL',p.url()); console.log('BTNS',(await p.locator('button:visible, a:visible').allInnerTexts()).map(t=>t.trim()).filter(Boolean).join(' | ').slice(0,1500)); }
try {
  await p.goto(B+'/panel',{waitUntil:'networkidle'});
  await p.getByLabel('Tu nombre o el de tu estudio').fill('Ana QA Fotos');
  await p.getByLabel('Email').fill(`ana-${tag}@qa.test`);
  await p.getByRole('button',{name:'Crear mi cuenta'}).click();
  await p.waitForTimeout(800); log('cuenta creada'); await shot('01-panel');
  await p.getByRole('link',{name:/Crear álbum/}).first().click(); await p.waitForURL(/nuevo/);
  await p.getByLabel('Nombre del álbum').fill('Torneo QA 2026');
  await p.getByLabel('Precio por foto (ARS)').fill('2000');
  await p.getByRole('button',{name:/Crear (el )?álbum/}).click();
  await p.waitForURL(/albumes\/(?!nuevo)/); await p.waitForTimeout(500); log('álbum creado', p.url());
  const albumUrl=p.url();
  await p.locator('input[type=file]').first().setInputFiles(['QA_01_d512.jpg','QA_02_d512-d88.jpg','QA_03_d88.jpg','QA_04_d9001.jpg','IMG_4021.jpg','clip_d512.webm'].map(f=>A+'/'+f));
  await p.waitForFunction(()=>/6 de 6|Listo|subid/i.test(document.body.innerText),null,{timeout:60000}).catch(()=>{});
  await p.waitForTimeout(2500); await shot('02-fotos-subidas');
  log('dorsales visibles', (await p.locator('input[aria-label="Dorsales en esta foto"], input[placeholder="Ej.: 73, 4471"]').evaluateAll(es=>es.map(e=>e.value))).join(' / '));
  // etiquetar IMG_4021 a mano con 512
  const campos=p.locator('input[placeholder="Ej.: 73, 4471"]'); const n=await campos.count(); log('campos dorsal', n);
  for (let i=0;i<n;i++){ if((await campos.nth(i).inputValue())===''){ const card=campos.nth(i); await card.fill('512'); await card.press('Enter'); log('etiquetado a mano #'+i); break; } }
  await p.waitForTimeout(600);
  // marca de agua: miniaturas
  const imgs=await p.locator('img[src^="blob:"]').count(); log('miniaturas blob', imgs);
  // guardar el dorsal puesto a mano

  log('sin dorsal tras guardar:', await p.getByRole('button',{name:/Sin dorsal/}).innerText());
  // cupón con 1 uso
  await p.getByRole('link',{name:'Cupones'}).last().click().catch(()=>p.getByRole('tab',{name:'Cupones'}).click());
  await p.waitForTimeout(400);
  await p.getByRole('button',{name:/Agregar cupón/}).click();
  await p.getByRole('textbox',{name:'Código',exact:true}).last().fill('QA10');
  await p.getByRole('textbox',{name:'Descuento (%)'}).last().fill('10');
  await p.getByRole('textbox',{name:'Usos máximos'}).last().fill('1');
  await p.getByRole('button',{name:'Guardar cupones'}).click(); await p.waitForTimeout(600);
  await shot('03-cupon');
  // publicar
  await p.getByRole('switch',{name:/publicar|Publicado/i}).click(); await p.waitForTimeout(1000);
  log('publicado:', await p.getByRole('switch',{name:/publicar|Publicado/i}).isChecked());
  // compartir
  await p.getByRole('link',{name:'Compartir'}).last().click().catch(()=>{}); await p.waitForTimeout(800);
  const enlace = await p.locator('input[readonly]').first().inputValue().catch(()=>null);
  log('enlace público', enlace); await shot('04-compartir');
  // ---------- comprador ----------
  const c=await ctx.newPage(); c.on('pageerror',e=>errs.push('comprador: '+e.message));
  const peticiones=[]; c.on('request',r=>peticiones.push(r.url()));
  await c.goto(enlace,{waitUntil:'networkidle'}); await c.waitForTimeout(800);
  log('álbum público h1:', await c.locator('h1').innerText());
  await c.screenshot({path:`${OUT}/${tag}-05-album-publico.png`});
  await c.locator('input[inputmode=numeric]').first().fill('512'); await c.waitForTimeout(500);
  log('resultado búsqueda:', (await c.locator('[aria-live]').allInnerTexts()).join(' / ').slice(0,200));
  const agregar=c.getByRole('button',{name:'Agregar'}); const na=await agregar.count(); log('fotos con 512:', na);
  for (let i=0;i<na;i++) await c.getByRole('button',{name:'Agregar'}).first().click();
  await c.screenshot({path:`${OUT}/${tag}-06-seleccion.png`});
  await c.getByRole('button',{name:/Ver carrito/}).click(); await c.waitForTimeout(500);
  await c.locator('#cupon-comprador').fill('QA10'); await c.getByRole('button',{name:'Aplicar'}).click(); await c.waitForTimeout(400);
  log('carrito:', (await c.locator('dialog[open]').innerText()).replace(/\n+/g,' | ').slice(0,600));
  await c.screenshot({path:`${OUT}/${tag}-07-carrito.png`});
  async function pagar(nombre){
    const btn=c.locator('dialog[open]').getByRole('button',{name:/Pagar|Continuar|Ir a pagar/}).first(); await btn.click(); await c.waitForTimeout(300);
    if (await c.getByLabel('Tu nombre').isVisible().catch(()=>false)) {
      await c.getByLabel('Tu nombre').fill(nombre); await c.locator('dialog[open]').getByLabel('Email').fill('comprador@qa.test');
      await c.locator('dialog[open]').getByRole('button',{name:/Pagar .*demostración/}).click();
    }
  }
  await pagar('Juan Corredor');
  await c.waitForURL(/pedido/,{timeout:15000}); await c.waitForTimeout(800);
  log('pedido:', (await c.locator('main').innerText()).replace(/\n+/g,' | ').slice(0,500));
  await c.screenshot({path:`${OUT}/${tag}-08-pedido.png`, fullPage:true});
  const [dl]=await Promise.all([c.waitForEvent('download'), c.getByRole('button',{name:/Descargar original/}).first().click()]);
  const ruta=await dl.path(); const fs=await import('fs');
  log('descarga:', dl.suggestedFilename(), fs.statSync(ruta).size, 'bytes; original QA_01:', fs.statSync(A+'/QA_01_d512.jpg').size, fs.statSync(A+'/QA_02_d512-d88.jpg').size, fs.statSync(A+'/clip_d512.webm').size, fs.statSync(A+'/IMG_4021.jpg').size);
  const pedidoUrl=c.url();
  // ¿se pidió algún original antes de pagar? (no hay URLs de originales; chequeo que no se hayan pedido /muestras ni blobs grandes)
  log('peticiones a /muestras desde el comprador:', peticiones.filter(u=>u.includes('/muestras/')).length);
  // segundo intento con el mismo cupón (1 uso)
  await c.goto(enlace,{waitUntil:'networkidle'}); await c.waitForTimeout(600);
  await c.getByRole('button',{name:'Agregar'}).first().click();
  await c.getByRole('button',{name:/Ver carrito/}).click(); await c.waitForTimeout(300);
  await c.locator('#cupon-comprador').fill('QA10'); await c.getByRole('button',{name:'Aplicar'}).click(); await c.waitForTimeout(400);
  log('cupón 2da vez:', (await c.locator('dialog[open] [role=alert]').allInnerTexts()).join(' / '));
  // clave incorrecta
  await c.goto(pedidoUrl.replace(/clave=[0-9a-f]+/,'clave=deadbeef'),{waitUntil:'networkidle'}); await c.waitForTimeout(600);
  log('clave mala:', (await c.locator('main').innerText()).slice(0,120).replace(/\n+/g,' | '));
  // ---------- ventas en el panel ----------
  await p.bringToFront(); await p.goto(B+'/panel/ventas',{waitUntil:'networkidle'}); await p.waitForTimeout(800);
  log('ventas panel:', (await p.locator('main').innerText()).replace(/\n+/g,' | ').slice(0,500));
  await shot('09-ventas');
} catch(e){ console.log('ERROR', e.message.split('\n')[0]); await dump(); await shot('error'); }
console.log('pageerrors', errs);
await b.close();
