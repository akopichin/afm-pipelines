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
  assert.equal(await evaluate('document.getElementById("workshop-panel").hidden'),true,'Space drag does not select container or open panel');
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
    assert.equal(await evaluate('document.getElementById("workshop-panel").hidden'),true);
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
    assert.equal(await evaluate('document.getElementById("workshop-panel").hidden'),true,'Selecting a relation does not move the graphs');
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
async function reviewWorkflowChecks(){
  await click('[data-review="reuse-pricing"]');await diagramReady();
  assert.match(await evaluate('document.getElementById("review-scores").textContent'),/Польза4\/5Сложность3\/5/);
  assert.equal(await evaluate('document.getElementById("workshop-panel").hidden'),true);
  await click('#review-list-open');
  assert(await evaluate('document.getElementById("review-list-dialog").open'));
  assert(await evaluate('document.getElementById("review-list-dialog").getBoundingClientRect().width<=650'));
  const listShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-review-list.png',Buffer.from(listShot.data,'base64'));
  await evaluate('document.getElementById("review-search").value="Remove";document.getElementById("review-search").dispatchEvent(new Event("input"))');
  assert.equal(await evaluate('document.querySelectorAll("[data-review-option]").length'),1);
  await pressKey('ArrowRight');assert.equal(await evaluate('comparison().proposal.id'),'reuse-pricing','Typing does not navigate proposals');
  await pressKey('ArrowDown');assert.equal(await evaluate('document.activeElement.dataset.reviewOption'),'remove-store');await pressKey('Enter');await diagramReady();
  assert.equal(await evaluate('comparison().proposal.id'),'remove-store');
  assert.equal(await evaluate('document.getElementById("review-list-dialog").open'),false);
  await click('#review-new-plan');
  await evaluate('document.getElementById("review-plan-name").value="Cleanup"');
  await pressKey('ArrowLeft');assert.equal(await evaluate('comparison().proposal.id'),'remove-store');
  const planShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-review-plan-picker.png',Buffer.from(planShot.data,'base64'));
  await click('#review-plan-form button[type=submit]');await diagramReady();
  assert.equal(await evaluate('document.getElementById("review-plan-dialog").open'),false);
  assert.deepEqual(await evaluate('M.plans(state).find(g=>g.title==="Cleanup").proposal_ids'),['remove-store']);
  assert.match(await evaluate('document.getElementById("review-plan-pick").title'),/Cleanup/);
  await click('#review-plan-pick');await click('[data-review-plan="plan-2"]');
  assert(await evaluate('M.plans(state).find(g=>g.id==="plan-2").proposal_ids.includes("remove-store")'));
  await click('#review-remove');
  await pressKey('ArrowLeft');await diagramReady();assert.equal(await evaluate('comparison().proposal.id'),'reuse-pricing');
  await click('#review-remove');
  await pressKey('ArrowRight');await diagramReady();
  const saved=await evaluate('window.refactor.checkpoint()');
  await click('#review-plan-pick');await click('[data-review-plan="plan-2"]');
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),saved,'Rejected dependency changes neither plans nor selections');
  assert.match(await evaluate('document.getElementById("review-message").textContent'),/Reuse pricing in imports/);
  await click('[data-review-dependency="reuse-pricing"]');await diagramReady();
  await click('#review-plan-pick');await click('[data-review-plan="plan-2"]');
  assert.deepEqual(await evaluate('window.refactor.status().selected'),['extract-pricing','reuse-pricing']);
  await pressKey('ArrowLeft');await diagramReady();
  await click('#review-remove');
  assert.match(await evaluate('document.getElementById("review-message").textContent'),/зависимые этапы/);
  assert.deepEqual(await evaluate('window.refactor.status().selected'),['extract-pricing','reuse-pricing']);
  await pressKey('ArrowRight');await diagramReady();
  const reviewShot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-review-workflow.png',Buffer.from(reviewShot.data,'base64'));
  assert.equal(await evaluate('document.getElementById("workshop-panel").hidden'),true,'Entire workflow stays in review');
  await click('#review-overview');await key(5);await key(1);await click('#panel-toggle');await click('#tab-stages');
}

