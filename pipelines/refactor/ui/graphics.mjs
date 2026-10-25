import ForceGraph3D from '3d-force-graph';
import {CanvasTexture, Sprite, SpriteMaterial, Group, SRGBColorSpace,
  Line, BufferGeometry, BufferAttribute, LineDashedMaterial, Mesh, SphereGeometry,
  MeshStandardMaterial, Color, Vector2, Vector3, MOUSE} from 'three';
import {UnrealBloomPass} from 'three/addons/postprocessing/UnrealBloomPass.js';
import {OutputPass} from 'three/addons/postprocessing/OutputPass.js';
import {forceSimulation, forceManyBody, forceLink, forceCenter, forceCollide, forceX, forceY, forceZ} from 'd3-force-3d';
import Layout from './layout.cjs';
import {matchesEdge,nearestPoint} from './relations.mjs';
export {relationNames,edgeIDs} from './relations.mjs';
export {Diagram} from './diagram.mjs';

export const {positions, difference} = Layout;
const colors = {added: '#70f4b4', changed: '#ffd079', affected: '#84deff', removed: '#ff8e9f'};
const palette = ['#89b7ff','#80d7c4','#e9c18b','#9c99d9','#eb9daf','#95cde5','#a7d685','#d9a6e5'];
function groupColor(id) {
  let hash = 0;
  for (const c of id) hash = (Math.imul(hash,31)+c.charCodeAt(0)) >>> 0;
  return palette[hash % palette.length];
}
let spatialCache;

export function spatialPositions(baseline, proposals, level) {
  const signature = JSON.stringify([baseline, proposals, level]);
  if (spatialCache?.signature === signature) return spatialCache.coordinates;
  const visible = positions(baseline, proposals, level);
  const all = new Map([...baseline.nodes, ...proposals.flatMap(p => p.changes.add_nodes)].map(n => [n.id, n]));
  const representative = id => {
    const seen = new Set();
    while (!visible.has(id) && all.has(id) && !seen.has(id)) {seen.add(id); id = all.get(id).parent;}
    return visible.has(id) ? id : null;
  };
  const nodes = [...visible.keys()].sort().map(id => ({id}));
  const links = new Map();
  for (const edge of [...baseline.edges, ...proposals.flatMap(p => p.changes.add_edges),
    ...[...all.values()].filter(n => n.parent).map(n => ({source:n.parent,target:n.id}))]) {
    const source = representative(edge.source), target = representative(edge.target);
    if (source && target && source !== target) links.set(JSON.stringify([source,target].sort()), {source,target});
  }
  // Solve once for the whole review so selection and filters cannot shuffle the comparison.
  const simulation = forceSimulation(nodes, 3).stop()
    .force('charge', forceManyBody().strength(-2200))
    .force('link', forceLink([...links.values()]).id(n => n.id).distance(170).strength(.1))
    .force('center', forceCenter()).force('collision', forceCollide(45))
    .force('x',forceX().strength(.025)).force('y',forceY().strength(.025)).force('z',forceZ().strength(.025));
  simulation.tick(260);
  const coordinates = new Map(nodes.map(n => [n.id, {x:n.x,y:n.y,z:n.z}]));
  spatialCache = {signature,coordinates};
  return coordinates;
}

