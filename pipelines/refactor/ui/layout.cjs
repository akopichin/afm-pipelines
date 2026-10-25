(function(root) {
  'use strict';
  // Containment defines the hierarchy; dependency cycles must never break layout.
  function positions(baseline, proposals = [], level = Infinity) {
    const nodes = new Map(baseline.nodes.map(n => [n.id, n]));
    for (const p of proposals) for (const n of p.changes.add_nodes) if (!nodes.has(n.id)) nodes.set(n.id, n);
    const hidden = [];
    for (const n of nodes.values()) {
      let current = n, depth = 0; const seen = new Set([n.id]);
      while (nodes.has(current.parent) && !seen.has(current.parent)) {
        current = nodes.get(current.parent); seen.add(current.id); depth++;
      }
      if (depth > level) hidden.push(n.id);
    }
    for (const id of hidden) nodes.delete(id);
    const children = new Map();
    for (const n of nodes.values()) {
      const parent = nodes.has(n.parent) ? n.parent : null;
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(n.id);
    }
    const original = new Set(baseline.nodes.map(n => n.id));
    for (const list of children.values()) list.sort((a,b) => Number(original.has(b))-Number(original.has(a)) || a.localeCompare(b));
    const result = new Map(), visiting = new Set();
    function block(id) {
      if (visiting.has(id)) return {width: 240, height: 105, points: []};
      visiting.add(id);
      const branches = (children.get(id) || []).map(block);
      visiting.delete(id);
      if (!branches.length) return {width: 240, height: 105, points: [{id, x: 0, y: 0, depth: 0}]};
      const columns = Math.min(branches.length, 5, Math.ceil(Math.sqrt(branches.length * 1.5)));
      const widths = Array.from({length: columns}, (_, c) => Math.max(...branches.filter((_, i) => i % columns === c).map(b => b.width)));
      const width = widths.reduce((a, b) => a + b, 0), points = [{id, x: 0, y: 0, depth: 0}];
      let y = 125;
      for (let row = 0; row < branches.length; row += columns) {
        const cells = branches.slice(row, row + columns);
        let x = -width / 2;
        cells.forEach((b, c) => {
          for (const p of b.points) points.push({...p, x: p.x + x + widths[c] / 2, y: p.y - y, depth: p.depth + 1});
          x += widths[c];
        });
        y += Math.max(...cells.map(b => b.height));
      }
      return {width, height: y, points};
    }
    const roots = children.get(null) || [];
    const trees = roots.filter(id => children.has(id)).map(block);
    const leaves = roots.filter(id => !children.has(id));
    let x = 0;
    for (const tree of trees) {
      for (const p of tree.points) result.set(p.id, {x: x + p.x + tree.width / 2, y: p.y, z: -p.depth * 35});
      x += tree.width + 100;
    }
    leaves.forEach((id, i) => result.set(id, {x: x + (i % 2) * 240, y: -Math.floor(i / 2) * 125, z: 0}));
    const xs = [...result.values()].map(p => p.x), ys = [...result.values()].map(p => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    for (const p of result.values()) {p.x -= cx; p.y -= cy;}
    return result;
  }
  function difference(before, after) {
    const a = new Map(before.nodes.map(n => [n.id, n])), b = new Map(after.nodes.map(n => [n.id, n]));
    const ae = new Map(before.edges.map(e => [e.id, e])), be = new Map(after.edges.map(e => [e.id, e]));
    const nodes = new Map(), edges = new Map();
    for (const [id, node] of b) {
      if (!a.has(id)) nodes.set(id, 'added');
      else if (JSON.stringify(node) !== JSON.stringify(a.get(id))) nodes.set(id, 'changed');
    }
    for (const id of a.keys()) if (!b.has(id)) nodes.set(id, 'removed');
    for (const [id, edge] of be) {
      if (!ae.has(id)) edges.set(id, 'added');
      else if (JSON.stringify(edge) !== JSON.stringify(ae.get(id))) edges.set(id, 'changed');
    }
    for (const id of ae.keys()) if (!be.has(id)) edges.set(id, 'removed');
    for (const [id] of edges) for (const e of [ae.get(id), be.get(id)].filter(Boolean))
      for (const n of [e.source, e.target]) if (!nodes.has(n)) nodes.set(n, 'affected');
    return {nodes, edges};
  }
  const api = {positions, difference};
  if (typeof module !== 'undefined') module.exports = api;
  else root.RefactorLayout = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
