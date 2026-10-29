/* Геометрия главной: node tools/test-rail.cjs [адрес] [chromium|webkit].
   Нужен Playwright (PLAYWRIGHT_MODULE — путь к установленному пакету).
   Сеть и синхронизация заблокированы; данные и обложки здесь вымышленные. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pw = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.argv[3] || 'chromium';
const origin = process.argv[2] || 'http://keiko.test';
const root = path.resolve(__dirname, '..');
const image = (w,h) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#52436b"/></svg>`);
(async () => {
 const browser = await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'chrome'}:{})});
 try {
  const context = await browser.newContext({viewport:{width:393,height:852},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await context.route('**/*', route => {
   const url = new URL(route.request().url());
   if(url.origin !== origin) return route.abort();
   const file=path.join(root,url.pathname==='/'?'index.html':url.pathname);
   return fs.existsSync(file)?route.fulfill({path:file}):route.abort();
  });
  const page = await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin);
  const seed=async(count,active)=>page.evaluate(({count,active,covers})=>{
   data=migrate({book:{books:[
    {id:'rail-wide',title:'Широкая обложка',pages:100,ratio:'4 / 3',cover:covers[0]},
    {id:'rail-narrow',title:'Узкая обложка',pages:100,ratio:'1 / 2',cover:covers[1]},
    {id:'rail-third',title:'Третья обложка',pages:100,ratio:'2 / 3',cover:covers[2]}
   ].slice(0,count),entries:[],activeBook:active},active:'book'});
   data.piano.pieces=[];data.pastel.courses=[];data.pastel.course=null;data.watch.videos=[];
   tab='home';settingsOpen=false;render();
  },{count,active,covers:[image(1600,1200),image(600,1200),image(800,1200)]});
  const centered=async(id,label)=>{
   await page.waitForTimeout(750);
   const geo=await page.evaluate(()=>{
    const rail=document.querySelector('#rail'),slot=rail.querySelector('.slot.on');
    const r=rail.getBoundingClientRect(),s=slot.getBoundingClientRect(),c=slot.querySelector('.cover').getBoundingClientRect();
    return {id:railItems()[Number(slot.dataset.i)].bookId,active:book().id,error:Math.abs(s.left+s.width/2-r.left-r.width/2),coverError:Math.abs(c.left+c.width/2-r.left-r.width/2),width:c.width,railWidth:r.width};
   });
   assert.equal(geo.active,id,label+': выбранная книга сохранена');
   assert.equal(geo.id,id,label+': название соответствует обложке');
   assert(geo.error<2,label+': обложка смещена на '+geo.error.toFixed(1)+' px');
   assert(geo.coverError<2,label+': сама картинка смещена на '+geo.coverError.toFixed(1)+' px');
   assert(geo.width>30,label+': обложка видна');
   console.log(label+': OK');
  };
  await seed(2,'rail-narrow');await centered('rail-narrow','Две книги разной ширины');
  await page.locator('.slot').first().click();await centered('rail-wide','Нажатие на соседнюю книгу');
  await page.locator('.slot').last().click();await centered('rail-narrow','Возврат нажатием');
  await page.setViewportSize({width:320,height:568});await centered('rail-narrow','Изменение размера экрана');
  await seed(1,'rail-wide');await centered('rail-wide','Одна широкая обложка');
  await seed(3,'rail-narrow');await centered('rail-narrow','Циклическая лента');
  for(let i=0;i<5;i++){
   await page.evaluate(()=>railApi.centerOn(2,true));await centered('rail-third','Переход к третьей книге '+i);
   await page.evaluate(()=>railApi.centerOn(0,true));await centered('rail-wide','Возврат к первой книге '+i);
  }
  await page.evaluate(()=>{railApi.centerOn(1,false);tab='notes';render();});
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>book().id),'rail-narrow','Старая карусель не меняет книгу после ухода со страницы');
  await page.evaluate(()=>{tab='home';render();});await centered('rail-narrow','Возврат на главную');
  await page.evaluate(()=>{
   const img=document.querySelector('.slot.on img');
   img.src='http://keiko.test/late-cover.svg';
  });
  await centered('rail-narrow','Ошибка загрузки фото не смещает карточку');
  await page.setViewportSize({width:430,height:932});await centered('rail-narrow','Большой мобильный экран');
  await page.setViewportSize({width:932,height:430});await centered('rail-narrow','Поворот экрана');
  assert.deepEqual(errors,[]);
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