function orb(node) {
  const group = new Group(), color = colors[node.change] || (node.finding ? '#c4a2ff' : groupColor(node.group || node.id));
  const radius = node.parent ? 15 : 21;
  const sphere = new Mesh(new SphereGeometry(radius, 32, 24), new MeshStandardMaterial({
    color: new Color(color).multiplyScalar(node.muted ? .25 : 1),
    emissive:color, emissiveIntensity:node.muted ? 0 : node.emphasized ? 5 : node.change ? 1.2 : node.focused ? .5 : 0,
    roughness:.4, metalness:.12, wireframe: node.change === 'removed', transparent:true,
    opacity: node.muted ? .3 : node.change === 'removed' ? .7 : 1
  }));
  group.add(sphere);
  const canvas = document.createElement('canvas'); canvas.width = 768; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.font = '500 60px system-ui'; ctx.textAlign = 'center'; ctx.fillStyle = '#d7e5f2';
  let label = node.label;
  while (ctx.measureText(label).width > 740) label = label.slice(0,-1);
  if (label !== node.label) label = label.slice(0,-1) + '…';
  ctx.fillText(label,384,82);
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const text = new Sprite(new SpriteMaterial({map:texture,transparent:true,depthWrite:false,color:'#b5c4d8',opacity:node.muted ? .2 : 1}));
  text.scale.set(190,32,1); text.position.set(0,-radius-20,0);
  text.userData.label = true; text.userData.alwaysVisible = true;
  text.visible = text.userData.alwaysVisible; group.add(text);
  return group;
}

function card(node) {
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 224;
  const ctx = canvas.getContext('2d'), color = colors[node.change] || (node.finding ? '#c4a2ff' : '#93b3d0');
  ctx.shadowColor = color; ctx.shadowBlur = node.emphasized ? 40 : node.change ? 28 : node.focused ? 16 : 0;
  ctx.fillStyle = node.change === 'removed' ? '#291e2d' : '#152737';
  ctx.strokeStyle = color; ctx.lineWidth = node.change ? 4 : 2;
  if (node.change === 'removed') ctx.setLineDash([12, 8]);
  ctx.beginPath(); ctx.roundRect(24, 24, 592, 176, 20); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0; ctx.setLineDash([]);
  ctx.fillStyle = color; ctx.font = '500 22px system-ui';
  const badge = {added: '+ ADDED', changed: '~ CHANGED', affected: '↔ LINKS CHANGED', removed: '− REMOVED'}[node.change];
  ctx.fillText(badge || node.kind.toUpperCase(), 45, 54);
  ctx.fillStyle = '#eef5ff'; ctx.font = '500 56px system-ui';
  const words = node.label.split(/(?<=[/\s:])/), lines = [''];
  for (const word of words) {
    const i = lines.length - 1;
    if (ctx.measureText(lines[i] + word).width > 540 && lines[i]) lines.push(word);
    else lines[i] += word;
  }
  for (let i = 0; i < Math.min(2, lines.length); i++) {
    let line = lines[i];
    while (ctx.measureText(line).width > 530) line = line.slice(0, -1);
    if (line !== lines[i] || (i === 1 && lines.length > 2)) line = line.slice(0, -1) + '…';
    ctx.fillText(line, 45, 116 + i * 61);
  }
  const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({map: texture, transparent: true,
    opacity: node.muted ? .18 : node.change === 'removed' ? .65 : 1, depthWrite: false}));
  sprite.scale.set(215, 75, 1);
  const group = new Group(); group.add(sprite);
  group.userData.change = node.change || null;
  return group;
}

