export const relationNames={calls:'Вызывает',imports:'Импортирует',exports:'Экспортирует',constructs:'Создаёт',implements:'Реализует',depends_on:'Зависит от',adapts:'Адаптирует',publishes:'Публикует',spawns:'Запускает',transitions:'Переводит состояние',uses:'Использует'};
export const edgeIDs=edge=>edge.ids||[edge.id];
export const matchesEdge=(edge,ids)=>!edge.containment&&edgeIDs(edge).some(id=>ids.includes(id));

// Hit testing uses CSS pixels so zoom cannot shrink the clickable corridor.
export function nearestPoint(points,x,y){
  let best={distance:Infinity,fraction:.5};
  for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];if(!a||!b)continue;
    const dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
    const t=length?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/length)):0;
    const distance=Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
    if(distance<best.distance)best={distance,fraction:(i-1+t)/(points.length-1)};
  }
  return best;
}
