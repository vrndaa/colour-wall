function hexToHsl(hex) {
  const r = parseInt(hex.slice(1,3),16)/255, g = parseInt(hex.slice(3,5),16)/255, b = parseInt(hex.slice(5,7),16)/255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s; const l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max){
      case r: h = (g-b)/d + (g<b?6:0); break;
      case g: h = (b-r)/d + 2; break;
      case b: h = (r-g)/d + 4; break;
    }
    h *= 60;
  }
  return [h, s, l];
}

function hslToHex(h, s, l) {
  s = Math.max(0, Math.min(1, s));
  l = Math.max(0, Math.min(1, l));
  const c = (1 - Math.abs(2*l-1)) * s;
  const x = c * (1 - Math.abs((h/60) % 2 - 1));
  const m = l - c/2;
  let r,g,b;
  if (h < 60) { r=c; g=x; b=0; }
  else if (h < 120) { r=x; g=c; b=0; }
  else if (h < 180) { r=0; g=c; b=x; }
  else if (h < 240) { r=0; g=x; b=c; }
  else if (h < 300) { r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const toHex = v => Math.round((v+m)*255).toString(16).padStart(2,'0');
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

// Draws a pleated half-circle fan into an existing <svg> node.
// baseHex: the swatch color. numRays: how many wedges to divide it into.
function drawFan(svgNode, baseHex, numRays) {
  const ns = 'http://www.w3.org/2000/svg';
  const cx = 100, cy = 96, radius = 92;
  const [h, s, l] = hexToHsl(baseHex);
  const lightAngle = Math.PI / 2;
  for (let i = 0; i < numRays; i++) {
    const t0 = (i / numRays) * Math.PI;
    const t1 = ((i + 1) / numRays) * Math.PI;
    const mid = (t0 + t1) / 2;
    const x0 = cx + radius * Math.cos(t0);
    const y0 = cy - radius * Math.sin(t0);
    const x1 = cx + radius * Math.cos(t1);
    const y1 = cy - radius * Math.sin(t1);
    const brightness = 0.5 + 0.5 * Math.cos(mid - lightAngle);
    const minL = Math.max(l - 0.22, 0.08);
    const maxL = Math.min(l + 0.16, 0.9);
    const rayL = minL + brightness * (maxL - minL);
    const fill = hslToHex(h, s, rayL);
    const path = document.createElementNS(ns, 'path');
    path.setAttribute('d', `M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${radius} ${radius} 0 0 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z`);
    path.setAttribute('fill', fill);
    svgNode.appendChild(path);
  }
  const knot = document.createElementNS(ns, 'circle');
  knot.setAttribute('cx', cx);
  knot.setAttribute('cy', cy);
  knot.setAttribute('r', 3);
  knot.setAttribute('fill', hslToHex(h, s, Math.max(l - 0.3, 0.06)));
  svgNode.appendChild(knot);
}