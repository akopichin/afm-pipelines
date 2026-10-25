import ELK from 'elkjs/lib/elk.bundled.js';
import {matchesEdge,nearestPoint} from './relations.mjs';

const NS='http://www.w3.org/2000/svg';
const verbs={calls:'вызывает',imports:'импортирует',constructs:'создаёт',implements:'реализует',depends_on:'зависит от'};
const color={added:'#66dbad',changed:'#ffd079',removed:'#ff8e9f',affected:'#84deff'};
const svg=(tag,attributes={},text)=>{
  const e=document.createElementNS(NS,tag);
  for(const [k,v] of Object.entries(attributes))e.setAttribute(k,String(v));
  if(text!==undefined)e.textContent=text;
  return e;
};
function lines(text,width=30,count=3) {
  const words=String(text||'').split(/\s+/), result=[''];
  for(const word of words){let i=result.length-1;if(result[i].length+word.length>width && result[i])result.push(word);else result[i]+=(result[i]?' ':'')+word;}
  return result.slice(0,count).map((line,i)=>line.slice(0,width+4)+(line.length>width+4||i===count-1&&result.length>count?'…':''));
}

export class Diagram {
  constructor(elements,onNode,onEdge,onError) {
    this.elements=elements;this.onNode=onNode;this.onEdge=onEdge;this.onError=onError;
    this.selectedEdges=[];this.elk=new ELK();this.sequence=0;this.ready=false;this.zoom=1;this.pan={x:0,y:0};this.svgs={};
    for(const [key,el] of Object.entries(elements)) {
      const root=svg('svg',{'aria-label':'Architecture diagram',role:'img'}),scene=svg('g');
      root.append(scene);el.replaceChildren(root);this.svgs[key]={root,scene};
      let drag, suppressClick=false;
      root.addEventListener('click',e=>{if(suppressClick||this.panMode){e.preventDefault();e.stopImmediatePropagation();}},{capture:true});
      root.addEventListener('pointerdown',e=>{
        suppressClick=Boolean(this.panMode);
        if(e.button!==0 || !this.panMode && e.target.closest('[data-node],[data-edge]'))return;
        drag={x:e.clientX,y:e.clientY};e.preventDefault();root.setPointerCapture(e.pointerId);
      });
      root.addEventListener('pointermove',e=>{if(!drag)return;suppressClick=true;this.pan.x+=e.clientX-drag.x;this.pan.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};this.resize();});
      root.addEventListener('pointerup',()=>{drag=null;});root.addEventListener('pointercancel',()=>{drag=null;});
      root.addEventListener('wheel',e=>{
        e.preventDefault();
        const rect=root.getBoundingClientRect(),old=this.zoom;
        const delta=e.deltaY*(e.deltaMode===1?16:e.deltaMode===2?rect.height:1);
        this.zoom=Math.max(.25,Math.min(12,old*Math.exp(-delta*.001)));
        const ratio=this.zoom/old,x=e.clientX-rect.left-rect.width/2,y=e.clientY-rect.top-rect.height/2;
        this.pan.x=x-(x-this.pan.x)*ratio;this.pan.y=y-(y-this.pan.y)*ratio;
        this.resize();
      },{passive:false});
    }
  }
  setPanMode(value){this.panMode=Boolean(value);}
  async arrange(data) {
    const nodes=new Map(data.nodes.map(n=>[n.id,{id:n.id,width:250,height:108,children:[],layoutOptions:{'elk.padding':'[top=54,left=28,bottom=28,right=28]'}}]));
    const roots=[];
    for(const n of data.nodes) {
      if(nodes.has(n.parent))nodes.get(n.parent).children.push(nodes.get(n.id));
      else roots.push(nodes.get(n.id));
    }
    for(const n of nodes.values())if(n.children.length){delete n.width;delete n.height;}else delete n.children;
    const grouped=new Map();
    for(const e of data.edges.filter(e=>!e.containment)) {
      const key=JSON.stringify([e.source,e.target,e.kind,e.confidence,e.change]);
      if(!grouped.has(key))grouped.set(key,{...e,ids:[],evidences:[]});
      grouped.get(key).ids.push(e.id);
      grouped.get(key).evidences.push(e.evidence);
    }
    const edges=[...grouped.values()];
    for(const e of edges)e.evidence=[...new Set(e.evidences)].join('\n\n');
    const graph={id:'diagram-root',children:roots,edges:edges.map((e,i)=>({id:'edge-'+i,sources:[e.source],targets:[e.target],
      labels:[{id:'label-'+i,text:(verbs[e.kind]||e.kind)+(e.ids.length>1?' ×'+e.ids.length:''),width:120,height:20}]})),
      layoutOptions:{'elk.algorithm':'layered','elk.direction':'DOWN','elk.edgeRouting':'ORTHOGONAL',
        'elk.hierarchyHandling':'INCLUDE_CHILDREN','elk.spacing.nodeNode':'60','elk.layered.spacing.nodeNodeBetweenLayers':'90',
        'elk.padding':'[top=30,left=30,bottom=30,right=30]','elk.layered.nodePlacement.strategy':'NETWORK_SIMPLEX'}};
    const layout=await this.elk.layout(graph);
    return {layout,data,edges};
  }
  render(data,signature) {
    if(signature===this.signature){this.resize();return;}
    this.signature=signature;this.ready=false;const sequence=++this.sequence;
    Promise.all([this.arrange(data.before),this.arrange(data.after)]).then(([before,after])=>{
      if(sequence!==this.sequence)return;
      this.layouts={before,after};this.bounds={width:Math.max(before.layout.width,after.layout.width),height:Math.max(before.layout.height,after.layout.height)};
      this.draw('before',before);this.draw('after',after);this.ready=true;this.resize();
    }).catch(e=>{if(sequence===this.sequence)this.onError('Не удалось построить схему: '+e.message);});
  }
  draw(key,{layout,data,edges}) {
    const scene=this.svgs[key].scene;scene.replaceChildren();
    const defs=svg('defs'),marker=svg('marker',{id:'arrow-'+key,viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:7,markerHeight:7,orient:'auto-start-reverse'});
    marker.append(svg('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'#aabdd1'}));defs.append(marker);scene.append(defs);
    const byID=new Map(data.nodes.map(n=>[n.id,n])), boxes=[],drawnEdges=[],origins=new Map();
    function flatten(node,ox=0,oy=0){
      const x=ox+(node.x||0),y=oy+(node.y||0);
      origins.set(node.id,{x,y});
      if(byID.has(node.id))boxes.push({...node,x,y});
      for(const edge of node.edges||[])drawnEdges.push({edge,x,y});
      for(const child of node.children||[])flatten(child,x,y);
    }
    flatten(layout);
    for(const box of boxes.filter(n=>n.children?.length))this.drawNode(scene,box,byID.get(box.id),true);
    for(const record of drawnEdges) {
      const {edge}=record;
      // ELK stores root edges in their common ancestor's coordinate system.
      const {x,y}=origins.get(edge.container)||record;
      const info=edges[Number(edge.id.slice(5))];if(!info)continue;
      const g=svg('g',{'data-edge':info.id,tabindex:0,role:'button','data-source':info.source,'data-target':info.target,'aria-label':`${byID.get(info.source)?.label} → ${byID.get(info.target)?.label}: ${verbs[info.kind]||info.kind}`,opacity:info.muted?.2:1});
      g.dataset.edgeIds=JSON.stringify(info.ids);
      for(const section of edge.sections||[]) {
        const points=[section.startPoint,...(section.bendPoints||[]),section.endPoint];
        const d=points.map((p,i)=>(i?'L':'M')+(p.x+x)+' '+(p.y+y)).join(' ');
        g.append(svg('path',{d,fill:'none',stroke:'transparent','stroke-width':20,'vector-effect':'non-scaling-stroke','pointer-events':'stroke',class:'edge-hit'}));
        g.append(svg('path',{d,fill:'none',class:'edge-line','pointer-events':'none',
          stroke:color[info.change]||'#7c94ac','stroke-width':info.change?2.8:1.6,
          'stroke-dasharray':info.confidence==='inferred'?'7 5':'none','marker-end':section.outgoingSections?.length?'none':'url(#arrow-'+key+')'}));
      }
      for(const label of edge.labels||[]) {
        g.append(svg('rect',{x:label.x+x-4,y:label.y+y-2,width:label.width+8,height:24,rx:4,fill:'#121f2c'}));
        g.append(svg('text',{x:label.x+x+label.width/2,y:label.y+y+14,'text-anchor':'middle',fill:color[info.change]||'#c0d0de','font-size':13},label.text));
      }
      const activate=e=>{
        const path=g.querySelector('.edge-line'),matrix=path?.getScreenCTM();let fraction=.5;
        if(matrix&&Number.isFinite(e?.clientX)){
          const length=path.getTotalLength(),points=Array.from({length:81},(_,i)=>path.getPointAtLength(length*i/80).matrixTransform(matrix));
          fraction=nearestPoint(points,e.clientX,e.clientY).fraction;
        }
        this.onEdge(info,key,fraction);
      };
      g.addEventListener('click',activate);g.addEventListener('keydown',e=>{if(e.key==='Enter'&&!this.panMode){e.preventDefault();activate();}});scene.append(g);
    }
    for(const box of boxes.filter(n=>!n.children?.length))this.drawNode(scene,box,byID.get(box.id),false);
    this.setSelection(this.selectedEdges);
  }
  setSelection(ids){
    this.selectedEdges=ids;
    for(const {scene} of Object.values(this.svgs)){
      const endpoints=new Set();
      for(const group of scene.querySelectorAll('[data-edge]')){
        const selected=JSON.parse(group.dataset.edgeIds).some(id=>ids.includes(id));
        group.classList.toggle('relation-selected',selected);group.setAttribute('aria-pressed',String(selected));
        if(selected){endpoints.add(group.dataset.source);endpoints.add(group.dataset.target);}
      }
      for(const node of scene.querySelectorAll('[data-node]'))node.classList.toggle('relation-selected',endpoints.has(node.dataset.node));
    }
  }
  edgeAnchor(key,ids,fraction=.5){
    if(!this.ready)return null;
    const entry=this.layouts[key].edges.find(e=>matchesEdge(e,ids));if(!entry)return null;
    const group=[...this.svgs[key].scene.querySelectorAll('[data-edge]')].find(g=>g.dataset.edge===entry.id);
    const path=group?.querySelector('.edge-line'),matrix=path?.getScreenCTM();if(!matrix)return null;
    const point=path.getPointAtLength(path.getTotalLength()*fraction).matrixTransform(matrix);
    return {x:point.x,y:point.y,edge:entry};
  }
  animate(element,onProgress){
    if(!this.ready)throw new Error('Схема ещё строится');
    const root=svg('svg',{'aria-label':'Переход от текущей архитектуры к предлагаемой',role:'img'}),scene=svg('g');root.append(scene);element.replaceChildren(root);
    const sourceScenes=this.svgs,nodeFrames=[],edgeFrames=[],nodeBoxes={};
    for(const side of ['before','after']){
      nodeBoxes[side]=new Map([...sourceScenes[side].scene.querySelectorAll('[data-node]')].map(g=>[g.dataset.node,Object.fromEntries(['x','y','width','height'].map(k=>[k,Number(g.querySelector('rect').getAttribute(k))]))]));
      const defs=sourceScenes[side].scene.querySelector('defs').cloneNode(true);
      for(const marker of defs.querySelectorAll('[id]'))marker.id='transition-'+marker.id;scene.append(defs);
    }
    const mix=(a,b,t)=>a+(b-a)*t,clamp=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);
    const boxAt=(id,t)=>{
      const a=nodeBoxes.before.get(id)||nodeBoxes.after.get(id),b=nodeBoxes.after.get(id)||a;
      return {x:mix(a.x,b.x,t),y:mix(a.y,b.y,t),width:mix(a.width,b.width,t),height:mix(a.height,b.height,t)};
    };
    const nodes={before:new Map([...sourceScenes.before.scene.querySelectorAll('[data-node]')].map(g=>[g.dataset.node,g])),after:new Map([...sourceScenes.after.scene.querySelectorAll('[data-node]')].map(g=>[g.dataset.node,g]))};
    const edges={};for(const side of ['before','after'])edges[side]=new Map([...sourceScenes[side].scene.querySelectorAll('[data-edge]')].map(g=>[JSON.parse(g.dataset.edgeIds).sort().join('\0'),g]));
    const samples=path=>{const length=path.getTotalLength();return Array.from({length:33},(_,i)=>path.getPointAtLength(length*i/32));};
    const cloneGroup=g=>{
      const clone=g.cloneNode(true);clone.removeAttribute('tabindex');clone.removeAttribute('role');clone.classList.remove('relation-selected');
      for(const e of clone.querySelectorAll('.edge-hit,title'))e.remove();
      for(const e of clone.querySelectorAll('[marker-end]'))e.setAttribute('marker-end',e.getAttribute('marker-end').replace('#arrow-','#transition-arrow-'));
      return clone;
    };
    const addNodes=container=>{
      for(const id of new Set([...nodes.before.keys(),...nodes.after.keys()])){
        const original=nodes.before.get(id)||nodes.after.get(id);if((original.querySelector('rect').getAttribute('fill')==='#142332')!==container)continue;
        const both=nodes.before.has(id)&&nodes.after.has(id);
        for(const side of ['before','after']){
          const from=nodes[side].get(id);if(!from)continue;const group=cloneGroup(from),rect=group.querySelector('rect'),base=nodeBoxes[side].get(id);
          scene.append(group);nodeFrames.push(t=>{
            const box=boxAt(id,t),alpha=both?(side==='before'?1-t:t):side==='before'?1-ease(clamp(t/.65)):ease(clamp((t-.25)/.75));
            group.setAttribute('opacity',alpha*Number(from.getAttribute('opacity')||1));
            group.setAttribute('transform',`translate(${box.x-base.x} ${box.y-base.y})`);rect.setAttribute('width',box.width);rect.setAttribute('height',box.height);
            if(!container){const text=group.querySelector('text:last-child');if(text)text.setAttribute('y',base.y+box.height-16);}
            if(rect.getAttribute('stroke')===color.changed)group.style.filter=`drop-shadow(0 0 ${Math.sin(Math.PI*t)*5}px ${color.changed})`;
          });
        }
      }
    };
    addNodes(true);
    for(const id of new Set([...edges.before.keys(),...edges.after.keys()])){
      const old=edges.before.get(id),next=edges.after.get(id);
      const aPaths=old?[...old.querySelectorAll('.edge-line')].map(samples):[],bPaths=next?[...next.querySelectorAll('.edge-line')].map(samples):[];
      for(const side of ['before','after']){
        const from=side==='before'?old:next;if(!from)continue;const group=cloneGroup(from);scene.append(group);
        const paths=[...group.querySelectorAll('.edge-line')];
        const labels=[...group.querySelectorAll('rect,text')],otherLabels=[...(side==='before'?next:old)?.querySelectorAll('rect,text')||[]];
        const labelOffsets=labels.map((label,i)=>otherLabels[i]?{x:Number(otherLabels[i].getAttribute('x'))-Number(label.getAttribute('x')),y:Number(otherLabels[i].getAttribute('y'))-Number(label.getAttribute('y'))}:{x:0,y:0});
        edgeFrames.push((t,progress)=>{
          group.setAttribute('opacity',side==='before'?1-ease(clamp(progress/.08)):ease(clamp((progress-.6)/.4)));
          paths.forEach((path,i)=>{
            const a=aPaths[i]||bPaths[i],b=bPaths[i]||aPaths[i];if(!a||!b)return;
            path.setAttribute('d',a.map((point,j)=>(j?'L':'M')+mix(point.x,b[j].x,t)+' '+mix(point.y,b[j].y,t)).join(' '));
          });
          labels.forEach((label,i)=>label.setAttribute('transform',`translate(${labelOffsets[i].x*(side==='before'?t:1-t)} ${labelOffsets[i].y*(side==='before'?t:1-t)})`));
        });
      }
    }
    addNodes(false);
    const duration=matchMedia('(prefers-reduced-motion: reduce)').matches?0:3600;
    let progress=0,playing=true,last=performance.now(),frame,destroyed=false;
    const paint=()=>{
      const r=element.getBoundingClientRect(),scale=Math.min(r.width/this.bounds.width,r.height/this.bounds.height)*.9;
      root.setAttribute('viewBox',`0 0 ${r.width||1} ${r.height||1}`);
      scene.setAttribute('transform',`translate(${r.width/2} ${r.height/2}) scale(${scale}) translate(${-this.bounds.width/2} ${-this.bounds.height/2})`);
      const nodeProgress=ease(clamp(progress/.6));
      nodeFrames.forEach(update=>update(nodeProgress));edgeFrames.forEach(update=>update(nodeProgress,progress));
      onProgress({progress,playing,phase:progress===1?'done':progress<.6?'nodes':'edges'});
    };
    const tick=now=>{if(destroyed)return;if(playing){progress=duration?Math.min(1,progress+(now-last)/duration):1;if(progress===1)playing=false;}last=now;paint();if(playing)frame=requestAnimationFrame(tick);};
    const resize=new ResizeObserver(paint);resize.observe(element);paint();frame=requestAnimationFrame(tick);
    return {
      toggle(){if(progress===1)progress=0;playing=!playing;last=performance.now();cancelAnimationFrame(frame);paint();if(playing)frame=requestAnimationFrame(tick);},
      replay(){progress=0;playing=true;last=performance.now();cancelAnimationFrame(frame);frame=requestAnimationFrame(tick);},
      inspect(){return {progress,playing};},
      destroy(){destroyed=true;cancelAnimationFrame(frame);resize.disconnect();element.replaceChildren();}
    };
  }

  drawNode(scene,box,node,container) {
    const stroke=color[node.change]||(node.finding?'#c4a2ff':'#6f92b0');
    const g=svg('g',{'data-node':node.id,tabindex:0,role:'button','aria-label':node.label,opacity:node.muted?.2:node.change==='removed'?.6:1});
    g.append(svg('title',{},node.description||node.label));
    g.append(svg('rect',{x:box.x,y:box.y,width:box.width,height:box.height,rx:container?12:7,fill:container?'#142332':'#20354a',
      stroke,'stroke-width':node.emphasized?4:node.change?2.5:1.2,'stroke-dasharray':node.change==='removed'?'7 5':'none'}));
    const labelLines=lines(node.label,container?65:28,container?1:2);
    labelLines.forEach((line,i)=>g.append(svg('text',{x:box.x+14,y:box.y+25+i*21,fill:'#f0f5fa','font-size':16,'font-weight':600},line)));
    const status={added:'+ добавлен',changed:'~ изменён',affected:'↔ связи',removed:'− удалён'}[node.change];
    if(!container)g.append(svg('text',{x:box.x+14,y:box.y+box.height-16,fill:stroke,'font-size':12},lines(status||node.source?.file||node.kind,32,1)[0]));
    const activate=()=>this.onNode(node.id);g.addEventListener('click',e=>{e.stopPropagation();activate();});
    g.addEventListener('keydown',e=>{if(e.key==='Enter'&&!this.panMode){e.preventDefault();activate();}});scene.append(g);
  }
  resize() {
    if(!this.bounds)return;
    const visible=Object.values(this.elements).map(el=>el.getBoundingClientRect()).filter(r=>r.width&&r.height);
    if(!visible.length)return;
    const scale=Math.min(...visible.map(r=>Math.min(r.width/this.bounds.width,r.height/this.bounds.height)))*.93*this.zoom;
    for(const [key,{root,scene}] of Object.entries(this.svgs)) {
      const r=this.elements[key].getBoundingClientRect();root.setAttribute('viewBox',`0 0 ${r.width||1} ${r.height||1}`);
      scene.setAttribute('transform',`translate(${r.width/2+this.pan.x} ${r.height/2+this.pan.y}) scale(${scale}) translate(${-this.bounds.width/2} ${-this.bounds.height/2})`);
    }
  }
  fit(){this.zoom=1;this.pan={x:0,y:0};this.resize();}
  inspect(){return {ready:this.ready,...(this.ready?Object.fromEntries(Object.entries(this.layouts).map(([key,v])=>[key,{nodes:v.data.nodes.map(n=>n.id),edges:v.edges.map(e=>({id:e.id,kind:e.kind,label:verbs[e.kind]||e.kind})),width:v.layout.width,height:v.layout.height}])):{})};}
}