export class Workbench {
  constructor(elements, onNode, onEdge) {
    this.selectedEdges=[];this.onEdge=onEdge;
    this.graphs = {}; this.bloom = {}; this.outputs = {}; this.layout = 'spatial'; this.syncing = false; this.fitted = false; this.signature = '';
    for (const [key, element] of Object.entries(elements)) {
      const choose=(event,node=null,edge=null)=>{
        if(this.panMode||this.panGesture)return;
        const hit=this.pickEdge(key,event?.clientX,event?.clientY);
        if(hit)onEdge(hit.edge,key,hit.fraction);
        else if(node)onNode(node.id);
        else if(edge&&!edge.containment)onEdge(edge,key,.5);
        else onNode(null);
      };
      const graph = new ForceGraph3D(element, {controlType: 'orbit', rendererConfig: {antialias: true, alpha: true}})
        .backgroundColor('#000000').showNavInfo(false).enableNodeDrag(false)
        .nodeThreeObject(node => this.layout === 'spatial' ? orb(node) : card(node)).nodeLabel(() => '')
        .linkColor(edge => matchesEdge(edge,this.selectedEdges)?'#a8e6cb':edge.muted ? '#202c3a' : colors[edge.change] || (edge.containment ? '#3a6888' : '#789cb8'))
        .linkWidth(edge => matchesEdge(edge,this.selectedEdges)?3:edge.change ? 1.3 : this.layout === 'spatial' ? .45 : edge.containment ? .4 : .6)
        .linkOpacity(.5).linkDirectionalArrowLength(edge => edge.containment ? 0 : 7)
        .linkDirectionalArrowRelPos(.72).linkCurvature(edge => edge.containment ? 0 : .12)
        .linkThreeObject(edge => {
          if (edge.change !== 'removed' && edge.confidence !== 'inferred') return null;
          const geometry = new BufferGeometry();
          geometry.setAttribute('position', new BufferAttribute(new Float32Array(6), 3));
          return new Line(geometry, new LineDashedMaterial({color: matchesEdge(edge,this.selectedEdges)?'#a8e6cb':edge.muted ? '#202c3a' : colors[edge.change] || '#789cb8',
            dashSize: 6, gapSize: 4, transparent: true, opacity: .65}));
        })
        .linkPositionUpdate((line, {start, end}) => {
          if (!line.isLine) return false;
          const points = line.geometry.attributes.position;
          points.setXYZ(0, start.x, start.y, start.z); points.setXYZ(1, end.x, end.y, end.z);
          points.needsUpdate = true; line.computeLineDistances(); return true;
        })
        .linkDirectionalParticles(edge => edge.muted || edge.change === 'removed' || edge.containment ? 0 : edge.change || this.layout === 'spatial' ? 2 : 0)
        .linkDirectionalParticleWidth(2).linkDirectionalParticleSpeed(.003)
        .linkLabel(()=> '').onLinkClick((edge,event)=>choose(event,null,edge))
        .onNodeClick((node,event)=>choose(event,node)).onBackgroundClick(event=>choose(event))
        .cooldownTicks(2);
      let hoveredNode;
      element.addEventListener('pointerdown',()=>{this.panGesture=Boolean(this.panMode);},{capture:true});
      element.addEventListener('pointermove',e=>{
        element.style.cursor=!this.panMode&&(hoveredNode||this.pickEdge(key,e.clientX,e.clientY))?'pointer':'';
      });
      graph.controls().enableDamping = true;
      graph.controls().zoomToCursor = true;
      graph.controls().screenSpacePanning = true;
      const bloom = new UnrealBloomPass(new Vector2(1,1), 1.15, .6, .9);
      graph.postProcessingComposer().addPass(bloom);
      const output = new OutputPass();
      graph.postProcessingComposer().addPass(output);
      this.bloom[key] = bloom;
      this.outputs[key] = output;
      let hovered;
      graph.onNodeHover(node => {
        for (const child of hovered?.__threeObj?.children || []) if (child.userData.label) child.visible = child.userData.alwaysVisible;
        for (const child of node?.__threeObj?.children || []) if (child.userData.label) child.visible = true;
        hovered = node;hoveredNode=node;
      });
      graph.controls().addEventListener('change', () => this.sync(key));
      graph.onEngineStop(() => {
        if (!this.fitted && graph.graphData().nodes.length) {
          this.fitted = true;
          requestAnimationFrame(() => this.fit());
        }
      });
      graph.cameraPosition({x: 0, y: 40, z: 1600});
      this.graphs[key] = graph;
    }
    this.elements = elements;
  }
  edgePoints(key,edge){
    const graph=this.graphs[key],camera=graph.camera(),rect=this.elements[key].getBoundingClientRect();
    if(!rect.width)return [];
    const line=edge.__lineObj;
    let points;
    if(line?.isLine){const a=line.geometry.attributes.position;points=Array.from({length:a.count},(_,i)=>new Vector3().fromBufferAttribute(a,i).applyMatrix4(line.matrixWorld));}
    else if(edge.__curve)points=edge.__curve.getPoints(40);
    else if(typeof edge.source==='object'&&typeof edge.target==='object')points=[new Vector3(edge.source.x,edge.source.y,edge.source.z),new Vector3(edge.target.x,edge.target.y,edge.target.z)];
    else return [];
    return points.map(p=>{const v=p.clone().project(camera);return v.z>=-1&&v.z<=1?{x:rect.left+(v.x+1)*rect.width/2,y:rect.top+(1-v.y)*rect.height/2}:null;});
  }
  pickEdge(key,x,y){
    const graph=this.graphs[key];if(!graph||!Number.isFinite(x)||!Number.isFinite(y))return null;
    const camera=graph.camera(),rect=this.elements[key].getBoundingClientRect();
    for(const node of graph.graphData().nodes){
      const world=new Vector3(node.x,node.y,node.z),depth=-world.clone().applyMatrix4(camera.matrixWorldInverse).z;if(depth<=0)continue;
      const screen=world.project(camera),scale=rect.height/(2*Math.tan(camera.fov*Math.PI/360)*depth);
      const dx=x-(rect.left+(screen.x+1)*rect.width/2),dy=y-(rect.top+(1-screen.y)*rect.height/2);
      if(this.layout==='spatial'?Math.hypot(dx,dy)<(node.parent?15:21)*scale:Math.abs(dx)<100*scale&&Math.abs(dy)<32*scale)return null;
    }
    let best=null;
    for(const edge of graph.graphData().links){
      if(edge.containment)continue;
      const hit=nearestPoint(this.edgePoints(key,edge),x,y);
      if(hit.distance<=10&&(!best||hit.distance<best.distance))best={edge,...hit};
    }
    return best;
  }
  edgeAnchor(key,ids,fraction=.5){
    const edge=this.graphs[key].graphData().links.find(e=>matchesEdge(e,ids));if(!edge)return null;
    const points=this.edgePoints(key,edge),at=fraction*(points.length-1),a=points[Math.floor(at)],b=points[Math.ceil(at)];if(!a||!b)return null;
    const t=at-Math.floor(at);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,edge};
  }
  setSelection(ids){
    if(JSON.stringify(ids)===JSON.stringify(this.selectedEdges))return;
    this.selectedEdges=[...ids];
    for(const graph of Object.values(this.graphs)){
      graph.linkColor(graph.linkColor()).linkWidth(graph.linkWidth());
      for(const edge of graph.graphData().links){
        const line=edge.__lineObj;
        if(line?.isLine&&line.material?.isLineDashedMaterial)line.material.color.set(matchesEdge(edge,ids)?'#a8e6cb':edge.muted?'#202c3a':colors[edge.change]||'#789cb8');
      }
    }
  }
  setPanMode(value){
    this.panMode=Boolean(value);
    for(const graph of Object.values(this.graphs))graph.controls().mouseButtons.LEFT=this.panMode?MOUSE.PAN:MOUSE.ROTATE;
  }
  sync(source) {
    if (this.syncing) return;
    this.syncing = true;
    const graph = this.graphs[source];
    for (const [key, other] of Object.entries(this.graphs)) if (key !== source) {
      other.camera().position.copy(graph.camera().position);
      other.camera().quaternion.copy(graph.camera().quaternion);
      other.controls().target.copy(graph.controls().target);
      other.controls().update();
    }
    this.syncing = false;
  }
  resize() {
    const visible = [];
    for (const [key, graph] of Object.entries(this.graphs)) {
      const rect = this.elements[key].getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) {graph.pauseAnimation(); continue;}
      visible.push({key,graph,aspect:rect.width/rect.height});
      graph.width(rect.width).height(rect.height).resumeAnimation();
    }
    if (!visible.length) return;
    const aspect = Math.min(...visible.map(v => v.aspect));
    if (this.viewportAspect && Math.abs(aspect-this.viewportAspect) > .001) {
      requestAnimationFrame(() => this.fit(true));
    }
    this.viewportAspect = aspect;
  }
  render(data, coordinates, dimension, signature, layout) {
    this.resize();
    if (signature === this.signature) return;
    if (layout !== this.layout) this.fitted = false;
    this.layout = layout;
    this.signature = signature;
    for (const [key, graph] of Object.entries(this.graphs)) {
      const {nodes, edges} = data[key];
      this.bloom[key].enabled = layout === 'spatial';
      this.outputs[key].enabled = layout === 'spatial';
      const old = graph.graphData();
      graph.graphData({nodes: nodes.map(node => {
        const p = coordinates.get(node.id) || {x: 0, y: 0, z: 0};
        return {...node, x: p.x, y: p.y, z: dimension === 2 ? 0 : p.z,
          fx: p.x, fy: p.y, fz: dimension === 2 ? 0 : p.z};
      }), links: edges.map(e => ({...e}))});
      const background = new Color(layout === 'spatial' ? '#000000' : '#101923');
      graph.renderer().setClearColor(background,1);
      for (const node of old.nodes) node.__threeObj?.traverse(object => {
        object.material?.map?.dispose(); object.material?.dispose(); object.geometry?.dispose();
      });
      graph.controls().enableRotate = dimension === 3;
    }
  }
  fit(preserveAngle = false) {
    const entries = Object.entries(this.graphs).filter(([key]) => this.elements[key].getBoundingClientRect().width > 0);
    if (!entries.length) return;
    const points = [...this.graphs.before.graphData().nodes, ...this.graphs.after.graphData().nodes];
    if (!points.length) return;
    const x = points.map(n => n.x), y = points.map(n => n.y), z = points.map(n => n.z);
    const first = entries[0][1], spatial = this.layout === 'spatial';
    const center = preserveAngle ? first.controls().target.clone() : new Vector3(
      (Math.max(...x)+Math.min(...x))/2,(Math.max(...y)+Math.min(...y))/2,(Math.max(...z)+Math.min(...z))/2);
    const right = new Vector3(1,0,0), up = new Vector3(0,1,0), direction = new Vector3(0,0,1);
    if (preserveAngle) for (const axis of [right,up,direction]) axis.applyQuaternion(first.camera().quaternion);
    let distance = 1;
    for (const [key, graph] of entries) {
      const rect = this.elements[key].getBoundingClientRect();
      const tanY = Math.tan(graph.camera().fov*Math.PI/360), tanX = tanY*rect.width/rect.height;
      for (const node of points) {
        const delta = new Vector3(node.x,node.y,node.z).sub(center);
        distance = Math.max(distance,delta.dot(direction)+Math.max(
          (Math.abs(delta.dot(right))+(spatial?100:125))/tanX,
          (Math.abs(delta.dot(up))+(spatial?40:50))/tanY));
      }
    }
    const position = direction.multiplyScalar(distance*1.08).add(center);
    for (const [, graph] of entries) graph.cameraPosition(position,center);
    this.sync(entries[0][0]);
  }
  inspect() {
    return Object.fromEntries(Object.entries(this.graphs).map(([key, graph]) => [key, {
      bloom: this.bloom[key].enabled,
      nodes: graph.graphData().nodes.map(n => ({id: n.id, x: n.x, y: n.y, z: n.z,
        projected: new Vector3(n.x,n.y,n.z).project(graph.camera()).toArray(),
        rendered: n.__threeObj?.position.toArray(), change: n.change || null,
        labelVisible:n.__threeObj?.children.some(c=>c.userData.label&&c.visible), finding: Boolean(n.finding), emphasized:Boolean(n.emphasized), muted:Boolean(n.muted)})),
      edges: graph.graphData().links.map(e => ({id: e.id, selected:matchesEdge(e,this.selectedEdges), change: e.change || null})),
      camera: graph.camera().position.toArray(), target: graph.controls().target.toArray(), rotation:graph.camera().quaternion.toArray()
    }]));
  }
}
