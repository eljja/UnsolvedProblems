import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
const dir='research/reproducibility/';
const input=Buffer.from(fs.readFileSync(dir+'rc74-aperture-pixels.json','utf8').replaceAll('\r\n','\n'),'utf8');
const pixels=JSON.parse(input);
// Integrate piecewise constant / circular boundary segments analytically.
function overlap(x,y,r) {
  const lo=Math.max(x-.5,-r), hi=Math.min(x+.5,r);
  if(hi<=lo) return 0;
  const cuts=[lo,hi];
  for(const h of [y-.5,y+.5]) if(Math.abs(h)<r) {
    const z=Math.sqrt(r*r-h*h);
    for(const t of [-z,z]) if(t>lo && t<hi) cuts.push(t);
  }
  cuts.sort((a,b)=>a-b);
  const primitive=t=>(t*Math.sqrt(Math.max(0,r*r-t*t))+r*r*Math.asin(Math.max(-1,Math.min(1,t/r))))/2;
  let area=0;
  for(let i=1;i<cuts.length;i++) {
    const a=cuts[i-1],b=cuts[i],h=Math.sqrt(Math.max(0,r*r-((a+b)/2)**2));
    if(Math.min(y+.5,h)<=Math.max(y-.5,-h)) continue;
    const upperCircle=h<y+.5, lowerCircle=-h>y-.5;
    const constant=(upperCircle?0:y+.5)-(lowerCircle?0:y-.5);
    area+=constant*(b-a)+(Number(upperCircle)+Number(lowerCircle))*(primitive(b)-primitive(a));
  }
  return Math.max(0,Math.min(1,area));
}
let maxDiskAreaError=0;
for(const r of [2,3,5,8]) for(const [cx,cy] of [[0,0],[.13,.77],[-.499,.499]]) {
  let sum=0;
  for(let x=-10;x<=10;x++) for(let y=-10;y<=10;y++) {
    const a=overlap(x-cx,y-cy,r);
    assert(Math.abs(a-overlap(y-cy,x-cx,r))<1e-11);
    sum+=a;
  }
  maxDiskAreaError=Math.max(maxDiskAreaError,Math.abs(sum-Math.PI*r*r));
}
assert(maxDiskAreaError<1e-10);
const rows=pixels.exposures.map(e=>{
  const fluxes={}; let missingR5=0, missingAreaR5=0;
  for(const radius of [3,5,8]) {
    let sum=0, missing=0;
    for(let j=0;j<e.ys.length;j++) for(let i=0;i<e.xs.length;i++) {
      const weight=overlap(e.xs[i]-e.cx,e.ys[j]-e.cy,radius);
      if(weight===0) continue;
      if(e.data[j][i]===null) { missing++; if(radius===5) missingAreaR5+=weight; }
      else sum+=(e.data[j][i]-e.background)*weight;
    }
    fluxes['r'+radius]=missing?null:sum;
    if(radius===5) missingR5=missing;
  }
  const family=[];
  if(e.group==='WDFS0458-56|NRCB1|F090W') {
    for(const dx of [-.25,0,.25]) for(const dy of [-.25,0,.25]) for(const bg of [e.background,e.stdBackground]) {
      let sum=0;
      for(let j=0;j<e.ys.length;j++) for(let i=0;i<e.xs.length;i++) {
        const w=overlap(e.xs[i]-e.cx-dx,e.ys[j]-e.cy-dy,5);
        if(w>0) { assert(e.data[j][i]!==null); sum+=(e.data[j][i]-bg)*w; }
      }
      family.push(sum);
    }
  }
  return {filename:e.filename,fluxes,missingR5,missingAreaR5,pattern:e.pattern,
    range:family.length?{lower:Math.min(...family),upper:Math.max(...family)}:null};
});
// Read Python output only after independently computing all fluxes.
const python=JSON.parse(fs.readFileSync(dir+'rc74-aperture-decomposition.json','utf8'));
let maxRelativeFluxDifference=0;
for(const r of rows) {
  const p=python.rows.find(p=>p.filename===r.filename);
  assert(p);
  assert.equal(r.missingR5,p.missingPixelsR5);
  for(const radius of [3,5,8]) {
    const x=r.fluxes['r'+radius],y=p['exactR'+radius];
    if(x===null || y===null) assert.equal(x,y);
    else maxRelativeFluxDifference=Math.max(maxRelativeFluxDifference,Math.abs(x/y-1));
  }
}
assert(maxRelativeFluxDifference<=1e-8);
const familyRows=rows.filter(r=>r.range), bad=familyRows.find(r=>r.pattern===2);
const optimisticPattern2Deficit=1-4*bad.range.upper/(bad.range.upper+familyRows.filter(r=>r.pattern!==2).reduce((s,r)=>s+r.range.lower,0));
assert(Math.abs(optimisticPattern2Deficit-python.finiteFamilyEnvelope.optimisticPattern2Deficit)<1e-12);
const result={cycle:'RC-2026-74',hashPolicy:'JSON SHA-256 uses UTF-8 bytes with CRLF normalized to LF.',inputSha256:crypto.createHash('sha256').update(input).digest('hex'),method:'Piecewise circle antiderivative; no Python weights or fluxes used to compute sums.',maxDiskAreaError,maxRelativeFluxDifference,optimisticPattern2Deficit,missingR5ExposureCount:rows.filter(r=>r.missingR5).length,rows,reproduced:true,boundary:'Independent aperture geometry and pixel sums, not independent MAST retrieval, unit conversion, centroid, background or physical calibration.'};
if(process.argv.includes('--write')) fs.writeFileSync(dir+'rc74-independent-aperture-audit.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({reproduced:true,maxDiskAreaError,maxRelativeFluxDifference,missingR5ExposureCount:result.missingR5ExposureCount}));