const toolbarBounds = () => evaluate(`['filter-level','filter-hops','filter-connections','filter-relation','filter-search','reset','panel-toggle'].map(id=>{
  const r=document.getElementById(id).getBoundingClientRect();return [id,r.x,r.y,r.width,r.height];
})`);

async function explanationChecks(){
  const geometry=()=>evaluate('(()=>{const p=document.getElementById("explanation-dock").getBoundingClientRect(),v=document.querySelector(".views").getBoundingClientRect();return {panelWidth:p.width,panelRight:p.right,graphLeft:v.left,graphWidth:v.width,graphTop:v.top,panelTop:p.top};})()');
  const before=await geometry();
  assert(before.panelWidth>=240&&before.panelRight<=before.graphLeft,'Explanation docks beside the graphs');
  assert.equal(before.graphTop,before.panelTop,'Explanation does not consume graph height');
  const checkpoint=await evaluate('window.refactor.checkpoint()');
  const handle=await evaluate('(()=>{const r=document.getElementById("explanation-resize").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...handle});
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',button:'left',buttons:1,x:handle.x+100,y:handle.y});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,x:handle.x+100,y:handle.y});await delay(200);
  const resized=await geometry();assert.equal(Math.round(resized.panelWidth-before.panelWidth),100);assert.equal(Math.round(before.graphWidth-resized.graphWidth),100);
  const step=await evaluate('document.getElementById("step").value');
  await evaluate('document.getElementById("explanation-resize").focus()');await pressKey('ArrowLeft');
  assert.equal(Math.round((await geometry()).panelWidth),Math.round(resized.panelWidth-24));
  assert.equal(await evaluate('document.getElementById("step").value'),step,'Resize handle arrows do not navigate proposals');
  await click('#explanation-toggle');await delay(100);
  assert.equal(await evaluate('document.getElementById("explanation-toggle").getAttribute("aria-expanded")'),'false');
  assert((await geometry()).graphWidth>resized.graphWidth+300,'Collapsing returns the width to the graphs');
  await click('#explanation-toggle');await delay(100);
  assert.equal(Math.round((await geometry()).panelWidth),Math.round(resized.panelWidth-24),'Reopening preserves width');
  assert.equal(await evaluate('JSON.parse(localStorage.getItem(uiKey)).explanationWidth'),resized.panelWidth-24,'Width is persisted for reload');
  await evaluate('document.querySelector("#review-note details").open=true;document.getElementById("review-note").scrollTop=50');
  const scroll=await evaluate('document.getElementById("review-note").scrollTop');
  await click('#reset');await delay(100);
  assert.equal(await evaluate('document.getElementById("review-note").scrollTop'),scroll,'Graph redraw preserves reading position');
  assert.equal(await evaluate('document.querySelector("#review-note details").open'),true);
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),checkpoint,'Panel preferences do not alter decisions');
}

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
  const controlsBefore = await toolbarBounds();
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
  await key(3);
  assert.equal((await evaluate('window.refactor.view()')).mode,'both');
  const widthBeforePanel = await evaluate('document.querySelector(".views").getBoundingClientRect().width');
  await click('#panel-toggle');
  await click('#tab-stages');
  if(!visual){
    const beforeSort=await evaluate('window.refactor.checkpoint()');
    const ids=await evaluate('[...document.querySelectorAll("#proposals [data-proposal]")].map(e=>e.dataset.proposal)');
    await evaluate('document.getElementById("proposal-order").value="ease";document.getElementById("proposal-order").dispatchEvent(new Event("change"))');
    assert.deepEqual(await evaluate('[...document.querySelectorAll("#proposals [data-proposal]")].map(e=>e.dataset.proposal)'),[...ids].reverse(),'Ease ordering is independent of benefit ordering');
    assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforeSort,'Priority sorting does not select proposals or change execution order');
    await evaluate('document.getElementById("proposal-order").value="benefit";document.getElementById("proposal-order").dispatchEvent(new Event("change"))');
    assert.match(await evaluate('document.querySelector(".priority-scores").textContent'),/Польза 5\/5 · Простота 2\/5/);
  }
  await delay(150);
  const docked = await evaluate(`(() => {
    const views=document.querySelector('.views').getBoundingClientRect(),panel=document.querySelector('aside').getBoundingClientRect();
    return {width:views.width,right:views.right,left:panel.left,panelWidth:panel.width};
  })()`);
  assert(docked.right<=docked.left,'Workshop panel does not overlap either graph');
  assert(widthBeforePanel-docked.width>=docked.panelWidth,'Graphs relinquish the panel width');
  const framed = await evaluate('window.refactor.view().graphs');
  for (const graph of Object.values(framed)) for (const node of graph.nodes)
    assert(Math.abs(node.projected[0])<1 && Math.abs(node.projected[1])<1,'Docked comparison keeps all node centers in view');
  await click('#tab-discussion');
  await evaluate('document.getElementById("comment").focus()');
  await key(2);
  assert.equal((await evaluate('window.refactor.view()')).mode,'both','Typing in feedback does not switch views');
  await evaluate('document.getElementById("comment").value="";document.getElementById("comment").dispatchEvent(new Event("input"));document.activeElement.blur()');
  await click('#tab-stages');
  await click('#panel-close');
  await key(2);
  assert.equal((await evaluate('window.refactor.view()')).mode,'future');
  await key(1);
  assert.equal((await evaluate('window.refactor.view()')).mode,'current');
  await click('#filter-search');await evaluate('document.getElementById("search").focus()');
  await key(3);
  assert.equal((await evaluate('window.refactor.view()')).mode,'current','Typing in search does not switch views');
  await evaluate('document.getElementById("search").value="";document.getElementById("search").dispatchEvent(new Event("input"));document.activeElement.blur()');await click('#filter-close');
  assert.deepEqual(await toolbarBounds(),controlsBefore,'Toolbar does not move when modes and panel change');
  const initialCheckpointFile = path.join(temp,'initial-checkpoint.json');
  fs.writeFileSync(initialCheckpointFile,JSON.stringify(originalCheckpoint));
  assert.equal(originalView.layout,'spatial');
  assert(originalView.graphs.before.bloom, '3D graph uses bloom postprocessing');
  assert(new Set(rendered.map(n=>Math.round(n.z))).size > 1, 'Force layout occupies depth');
  assert.equal(await evaluate('document.getElementById("connections").value'),'all');
  await click('button[data-highlight="finding"]');
  const highlight = await evaluate('window.refactor.view().graphs.before.nodes');
  assert(highlight.some(n=>n.finding && n.emphasized && !n.muted), 'Finding filter highlights matching nodes');
  assert(highlight.some(n=>!n.finding && n.muted), 'Finding filter dims other nodes');
  await click('button[data-highlight="removed"]');
  assert.deepEqual((await evaluate('window.refactor.view()')).highlights, ['finding','removed']);
  await click('#clear-highlights');
  assert((await evaluate('window.refactor.view().graphs.before.nodes')).every(n=>!n.muted && !n.emphasized));
  await click('button[data-layout="hierarchy"]');
  await delay(200);
  const hierarchy = await evaluate('window.refactor.view()');
  assert.equal(hierarchy.layout,'hierarchy');
  assert.equal(hierarchy.graphs.before.bloom,false);
  assert.notDeepEqual(hierarchy.graphs.before.nodes.map(n=>[n.x,n.y,n.z]),rendered.map(n=>[n.x,n.y,n.z]));
  assert.equal(await evaluate('document.getElementById("connections").value'),'focus');
  await click('button[data-layout="spatial"]');
  await delay(200);
  assert.deepEqual((await evaluate('window.refactor.view().graphs.before.nodes')).map(n=>[n.x,n.y,n.z]),rendered.map(n=>[n.x,n.y,n.z]), 'Spatial layout survives round trip');
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),originalCheckpoint, 'Display controls do not change review decisions');
  await navigationChecks();
  if(!visual){
    await relationChecks();
    const saved=await evaluate('window.refactor.checkpoint()');
    await click('#next-step');await diagramReady();
    assert.match(await evaluate('document.getElementById("review-position").textContent'),/1 из 3/);
    await click('#next-step');await diagramReady();
    assert.equal(await evaluate('document.getElementById("review-title").textContent'),'Reuse pricing in imports');
    await click('#next-step');await diagramReady();
    assert.match(await evaluate('document.getElementById("review-position").textContent'),/3 из 3/);
    assert.equal(await evaluate('document.getElementById("next-step").disabled'),true);
    const shot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-review-nav.png',Buffer.from(shot.data,'base64'));
    await click('#previous-step');await click('#review-overview');
    assert.equal(await evaluate('document.getElementById("step").value'),'all');
    await evaluate('document.getElementById("review-scope").value="selected";document.getElementById("review-scope").dispatchEvent(new Event("change"))');
    assert.equal(await evaluate('document.getElementById("next-step").disabled'),true);
    await evaluate('document.getElementById("review-scope").value="all";document.getElementById("review-scope").dispatchEvent(new Event("change"))');
    assert.deepEqual(await evaluate('window.refactor.checkpoint()'),saved,'Review navigation never selects proposals');
    await key(5);await key(1);
  }
  if (visual) {
    await delay(300);
    const capture = async name => {
      const screenshot = await send('Page.captureScreenshot', {format:'png'});
      fs.writeFileSync('/tmp/refactor-real-' + name + '.png', Buffer.from(screenshot.data, 'base64'));
    };
    await capture('current');
    await click('button[data-highlight="finding"]');
    await delay(150); await capture('findings');
    await click('#clear-highlights');
    await click('button[data-layout="hierarchy"]');
    await delay(200); await capture('hierarchy');
    await key(3); await click('#panel-toggle');
    await delay(200); await capture('docked');
    await click('#tab-discussion'); await delay(100); await capture('discussion');
    await click('#tab-stages');
    await click('#panel-close'); await key(1);
    await click('button[data-layout="spatial"]');
    await click('#panel-toggle');
    const first = doc.proposals.find(p => !p.depends_on.length);
    if (first) await click('[aria-label=' + JSON.stringify('Select ' + first.title) + ']');
    await click('#panel-close');
    await click('button[data-mode="future"]');
    await delay(300); await capture('future');
    await click('button[data-mode="both"]');
    await delay(300); await capture('both');
    await click('#panel-toggle');
    const example=doc.proposals.find(p=>p.id==='transition-reactions') || first;
    if(example){
      const saved=await evaluate('window.refactor.checkpoint()');
      await click('[data-review='+JSON.stringify(example.id)+']');
      await diagramReady();await explanationChecks();await delay(200);await capture('diagram');
      assert.deepEqual(await evaluate('window.refactor.checkpoint()'),saved,'Diagram preview does not select or approve stages');

      await click('#play-transition');
      for(let i=0;i<100&&!await evaluate('Boolean(window.refactor.view().animation)');i++)await delay(50);
      assert(await evaluate('Boolean(window.refactor.view().animation)'),'Real proposal starts playback');
      await delay(600);await click('#transition-toggle');await capture('transition');
      assert.equal((await evaluate('window.refactor.view().animation')).playing,false);
      assert.deepEqual(await evaluate('window.refactor.checkpoint()'),saved,'Real proposal playback preserves decisions');
      await click('#transition-close');

      await evaluate('document.getElementById("step").value="all";document.getElementById("step").dispatchEvent(new Event("input"))');
      await delay(100);await diagramReady();
      assert((await evaluate('window.refactor.view().diagram')).before.nodes.length>10,'Full diagram also renders');
      await capture('diagram-full');
    }
    assert.deepEqual(exceptions, [], 'Uncaught browser exceptions');
    assert.equal(await evaluate('document.getElementById("message").textContent'), '');
    console.log('PASS: real architecture renders in current/future/compare modes (isolated browser session)');
  } else {
  assert.equal((await evaluate('window.refactor.status()')).revision, 1);
  assert.equal((await evaluate('window.refactor.view()')).mode, 'current');
  assert(await evaluate('document.getElementById("before").getBoundingClientRect().height > innerHeight * .5'),'Main graph keeps half the viewport: '+JSON.stringify(await evaluate('({height:document.getElementById("before").getBoundingClientRect().height,toolbar:document.querySelector(".toolbar").getBoundingClientRect().height,review:document.getElementById("review-nav").getBoundingClientRect().height})')));
  assert(await evaluate('document.getElementById("before").getBoundingClientRect().width > innerWidth * .95'));
  await click('#panel-toggle');
  const beforePreview=await evaluate('window.refactor.checkpoint()');
  await click('[data-review="extract-pricing"]');
  await diagramReady();
  assert.equal((await evaluate('window.refactor.view()')).layout,'diagram');
  let schema=await evaluate('window.refactor.view().diagram');
  assert(!schema.before.nodes.includes('pricing') && schema.after.nodes.includes('pricing'),'Diagram previews an unselected proposal with exact before/after');
  assert(schema.after.edges.some(e=>e.label==='вызывает'),'Diagram labels relation verbs');
  assert.match(await evaluate('document.getElementById("review-note").textContent'),/предпросмотр|Предпросмотр/);
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforePreview);
  await explanationChecks();
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
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforePreview,'Playing a transition does not alter decisions');
  await click('#transition-replay');assert((await evaluate('window.refactor.view().animation')).progress<1);
  await click('#transition-close');assert.equal(await evaluate('window.refactor.view().animation'),null);

  await click('button[data-layout="spatial"]');await renderedScene();
  await click('#play-transition');
  for(let i=0;i<100&&!await evaluate('Boolean(window.refactor.view().animation)');i++)await delay(50);
  assert.equal((await evaluate('window.refactor.view()')).layout,'diagram','Playback from 3D uses the diagram');
  await pressKey('Escape');
  assert.equal((await evaluate('window.refactor.view()')).layout,'spatial','Closing playback restores 3D');
  assert.equal(await evaluate('window.refactor.view().animation'),null);
  await click('#play-transition');
  for(let i=0;i<100&&!await evaluate('Boolean(window.refactor.view().animation)');i++)await delay(50);
  await click('#next-step');await diagramReady();
  assert.equal(await evaluate('window.refactor.view().animation'),null,'Navigation cancels the old transition');
  assert.equal(await evaluate('document.getElementById("transition-view").hidden'),true);
  await click('#previous-step');await diagramReady();
  assert.deepEqual(await evaluate('window.refactor.checkpoint()'),beforePreview,'Playback navigation keeps decisions intact');

  await click('button[data-layout="spatial"]');
  await evaluate('document.getElementById("step").value="all";document.getElementById("step").dispatchEvent(new Event("input"))');
  await click('button[data-mode="current"]');
  await click('#panel-toggle');
  await click('[aria-label="Select Reuse pricing in imports"]');
  assert.match(await evaluate('document.querySelector("[data-proposal= reuse-pricing] .proposal-error").textContent'), /Extract pricing rules/);
  await click('[data-prerequisite="extract-pricing"]');
  assert(await evaluate('document.querySelector("[data-proposal=extract-pricing]").classList.contains("proposal-located")'));
  assert.deepEqual((await evaluate('window.refactor.status()')).selected, []);
  await click('[aria-label="Select Extract pricing rules"]');
  await click('[data-discuss="extract-pricing"]');
  assert.equal(await evaluate('document.getElementById("pane-discussion").hidden'),false,'Discuss opens the conversation directly');
  assert.equal(await evaluate('document.getElementById("comment-target").value'),'extract-pricing');
  await evaluate('document.getElementById("comment").value = "Keep rounding unchanged";document.getElementById("comment").dispatchEvent(new Event("input"))');
  await click('#send');
  assert(await evaluate('document.getElementById("approve").disabled'));
  assert.match(await evaluate('document.getElementById("chat").textContent'),/В очереди в браузере/);
  assert.match(await evaluate('document.getElementById("send-status").textContent'),/добавлено в очередь/);
  await evaluate('document.getElementById("comment").value="My unsent draft";document.getElementById("comment").dispatchEvent(new Event("input"))');
  run('build','--checkpoint',initialCheckpointFile,'--output',path.join(temp,'workbench.html'));
  await send('Page.reload');
  await delay(250); await ready();
  await click('#panel-toggle');
  assert.deepEqual((await evaluate('window.refactor.status()')).selected, ['extract-pricing']);
  assert.match(await evaluate('document.getElementById("chat").textContent'), /Keep rounding unchanged/);
  assert.equal(await evaluate('document.getElementById("comment").value'),'My unsent draft','Reload preserves the draft');
  assert.equal(await evaluate('document.getElementById("comment-target").value'),'extract-pricing','Reload preserves the draft topic');
  const events = await evaluate('window.refactor.readEvents(0)');
  assert.equal(events.length, 2);
  const checkpoint = await evaluate('window.refactor.checkpoint()');
  const captured = path.join(temp, 'captured.json');
  fs.writeFileSync(captured, JSON.stringify(checkpoint));
  run('checkpoint', '--input', captured, '--output', path.join(temp, 'checkpoint.json'));
  await click('#tab-stages');
  await evaluate(`(() => {
    const card=document.querySelector('[data-proposal="extract-pricing"]');
    card.querySelector('details').open=true;
    window.stableCard=card;window.stableDetails=card.querySelector('details');
    document.getElementById('pane-stages').scrollTop=100;
    window.stableScroll=document.getElementById('pane-stages').scrollTop;
    window.stableGraph=JSON.stringify(window.refactor.view().graphs);
  })()`);
  await evaluate(`window.refactor.acknowledge(${events.at(-1).id})`);
  assert(await evaluate(`window.stableCard===document.querySelector('[data-proposal="extract-pricing"]') && window.stableDetails.open`),'Agent acknowledgement preserves card DOM and expanded details');
  assert.equal(await evaluate('document.getElementById("pane-stages").scrollTop'),await evaluate('window.stableScroll'),'Agent acknowledgement preserves scroll');
  assert.equal(await evaluate('JSON.stringify(window.refactor.view().graphs)'),await evaluate('window.stableGraph'),'Acknowledgement does not rebuild the graph');
  assert.match(await evaluate('document.getElementById("chat").textContent'),/Сохранено агентом/);
  assert.equal(await evaluate('document.getElementById("comment").value'),'My unsent draft');
  doc.revision = 2; doc.addressed_event_id = events.at(-1).id;
  doc.reply = 'The first stage explicitly preserves rounding.\n\n' + 'The implementation must retain the existing behavior and verify it at each step. '.repeat(18);
  doc.proposals[0].steps.push('Preserve current rounding and discount precedence.');
  await evaluate(`window.refactor.publish(${JSON.stringify(doc)})`);
  assert.deepEqual((await evaluate('window.refactor.status()')).selected, []);
  assert(!(await evaluate('document.getElementById("approve").disabled')));
  assert.equal(await evaluate('document.getElementById("pane-stages").hidden'),false,'Reply does not force a tab switch');
  assert.equal(await evaluate('document.getElementById("reply-dot").hidden'),false,'Unread answer is visible');
  assert.match(await evaluate('document.getElementById("revision-notice").textContent'),/выбор сброшен/);
  assert(await evaluate(`document.querySelector('[data-proposal="extract-pricing"] details').open`),'Changed proposal retains expansion');
  assert.equal(await evaluate('document.getElementById("comment").value'),'My unsent draft','Publish preserves draft');
  await click('#panel-toggle');
  assert.equal(await evaluate('document.getElementById("pane-discussion").hidden'),false);
  assert.equal(await evaluate('document.getElementById("reply-dot").hidden'),true,'Opening the answer marks it as seen');
  assert.match(await evaluate('document.querySelector(".agent-reply").textContent'),/preserves rounding/);
  assert(await evaluate(`(() => {const c=document.getElementById('comment').getBoundingClientRect(),p=document.querySelector('aside').getBoundingClientRect();return c.top>=p.top && c.bottom<=p.bottom;})()`),'Composer stays visible');
  await evaluate(`(() => {
    document.getElementById('chat').scrollTop=0;
    document.getElementById('comment').focus({preventScroll:true});
    window.readingScroll=document.getElementById('chat').scrollTop;
    window.firstReply=document.querySelector('.agent-reply');
  })()`);
  await evaluate(`window.refactor.acknowledge(${events.at(-1).id})`);
  assert.equal(await evaluate('document.activeElement.id'),'comment','Acknowledgements do not steal typing focus');
  doc.revision=3;doc.reply='A second response while you are reading the earlier one. '+doc.reply;
  await evaluate(`window.refactor.publish(${JSON.stringify(doc)})`);
  assert.equal(await evaluate('document.getElementById("chat").scrollTop'),await evaluate('window.readingScroll'),'Incoming answer does not move the reader');
  assert(await evaluate('window.firstReply===document.querySelector(".agent-reply")'),'Reply history remains in place');
  assert.equal(await evaluate('document.querySelectorAll(".agent-reply").length'),2);
  assert.equal(await evaluate('document.activeElement.id'),'comment','Publish does not steal typing focus');
  assert.equal(await evaluate('document.getElementById("new-reply").hidden'),false);
  await click('#new-reply');
  assert.equal(await evaluate('document.getElementById("reply-dot").hidden'),true);
  const panelScreenshot=await send('Page.captureScreenshot',{format:'png'});
  fs.writeFileSync('/tmp/refactor-workshop-discussion.png',Buffer.from(panelScreenshot.data,'base64'));
  await click('#tab-stages');
  await evaluate(`window.stableCard=document.querySelector('[data-proposal="extract-pricing"]')`);
  await click('[aria-label="Select Extract pricing rules"]');
  assert(await evaluate(`window.stableCard===document.querySelector('[data-proposal="extract-pricing"]') && window.stableCard.querySelector('details').open`),'Selection preserves expanded card identity');
  assert.equal(await evaluate('document.activeElement.getAttribute("aria-label")'),'Select Extract pricing rules','Selection preserves keyboard focus');
  await click('[aria-label="Select Reuse pricing in imports"]');
  await click('#tab-plans');await click('#add-plan');
  await evaluate(`(()=>{const input=document.querySelector('[data-plan-title="plan-2"]');input.value='Second pass';input.dispatchEvent(new Event('change'));const select=document.querySelector('[data-plan-assign="reuse-pricing"]');select.value='plan-2';select.dispatchEvent(new Event('change'));})()`);
  assert.deepEqual(await evaluate('M.plans(state).map(g=>[g.title,g.proposal_ids,g.depends_on])'),[['План 1',['extract-pricing'],[]],['Second pass',['reuse-pricing'],['plan-1']]]);
  const plansScreenshot=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync('/tmp/refactor-workshop-plans.png',Buffer.from(plansScreenshot.data,'base64'));
  await click('#tab-stages');
  await reviewWorkflowChecks();
  assert.deepEqual(await toolbarBounds(),controlsBefore,'Long stage titles do not resize toolbar controls');
  await evaluate('document.getElementById("step").value="2";document.getElementById("step").dispatchEvent(new Event("input"))');
  await click('button[data-layout="diagram"]');
  await diagramReady();
  assert((await evaluate('window.refactor.view().diagram')).before.nodes.includes('pricing'),'Step 2 compares against step 1, not the original baseline');
  assert((await evaluate('window.refactor.view().diagram')).after.edges.every(e=>e.id==='worker-pricing'),'Step diagram isolates its own changed relations');
  await click('button[data-mode="both"]');await diagramReady();
  await click('#after-diagram [data-edge="worker-pricing"] text');
  await click('[data-edge-badge="after"]');
  assert.match(await evaluate('document.getElementById("edge-popup").textContent'),/Добавится/);
  assert.match(await evaluate('document.getElementById("edge-popup").textContent'),/Предполагаемая связь/);
  assert.match(await evaluate('document.getElementById("edge-popup").textContent'),/Reuse pricing in imports/);
  assert.equal(await evaluate('document.querySelector("[data-edge-badge=before]").hidden'),true,'Added edge has no invented counterpart in Before');
  await click('#edge-popup-close');

  await evaluate('document.getElementById("step").value="all";document.getElementById("step").dispatchEvent(new Event("input"))');
  await click('button[data-layout="spatial"]');

  await click('[aria-label="Select Remove store fixture"]');
  await click('#panel-close');
  await click('button[data-mode="future"]');
  await click('button[data-highlight="removed"]');
  assert((await evaluate('window.refactor.view().graphs.after.nodes')).some(n=>n.id==='store' && n.change==='removed' && n.emphasized && !n.muted));
  await evaluate('document.getElementById("step").value="2";document.getElementById("step").dispatchEvent(new Event("input"))');
  await delay(100);
  assert(!(await evaluate('window.refactor.view().graphs.after.nodes')).some(n=>n.change==='removed'), 'Stage prefix excludes later removal');
  await evaluate('document.getElementById("step").value="all";document.getElementById("step").dispatchEvent(new Event("input"))');
  await click('#clear-highlights');
  await click('#panel-toggle');
  await click('[aria-label="Select Remove store fixture"]');
  await click('#panel-close');
  const future = await evaluate('window.refactor.view()');
  assert.equal(future.mode, 'future');
  assert(future.graphs.after.nodes.some(n => n.change === 'added'), 'Added component glows');
  assert(future.graphs.after.edges.some(e => e.change === 'added'), 'Added connection is highlighted');
  const beforeByID = new Map(future.graphs.before.nodes.map(n => [n.id, n]));
  for (const n of future.graphs.after.nodes.filter(n => beforeByID.has(n.id))) {
    const before = beforeByID.get(n.id);
    assert.deepEqual([n.x,n.y,n.z], [before.x,before.y,before.z], 'Shared nodes retain their positions');
  }
  await click('button[data-mode="both"]');
  assert(await evaluate('document.getElementById("before").getBoundingClientRect().width > innerWidth * .45'));
  assert(await evaluate('document.getElementById("after").getBoundingClientRect().width > innerWidth * .45'));
  await send('Input.dispatchMouseEvent', {type:'mouseWheel', x:250, y:450, deltaX:0, deltaY:-180});
  await delay(200);
  const synced = await evaluate('window.refactor.view().graphs');
  assert.deepEqual(synced.before.camera, synced.after.camera, 'Compare cameras stay synchronized');
  await click('button[data-mode="future"]');
  await evaluate('document.getElementById("level").value="2"; document.getElementById("level").dispatchEvent(new Event("input"))');
  await evaluate('window.refactor.focus(["handler"])');
  await delay(150);
  assert.match(await evaluate('document.getElementById("detail").textContent'), /Pricing mixed/);
  const screenshot = await send('Page.captureScreenshot', {format: 'png'});
  if(process.env.REFACTOR_SCREENSHOT) fs.writeFileSync(process.env.REFACTOR_SCREENSHOT, Buffer.from(screenshot.data, 'base64'));
  await click('#approve');
  const approved = await evaluate('window.refactor.status()');
  assert(approved.approval);
  const sealed = await evaluate(`window.refactor.seal(${approved.revision}, ${approved.approval.event_id})`);
  assert(await evaluate('document.getElementById("approve").disabled'));
  assert(await evaluate('document.getElementById("send").disabled'));
  fs.writeFileSync(captured, JSON.stringify(sealed));
  run('checkpoint', '--input', captured, '--output', path.join(temp, 'approved.json'), '--require-approved');
  run('plan', '--checkpoint', captured, '--output', path.join(temp, 'plan.md'));
  assert(fs.readFileSync(path.join(temp, 'plan.md'), 'utf8').includes('### 2. Reuse pricing in imports'));
  const report = path.join(temp, 'report.html');
  run('build', '--checkpoint', captured, '--output', report);
  await send('Page.navigate', {url: 'file://' + report});
  await delay(250); await ready();
  assert((await evaluate('window.refactor.status()')).sealed);
  assert.equal(await evaluate('document.querySelectorAll("script[src]").length'), 0, 'Report bundles dependencies');
  await send('Emulation.setDeviceMetricsOverride', {width: 390, height: 844, deviceScaleFactor: 1, mobile: true});
  await delay(100);
  await click('#panel-toggle');
  assert(await evaluate('document.querySelector(".views").getBoundingClientRect().bottom <= document.querySelector("aside").getBoundingClientRect().top'), 'Mobile panel docks below graphs');
  assert(await evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), 'Mobile layout overflows horizontally');
  assert.deepEqual(exceptions, [], 'Uncaught browser exceptions');
  console.log('PASS: CDP UI, stable workshop tabs/scroll/expansion, feedback delivery/reply indicators, draft recovery, proposal updates, approval, sealing, offline report and mobile layout');
  }
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
