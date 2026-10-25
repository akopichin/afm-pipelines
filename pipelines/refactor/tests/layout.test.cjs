const {test} = require('node:test');
const assert = require('node:assert/strict');
const {positions, difference} = require('../ui/layout.cjs');

test('containment layout tolerates dependency cycles and separates siblings', () => {
  const nodes = [{id:'root',kind:'package'}, ...Array.from({length:22}, (_,i)=>({id:'n'+i,parent:'root',kind:'subsystem'}))];
  const graph={nodes,edges:[{id:'a',source:'n0',target:'n1'},{id:'b',source:'n1',target:'n0'}]};
  const points=positions(graph);
  assert.equal(points.size,nodes.length);
  for(const n of nodes.slice(1)) assert(points.get(n.id).y < points.get('root').y);
  for(const [id,a] of points) for(const [other,b] of points) if(id!==other)
    assert(Math.abs(a.x-b.x)>=230 || Math.abs(a.y-b.y)>=100);
  assert.deepEqual(positions({...graph,nodes:[...nodes].reverse()}),points);
});

test('diff includes removal ghosts, updates and edge-only changes', () => {
  const before={nodes:[{id:'a',label:'old'},{id:'b'},{id:'gone'},{id:'c'}],edges:[{id:'old-edge',source:'b',target:'gone'}]};
  const after={nodes:[{id:'a',label:'new'},{id:'b'},{id:'c'},{id:'new'}],edges:[{id:'new-edge',source:'b',target:'c'}]};
  const diff=difference(before,after);
  assert.equal(diff.nodes.get('a'),'changed');
  assert.equal(diff.nodes.get('b'),'affected');
  assert.equal(diff.nodes.get('gone'),'removed');
  assert.equal(diff.nodes.get('new'),'added');
  assert.equal(diff.edges.get('old-edge'),'removed');
  assert.equal(diff.edges.get('new-edge'),'added');
  assert.equal(difference(before,before).nodes.size,0);
});

test('single-child nested groups have finite coordinates and collapsed levels remain compact', () => {
  const graph = {nodes:[{id:'root'}, {id:'a',parent:'root'}, {id:'b',parent:'a'}, {id:'c',parent:'b'}], edges:[]};
  for (const p of positions(graph).values()) assert(Object.values(p).every(Number.isFinite));
  const collapsed=positions(graph,[],1);
  assert.deepEqual([...collapsed.keys()],['root','a']);
  assert.equal(Math.abs(collapsed.get('root').y-collapsed.get('a').y),125);
});
