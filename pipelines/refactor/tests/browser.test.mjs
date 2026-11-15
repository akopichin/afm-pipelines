import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn, execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const directory = path.dirname(fileURLToPath(import.meta.url));
const tool = path.join(directory, '../scripts/workbench.mjs');
const chromePath = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
assert(fs.existsSync(chromePath), 'Set CHROME_PATH to a Chrome executable');
assert.equal(typeof WebSocket, 'function', 'This browser test requires Node.js 22+');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'refactor-browser-'));
const run = (...args) => execFileSync(process.execPath, [tool, ...args], {encoding: 'utf8'});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const visual=Boolean(process.env.REFACTOR_VISUAL_DOCUMENT || process.env.REFACTOR_VISUAL_CHECKPOINT);
const visualCheckpoint=process.env.REFACTOR_VISUAL_CHECKPOINT ? JSON.parse(fs.readFileSync(process.env.REFACTOR_VISUAL_CHECKPOINT,'utf8')) : null;
const doc = visualCheckpoint?.document || JSON.parse(fs.readFileSync(process.env.REFACTOR_VISUAL_DOCUMENT || path.join(directory, '../examples/example.json'), 'utf8'));
if (!visual) doc.proposals.push({
  id:'remove-store',title:'Remove store fixture',rationale:'Exercise removed component highlighting.',effort:'small',
  depends_on:['reuse-pricing'],conflicts_with:[],finding_ids:[],node_ids:['store'],
  steps:['Remove the example store.'],verification:['Inspect the deletion preview.'],risks:[],
  changes:{add_nodes:[],remove_nodes:['store'],update_nodes:[],add_edges:[],remove_edges:['handler-store','worker-store']}
});
if(!visual)for(const [i,p] of doc.proposals.entries())p.priority={benefit:5-i,ease:2+i,reason:'Synthetic priority used to exercise ordering without changing decisions.'};
if(!visual){doc.baseline.edges[0].symbols=['SaveOrder'];doc.baseline.edges[0].description='Persists the validated order through the store contract.';}
doc.session_id = 'browser-test-' + Date.now();
const input = path.join(temp, 'architecture.json');
fs.writeFileSync(input, JSON.stringify(visualCheckpoint || doc));
run('build', visualCheckpoint?'--checkpoint':'--input', input, '--output', path.join(temp, 'workbench.html'));
const reservation = net.createServer();
await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
let chrome, socket, sequence = 0;
const pending = new Map(), exceptions = [];
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => {pending.delete(id); reject(new Error('CDP timeout: ' + method));}, 10000);
    pending.set(id, {resolve, reject, timer});
    socket.send(JSON.stringify({id, method, params}));
  });
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise: true});
  if(result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result.value;
}
async function ready() {
  for(let i=0;i<50;i++) {
    if(await evaluate('Boolean(window.refactor?.view().graphs)')) return;
    await delay(100);
  }
  throw new Error('Workbench did not become ready: ' + await evaluate('document.getElementById("message").textContent') + JSON.stringify(exceptions));
}
async function renderedScene(key='before') {
  for(let i=0;i<80;i++) {
    const nodes=await evaluate(`window.refactor.view().graphs.${key}.nodes`);
    if(nodes.length && nodes.every(n=>n.rendered && n.rendered[0]===n.x && n.rendered[1]===n.y && n.rendered[2]===n.z)) return;
    await delay(100);
  }
  throw new Error('Scene positions not ready: '+JSON.stringify(await evaluate('window.refactor.view()'))+JSON.stringify(exceptions));
}
async function diagramReady() {
  await delay(80);
  for(let i=0;i<150;i++){
    if(await evaluate('window.refactor.view().diagram?.ready'))return;
    if(await evaluate('document.getElementById("message").textContent'))throw new Error(await evaluate('document.getElementById("message").textContent'));
    await delay(100);
  }
  throw new Error('Diagram did not become ready');
}
async function click(selector) {
  const point = await evaluate(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw new Error('Missing element'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; })()`);
  await send('Input.dispatchMouseEvent', {type: 'mousePressed', button: 'left', clickCount: 1, ...point});
  await send('Input.dispatchMouseEvent', {type: 'mouseReleased', button: 'left', clickCount: 1, ...point});
  await delay(80);
}
async function key(number) {
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:String(number),code:'Digit'+number,text:String(number)});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:String(number),code:'Digit'+number});
  await delay(100);
}
async function navigationChecks(){
  await key(1);await key(4);await diagramReady();
  assert.equal((await evaluate('window.refactor.view()')).layout,'diagram');
  const point=await evaluate(`(()=>{const r=document.querySelector('#before-diagram svg').getBoundingClientRect();return {x:Math.round(r.x+r.width*.67),y:Math.round(r.y+r.height*.6)};})()`);
  const world=()=>evaluate(`(()=>{const scene=document.querySelector('#before-diagram svg>g');const p=new DOMPoint(${point.x},${point.y}).matrixTransform(scene.getScreenCTM().inverse());return [p.x,p.y];})()`);
  const before=await world();
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',...point,deltaX:0,deltaY:-240});await delay(120);
  const after=await world();assert(Math.hypot(after[0]-before[0],after[1]-before[1])<.01,'Diagram zoom stays under pointer: '+JSON.stringify({before,after}));
  const panBefore=await evaluate('({...diagram.pan})');
  const dragPoint=await evaluate(`(()=>{const r=document.querySelector('#before-diagram [data-node] rect').getBoundingClientRect();return {x:Math.max(30,Math.min(innerWidth-100,r.x+r.width*.5)),y:Math.max(260,Math.min(innerHeight-100,r.y+r.height*.5))};})()`);
  await evaluate('document.activeElement.blur()');
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
  assert(await evaluate('window.refactor.view().panMode'));
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...dragPoint});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:dragPoint.x+50,y:dragPoint.y+30});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:dragPoint.x+50,y:dragPoint.y+30});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});
  assert.equal(await evaluate('window.refactor.view().panMode'),false);
  assert.equal(await evaluate('document.getElementById("explanation-dock").hidden'),true,'Space drag does not select container or open panel');
  const panAfter=await evaluate('({...diagram.pan})');assert.equal(Math.round(panAfter.x-panBefore.x),50);assert.equal(Math.round(panAfter.y-panBefore.y),30);
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'f',code:'KeyF',text:'f'});await send('Input.dispatchKeyEvent',{type:'keyUp',key:'f',code:'KeyF'});await delay(100);
  assert.equal(await evaluate('diagram.zoom'),1,'F fits the diagram');
  assert.deepEqual(await evaluate('diagram.pan'),{x:0,y:0});
  const endpoints=await evaluate(`(()=>{
    const result=[];
    for(const root of document.querySelectorAll('[id$="-diagram"] svg'))for(const edge of root.querySelectorAll('[data-edge]')){
      if(!root.getBoundingClientRect().width)continue;
      const paths=[...edge.querySelectorAll('path')],first=paths[0],last=paths.at(-1);if(!first)continue;
      const border=(id,p)=>{const n=[...root.querySelectorAll('[data-node]')].find(n=>n.dataset.node===id)?.querySelector('rect');if(!n)return false;const b=n.getBBox(),eps=1;return p.x>=b.x-eps&&p.x<=b.x+b.width+eps&&p.y>=b.y-eps&&p.y<=b.y+b.height+eps&&Math.min(Math.abs(p.x-b.x),Math.abs(p.x-b.x-b.width),Math.abs(p.y-b.y),Math.abs(p.y-b.y-b.height))<eps;};
      result.push({id:edge.dataset.edge,source:border(edge.dataset.source,first.getPointAtLength(0)),target:border(edge.dataset.target,last.getPointAtLength(last.getTotalLength()))});
    }return result;
  })()`);
  assert(endpoints.length>0);assert(endpoints.every(e=>e.source&&e.target),'Every routed edge reaches its own component border: '+JSON.stringify(endpoints.filter(e=>!e.source||!e.target)));
  for(const [shortcut,layout] of [[5,'spatial'],[6,'hierarchy']]){
    await key(shortcut);await delay(350);assert.equal((await evaluate('window.refactor.view()')).layout,layout);
    const pointer=await evaluate(`(()=>{const r=document.getElementById('before-webgl').getBoundingClientRect();const g=graphics.graphs.before,c=g.camera(),v=c.position.clone().set(.35,-.2,.5).unproject(c).sub(c.position).normalize(),normal=c.getWorldDirection(c.position.clone());window.zoomAnchor=c.position.clone().addScaledVector(v,g.controls().target.clone().sub(c.position).dot(normal)/v.dot(normal));return {x:r.x+r.width*.675,y:r.y+r.height*.6};})()`);
    await send('Input.dispatchMouseEvent',{type:'mouseWheel',...pointer,deltaX:0,deltaY:-160});await delay(350);
    const projected=await evaluate('window.zoomAnchor.clone().project(graphics.graphs.before.camera()).toArray()');
    assert(Math.hypot(projected[0]-.35,projected[1]+.2)<.015,layout+' zoom stays under pointer: '+projected);
    const targetBefore=await evaluate('graphics.graphs.before.controls().target.toArray()');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:' ',code:'Space'});
    await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...pointer});
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:pointer.x+40,y:pointer.y+20});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:pointer.x+40,y:pointer.y+20});
    await send('Input.dispatchKeyEvent',{type:'keyUp',key:' ',code:'Space'});await delay(250);
    assert.notDeepEqual(await evaluate('graphics.graphs.before.controls().target.toArray()'),targetBefore,layout+' supports Space pan');
    assert.equal(await evaluate('document.getElementById("explanation-dock").hidden'),true);
    await click('#reset');
  }
  await click('#filter-search');await evaluate('document.getElementById("search").focus()');await key(4);
  assert.equal((await evaluate('window.refactor.view()')).layout,'hierarchy','Typing does not change layout');
  await evaluate('document.getElementById("search").value="";document.activeElement.blur()');await click('#filter-close');await key(5);
}

async function clickRelation(id,layout,key='before'){
  const point=await evaluate(`(()=>{
    const id=${JSON.stringify(id)},key=${JSON.stringify(key)},layout=${JSON.stringify(layout)};
    let points;
    if(layout==='diagram'){
      const edge=[...document.querySelectorAll('#'+key+'-diagram [data-edge]')].find(e=>JSON.parse(e.dataset.edgeIds).includes(id));
      if(!edge)return null;const path=edge.querySelector('.edge-line'),matrix=path.getScreenCTM(),length=path.getTotalLength();
      points=Array.from({length:81},(_,i)=>path.getPointAtLength(length*i/80).matrixTransform(matrix));
    }else{
      const edge=graphics.graphs[key].graphData().links.find(e=>e.id===id);if(!edge)return null;points=graphics.edgePoints(key,edge);
    }
    const rect=document.getElementById(key).getBoundingClientRect();
    for(let i=Math.max(1,Math.floor(points.length*.25));i<Math.ceil(points.length*.8);i++){
      const a=points[i-1],b=points[i];if(!a||!b)continue;const dx=b.x-a.x,dy=b.y-a.y,n=Math.hypot(dx,dy);if(!n)continue;
      for(const sign of [1,-1]){const x=(a.x+b.x)/2-dy/n*7*sign,y=(a.y+b.y)/2+dx/n*7*sign;
        if(x<rect.left+20||x>rect.right-20||y<rect.top+50||y>rect.bottom-20)continue;
        if(layout==='diagram'){
          const hit=document.elementFromPoint(x,y)?.closest('[data-edge]');if(hit&&JSON.parse(hit.dataset.edgeIds).includes(id))return {x,y};
        }else{
          const graph=graphics.graphs[key],r=graph.renderer().domElement.getBoundingClientRect();
          const nearNode=graph.graphData().nodes.some(node=>{const v=graph.camera().position.clone().set(node.x,node.y,node.z).project(graph.camera());return Math.abs(x-(r.x+(v.x+1)*r.width/2))<(layout==='hierarchy'?95:35)&&Math.abs(y-(r.y+(1-v.y)*r.height/2))<(layout==='hierarchy'?40:30);});
          if(!nearNode&&graphics.pickEdge(key,x,y)?.edge.id===id)return {x,y};
        }
      }
    }return null;
  })()`);
  assert(point,'A wide hit corridor is reachable for '+layout+' '+id);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',...point});await delay(120);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});await delay(200);
  assert((await evaluate('window.refactor.view().selectedEdges')).includes(id),'Click 7px from '+layout+' edge selects it');
}
async function relationChecks(){
  const saved=await evaluate('window.refactor.checkpoint()');
  await key(3);
  for(const [shortcut,layout] of [[4,'diagram'],[5,'spatial'],[6,'hierarchy']]){
    await key(shortcut);if(layout==='diagram')await diagramReady();else await renderedScene();await delay(250);
    await evaluate('document.getElementById("connections").value="all";document.getElementById("connections").dispatchEvent(new Event("input"))');await delay(200);
    if(layout==='diagram')await diagramReady();
    await clickRelation('handler-store',layout);
    assert.equal(await evaluate('document.getElementById("explanation-dock").hidden'),true,'Selecting a relation does not move the graphs');
    if(layout==='diagram')assert.equal(await evaluate('document.querySelectorAll("[data-edge=handler-store].relation-selected").length'),2,'Diagram highlights both surviving relations');
    else assert((await evaluate('Object.values(window.refactor.view().graphs).map(g=>g.edges.find(e=>e.id==="handler-store").selected)')).every(Boolean),'Both WebGL graphs highlight the same relation');
    await click('[data-edge-badge="after"]');
    assert.equal(await evaluate('document.getElementById("edge-popup").hidden'),false);
    const content=await evaluate('document.getElementById("edge-popup").textContent');
    assert.match(content,/SaveOrder/);assert.match(content,/Связь сохранена/);assert.match(content,/Create order → Order store/);
    const screenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-edge-'+layout+'.png',Buffer.from(screenshot.data,'base64'));
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
    assert.equal(await evaluate('document.getElementById("edge-popup").hidden'),true);
    assert((await evaluate('window.refactor.view().selectedEdges')).includes('handler-store'),'Closing details keeps highlight');
    await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape'});
  }
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),saved,'Relation browsing does not change decisions');
  await key(5);await key(1);
}

async function pressKey(key){const vk={Enter:13,ArrowLeft:37,ArrowUp:38,ArrowRight:39,ArrowDown:40,Escape:27}[key];await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key,windowsVirtualKeyCode:vk,...(key==='Enter'?{text:'\r'}:{})});await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key,windowsVirtualKeyCode:vk});await delay(120);}
try {
  run('start', '--session', temp, '--port', String(port), '--host', '127.0.0.1');
  run('start', '--session', temp, '--port', String(port), '--host', '127.0.0.1');
  const url = `http://127.0.0.1:${port}`;
  assert.equal((await fetch(url + '/architecture.json')).status, 404);
  assert.equal((await fetch(url, {method: 'POST', body: '{}'})).status, 404);
  chrome = spawn(chromePath, ['--headless=new', '--no-first-run', '--no-default-browser-check',
    '--remote-debugging-port=0', '--remote-debugging-address=127.0.0.1', '--user-data-dir=' + path.join(temp, 'chrome'), 'about:blank'],
    {stdio: 'ignore'});
  const portFile = path.join(temp, 'chrome', 'DevToolsActivePort');
  for(let i=0;i<100&&!fs.existsSync(portFile);i++) await delay(100);
  assert(fs.existsSync(portFile), 'Chrome did not expose its CDP port');
  const cdpPort = fs.readFileSync(portFile, 'utf8').split('\n')[0];
  const pages = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {socket.addEventListener('open', resolve, {once: true}); socket.addEventListener('error', reject, {once: true});});
  socket.addEventListener('message', message => {
    const data = JSON.parse(message.data);
    if(data.method === 'Runtime.exceptionThrown') exceptions.push(data.params.exceptionDetails);
    const job = pending.get(data.id);
    if(job) {pending.delete(data.id);clearTimeout(job.timer);data.error ? job.reject(new Error(data.error.message)) : job.resolve(data.result);}
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false});
  await send('Page.navigate', {url});
  await ready();
  await renderedScene();
  const rendered = await evaluate('window.refactor.view().graphs.before.nodes');
  assert(rendered.length > 1);
  assert(rendered.every(n=>n.labelVisible),'Every 3D node has a visible label, including child nodes');
  assert(new Set(rendered.map(n=>JSON.stringify(n.rendered))).size > 1, 'Rendered cards occupy distinct positions');
  for (const node of rendered) {
    assert([node.x,node.y,node.z].every(Number.isFinite), 'Finite graph coordinates');
    assert.deepEqual(node.rendered, [node.x,node.y,node.z], 'Scene uses hierarchy coordinates');
  }
  assert((await evaluate('window.refactor.view().graphs.before.camera')).every(Number.isFinite), 'Finite camera position');
  const originalView = await evaluate('window.refactor.view()');
  const originalCheckpoint = await evaluate('window.refactor.checkpoint()');
  const controlsBefore = await evaluate(`['filter-level','filter-hops','filter-connections','filter-relation','filter-search','reset'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,r.x,r.y,r.width,r.height];})`);
  assert(controlsBefore.filter(r=>r[0]!=='step').every(r=>r[4]===36),'Toolbar fields and actions have equal heights');
  assert(await evaluate('document.getElementById("review-nav").getBoundingClientRect().width>innerWidth*.9'),'Review navigator has its own full-width row');
  assert(await evaluate('["review-plan-pick","review-new-plan","review-remove"].every(id=>{const e=document.getElementById(id);return e.disabled&&e.getBoundingClientRect().width>0&&e.closest(".toolbar-primary")&&e.querySelector("svg");})'),'Overview plan icons are visible, disabled and beside view controls');
  assert.equal(await evaluate('Boolean(document.getElementById("review-assignment-row"))'),false,'No redundant assignment row');
  assert(await evaluate('(()=>{const controls=[...document.querySelectorAll("#review-scores .review-score"),document.getElementById("review-list-open")].map(e=>e.getBoundingClientRect());return controls.every(r=>r.height===36)&&controls[0].x<controls[1].x&&controls[1].x<controls[2].x&&controls[0].x<100;})()'),'Benefit, difficulty, list are aligned at the left with equal height');
  await click('#review-plan-pick');assert.equal(await evaluate('document.getElementById("review-plan-dialog").open'),false,'Disabled plan control does not open the picker');

  assert(await evaluate('document.querySelector(".plan-controls").nextElementSibling.classList.contains("filter-controls")'),'Filter icons follow plan icons');
  assert.equal(await evaluate('Boolean(document.querySelector(".toolbar-filters"))'),false,'No extra filter row');
  for(const id of ['level','hops','connections','relation','search']){
    await click('#filter-'+id);
    assert.equal(await evaluate('document.getElementById("graph-filter-popover").matches(":popover-open")'),true);
    assert.equal(await evaluate('document.querySelectorAll("[data-filter-field]:not([hidden])").length'),1);
    assert(await evaluate('(()=>{const r=document.getElementById("graph-filter-popover").getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})()'),'Filter popup fits viewport');
    await click('#filter-close');
  }
  await click('#filter-hops');
  await evaluate('document.getElementById("hops").value="1";document.getElementById("hops").dispatchEvent(new Event("input"))');await delay(100);
  assert.equal(await evaluate('document.getElementById("filter-hops").dataset.active'),'true');
  assert.match(await evaluate('document.getElementById("filter-hops").title'),/1 hop/);
  await click('#filter-reset');assert.equal(await evaluate('document.getElementById("hops").value'),'0');
  await pressKey('Escape');assert.equal(await evaluate('document.getElementById("graph-filter-popover").matches(":popover-open")'),false);
  await click('#filter-search');await click('#review-title');
  assert.equal(await evaluate('document.getElementById("graph-filter-popover").matches(":popover-open")'),false,'Outside click closes filters');
  const initial=await evaluate('window.refactor.checkpoint()');
  assert.equal(await evaluate('Boolean(document.getElementById("panel-toggle")||document.querySelector("aside"))'),false);
  assert.equal(await evaluate('document.querySelectorAll(".context-pill").length'),3);
  assert(await evaluate('[...document.querySelectorAll(".context-pill")].every(e=>getComputedStyle(e).writingMode==="vertical-rl")'));
  await evaluate('setPanel(false)');
  await navigationChecks();
  if(!visual)await relationChecks();
  if(visual){
    await evaluate(`reviewProposal(${JSON.stringify(doc.proposals[0].id)});setTab('description')`);await diagramReady();
    for(const [tab,name] of [['description','description'],['discussion','discussion'],['plans','plans']]){
      await evaluate(`setTab(${JSON.stringify(tab)})`);await delay(200);const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-real-'+name+'.png',Buffer.from(shot.data,'base64'));
    }
  }else{
  await evaluate('reviewProposal("extract-pricing");setTab("description")');await diagramReady();
  assert.match(await evaluate('document.getElementById("review-note").textContent'),/Зачем.*Что решает.*До.*После/s);
  assert.match(await evaluate('document.getElementById("review-note").textContent'),/CalculatePrice/);
  const bounds=()=>evaluate('(()=>{const d=document.getElementById("explanation-dock").getBoundingClientRect(),v=document.querySelector(".views").getBoundingClientRect();return {width:d.width,right:d.right,left:v.left,graphWidth:v.width};})()');
  const before=await bounds();assert(before.right<=before.left);
  const handle=await evaluate('(()=>{const r=document.getElementById("explanation-resize").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...handle});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:handle.x+70,y:handle.y});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:handle.x+70,y:handle.y});await delay(150);
  assert.equal(Math.round((await bounds()).width-before.width),70);
  assert.equal(Math.round(before.graphWidth-(await bounds()).graphWidth),70);
  await click('#tab-description');assert(await evaluate('document.getElementById("explanation-dock").hidden'));
  await click('#tab-description');assert.equal(Math.round((await bounds()).width),Math.round(before.width+70));
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),initial);
  const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-left-description.png',Buffer.from(shot.data,'base64'));
  await click('#review-list-open');
  const beforeSort=await evaluate('window.refactor.checkpoint()');
  await evaluate('document.getElementById("review-order").value="ease";document.getElementById("review-order").dispatchEvent(new Event("change"))');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("[data-review-option]")].map(e=>e.dataset.reviewOption)'),['remove-store','reuse-pricing','extract-pricing']);
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforeSort,'Priority sorting never changes decisions');
  await evaluate('document.getElementById("review-order").value="benefit";document.getElementById("review-order").dispatchEvent(new Event("change"))');await evaluate('document.getElementById("review-search").value="Reuse";document.getElementById("review-search").dispatchEvent(new Event("input"))');
  await click('[data-review-option="reuse-pricing"]');await diagramReady();
  await click('#review-plan-pick');await click('[data-review-plan="plan-1"]');
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),initial,'Choosing a destination is not applying it');
  await click('#review-plan-confirm');
  assert.match(await evaluate('document.getElementById("review-message").textContent'),/Extract pricing/);
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),initial,'Rejected prerequisite does not create plans or select stages');
  await click('[data-review-dependency="extract-pricing"]');await diagramReady();
  await click('#review-new-plan');
  await evaluate('document.getElementById("review-plan-name").value="Core pricing";document.getElementById("review-plan-name").dispatchEvent(new Event("input"))');
  await click('#review-plan-confirm');await diagramReady();
  assert.deepEqual(await evaluate('M.plans(state).find(g=>g.title==="Core pricing").proposal_ids'),['extract-pricing']);
  await click('#next-step');await diagramReady();await click('#review-new-plan');
  await evaluate('document.getElementById("review-plan-name").value="core pricing";document.getElementById("review-plan-name").dispatchEvent(new Event("input"))');
  assert(await evaluate('document.getElementById("review-plan-confirm").disabled'));
  await evaluate('document.getElementById("review-plan-name").value="Imports";document.getElementById("review-plan-name").dispatchEvent(new Event("input"))');await click('#review-plan-confirm');await diagramReady();
  assert.deepEqual(await evaluate('M.plans(state).find(g=>g.title==="Imports").depends_on'),['plan-2']);
  await click('#tab-plans');assert.match(await evaluate('document.getElementById("current-plan").textContent'),/Imports/);
  const selected=await evaluate('window.refactor.checkpoint()');
  await click('.plan-transfer');await click('[data-review-plan="plan-2"]');await click('#review-plan-dialog button[data-close-dialog]');
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),selected,'Cancel preserves exact selection and groups');
  await click('.plan-transfer');await click('[data-review-plan="plan-2"]');await click('#review-plan-confirm');
  assert.deepEqual(await evaluate('M.plans(state).find(g=>g.title==="Core pricing").proposal_ids'),['extract-pricing','reuse-pricing']);
  await click('.plan-transfer');await click('[data-review-plan="plan-3"]');await click('#review-plan-confirm');
  await click('#previous-step');await diagramReady();await click('#review-remove');
  assert.match(await evaluate('document.getElementById("review-message").textContent'),/зависимые/);
  assert.deepEqual(await evaluate('window.refactor.status().selected'),['extract-pricing','reuse-pricing']);
  await click('#tab-discussion');
  await evaluate('document.getElementById("comment").value="First-stage draft";document.getElementById("comment").dispatchEvent(new Event("input"));document.activeElement.blur()');
  await click('#next-step');await diagramReady();assert.equal(await evaluate('document.getElementById("comment").value'),'');
  await evaluate('document.getElementById("comment").value="Keep imports compatible";document.getElementById("comment").dispatchEvent(new Event("input"))');
  await click('#previous-step');await diagramReady();assert.equal(await evaluate('document.getElementById("comment").value'),'First-stage draft');
  await send('Page.reload');await delay(250);await ready();
  await evaluate('reviewProposal("extract-pricing");setTab("discussion")');await diagramReady();
  assert.equal(await evaluate('document.getElementById("comment").value'),'First-stage draft');
  await click('#send');await click('#next-step');await diagramReady();assert.equal(await evaluate('document.getElementById("comment").value'),'Keep imports compatible');await click('#send');
  assert(await evaluate('document.getElementById("approve").disabled'));
  const comments=await evaluate('window.refactor.readEvents().filter(e=>e.kind==="comment")');assert.deepEqual(comments.map(e=>e.proposal_id),['extract-pricing','reuse-pricing']);
  const groups=await evaluate('window.refactor.status().plan_groups');
  await click('#review-plan-pick');
  await evaluate('window.stablePlanInput=document.querySelector("[data-plan-title]");window.stableDiagram=document.querySelector("#before-diagram svg")');
  await evaluate('(()=>{const d=structuredClone(state.document);d.revision++;d.addressed_event_id=state.events.length;d.replies=[{proposal_id:"extract-pricing",text:"Rounding is preserved."},{proposal_id:"reuse-pricing",text:"Import fixtures verify compatibility."}];window.refactor.publish(d)})()');
  assert.deepEqual(await evaluate('window.refactor.status().plan_groups'),groups,'Answer-only publication preserves named plans');
  await delay(120);assert(await evaluate('document.getElementById("review-plan-dialog").open'),'Reply does not close the plan picker');
  assert(await evaluate('window.stablePlanInput===document.querySelector("[data-plan-title]") && window.stableDiagram===document.querySelector("#before-diagram svg")'),'Reply preserves editor and diagram DOM');
  await click('[data-close-dialog="review-plan-dialog"]');
  assert.match(await evaluate('document.getElementById("chat").textContent'),/Import fixtures/);assert.doesNotMatch(await evaluate('document.getElementById("chat").textContent'),/Rounding is preserved/);
  await click('#previous-step');await diagramReady();assert.match(await evaluate('document.getElementById("chat").textContent'),/Rounding is preserved/);
  await click('#discussion-all');assert.equal(await evaluate('document.querySelectorAll(".agent-reply").length'),2);await click('#discussion-all');
  const checkpoint=await evaluate('window.refactor.checkpoint()'),checkpointFile=path.join(temp,'checkpoint.json');fs.writeFileSync(checkpointFile,JSON.stringify(checkpoint));
  run('build','--checkpoint',checkpointFile,'--output',path.join(temp,'workbench.html'));
  await evaluate('localStorage.clear()');await send('Page.reload');await delay(250);await ready();
  await evaluate('reviewProposal("extract-pricing");setTab("discussion")');await diagramReady();
  assert.match(await evaluate('document.getElementById("chat").textContent'),/Rounding is preserved/,'Replies survive without browser-local state');
  await click('#tab-description');const beforePlayback=await evaluate('window.refactor.checkpoint()');
  await click('#play-transition');
  for(let i=0;i<100&&!await evaluate('Boolean(window.refactor.view().animation)');i++)await delay(50);
  assert(await evaluate('Boolean(window.refactor.view().animation)'),'Animation starts');
  await delay(300);await click('#transition-toggle');
  const paused=await evaluate('window.refactor.view().animation');assert.equal(paused.playing,false);assert(paused.progress>0&&paused.progress<1);
  assert.match(await evaluate('document.getElementById("transition-phase").textContent'),/1 \/ 2/);
  assert(await evaluate('[...document.querySelectorAll("#transition-canvas [data-edge]")].every(e=>Number(e.getAttribute("opacity"))===0)'), 'Connections wait while boxes move');
  await delay(150);assert.equal((await evaluate('window.refactor.view().animation')).progress,paused.progress,'Pause holds the frame');
  const animationShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-transition.png',Buffer.from(animationShot.data,'base64'));
  await click('#transition-toggle');
  for(let i=0;i<100&&(await evaluate('window.refactor.view().animation.progress'))<.7;i++)await delay(30);
  await click('#transition-toggle');
  assert.match(await evaluate('document.getElementById("transition-phase").textContent'),/2 \/ 2/);
  assert(await evaluate('[...document.querySelectorAll("#transition-canvas [data-edge]")].some(e=>Number(e.getAttribute("opacity"))>0)'), 'Connections appear in the second phase');
  const settledBoxes=await evaluate('[...document.querySelectorAll("#transition-canvas [data-node]")].map(e=>[e.getAttribute("transform"),e.querySelector("rect").getAttribute("width"),e.querySelector("rect").getAttribute("height")])');
  await click('#transition-toggle');
  for(let i=0;i<80&&(await evaluate('window.refactor.view().animation.progress'))<1;i++)await delay(50);
  assert.equal((await evaluate('window.refactor.view().animation')).progress,1);
  assert.equal(await evaluate('document.getElementById("transition-phase").textContent'),'После');
  assert.deepEqual(await evaluate('[...document.querySelectorAll("#transition-canvas [data-node]")].map(e=>[e.getAttribute("transform"),e.querySelector("rect").getAttribute("width"),e.querySelector("rect").getAttribute("height")])'),settledBoxes,'Boxes stay fixed while connections appear');
  assert(await evaluate('[...document.querySelectorAll("#transition-canvas [data-node=pricing]")].some(e=>Number(e.getAttribute("opacity"))===1)'), 'New component appears in the final frame');
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforePlayback,'Playing a transition does not alter decisions');
  await click('#transition-replay');assert((await evaluate('window.refactor.view().animation')).progress<1);
  await click('#transition-close');assert.equal(await evaluate('window.refactor.view().animation'),null);

  await click('#review-overview');await key(5);await key(3);await evaluate('setPanel(false)');await renderedScene();
  await click('[data-highlight="added"]');
  assert((await evaluate('window.refactor.view().graphs.after.nodes')).some(n=>n.change==='added'&&n.emphasized));
  await click('#clear-highlights');
  const view=await evaluate('window.refactor.view().graphs');
  for(const node of view.after.nodes.filter(n=>view.before.nodes.some(b=>b.id===n.id))){const prior=view.before.nodes.find(b=>b.id===node.id);assert.deepEqual([node.x,node.y,node.z],[prior.x,prior.y,prior.z])}
  await send('Input.dispatchMouseEvent',{type:'mouseWheel',x:300,y:500,deltaX:0,deltaY:-100});await delay(150);
  const cameras=await evaluate('window.refactor.view().graphs');assert.deepEqual(cameras.before.camera,cameras.after.camera);
  await click('#approve');const approved=await evaluate('window.refactor.status()');assert(approved.approval);
  const sealed=await evaluate(`window.refactor.seal(${approved.revision},${approved.approval.event_id})`);fs.writeFileSync(checkpointFile,JSON.stringify(sealed));
  run('plan','--checkpoint',checkpointFile,'--output',path.join(temp,'plan.md'));
  run('export','--checkpoint',checkpointFile,'--plan',path.join(temp,'plan.md'),'--output',path.join(temp,'export'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'export/plans/index.json'))).plans.length,2);
  const plan=fs.readFileSync(path.join(temp,'export/plans/01-plan-2.md'),'utf8');assert.match(plan,/\*\*Before\*\*/);assert.match(plan,/CalculatePrice/);
  run('build','--checkpoint',checkpointFile,'--output',path.join(temp,'report.html'));
  await send('Page.navigate',{url:'file://'+path.join(temp,'report.html')});await delay(250);await ready();
  await evaluate('reviewProposal("extract-pricing");setTab("plans")');await diagramReady();
  assert(await evaluate('document.getElementById("review-plan-pick").disabled'));assert(await evaluate('document.querySelector(".plan-transfer").disabled'));
  assert.equal(await evaluate('document.querySelectorAll("script[src]").length'),0);
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await delay(150);
  assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'));
  }
  assert.deepEqual(exceptions,[],'No uncaught browser exceptions');
  console.log('PASS: left drawers, context and drafts, durable scoped replies, plan transfer and creation, dependency rejection, diagrams/3D/relations, playback, export and offline recovery');
} finally {
  for(const job of pending.values()) clearTimeout(job.timer);
  socket?.close();
  if(chrome && chrome.exitCode === null && chrome.signalCode === null) {
    chrome.kill('SIGTERM');
    await Promise.race([new Promise(resolve => chrome.once('exit', resolve)), delay(4000)]);
    if(chrome.exitCode === null && chrome.signalCode === null) {chrome.kill('SIGKILL'); await new Promise(resolve => chrome.once('exit', resolve));}
  }
  run('stop', '--session', temp);
  fs.rmSync(temp, {recursive: true, force: true});
}
