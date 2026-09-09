import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

// Finite alphabets here; the handwritten theorem allows arbitrary alphabets.
export const words = n => Array.from({length: 2 ** n}, (_, k) => Array.from({length:n}, (_, i) => (k >> i) & 1));
export const distance = (x, z) => x.reduce((d, v, i) => d + Number(v !== z[i]), 0);
export const separation = (S, T) => Math.min(...S.flatMap(x => T.map(z => distance(x,z))));
export function decode(supports, y, g, a) {
  assert.ok(Number.isInteger(g) && g>=0 && Number.isInteger(a) && a>=0,'Nonnegative integer budgets required');
  const n=supports[0]?.[0]?.length;
  assert.ok(n>0 && supports.every(S=>S.length && S.every(x=>x.length===n && !x.includes(null))),'Nonempty indexed healthy supports required');
  if(y.length!==n) return [];
  if (y.filter(v => v === null).length > a) return [];
  return supports.flatMap((S,t) => S.some(x => x.reduce((d,v,i) => d + Number(y[i] !== null && v !== y[i]),0) <= g) ? [t] : []);
}
export function collision(S,T,g,a) {
  for(const x of S) for(const z of T) {
    const D=x.flatMap((v,i)=>v!==z[i]?[i]:[]);
    if(D.length>2*g+a) continue;
    const y=[...x], erased=D.slice(0,Math.min(a,D.length)), remaining=D.slice(erased.length);
    erased.forEach(i=>y[i]=null);
    // Split remaining disagreements so each original needs at most g edits.
    remaining.slice(0,Math.min(g,remaining.length)).forEach(i=>y[i]=z[i]);
    assert.deepEqual(decode([S,T],y,g,a),[0,1]);
    return {x,z,y};
  }
  return null;
}
const observations=n=>n===0?[[]]:observations(n-1).flatMap(v=>[0,1,null].map(b=>[...v,b]));
function analyze(S,T,g,a) {
  const delta=separation(S,T), witness=collision(S,T,g,a);
  const ys=observations(S[0].length), ambiguous=ys.filter(y=>decode([S,T],y,g,a).length===2);
  assert.equal(ambiguous.length===0,delta>2*g+a);
  assert.equal(witness===null,ambiguous.length===0);
  const s=S[0].filter((_,i)=>!S.some(x=>T.some(z=>x[i]===z[i]))).length;
  return {S,T,g,a,marginalSeparators:s,distance:delta,exact:delta>2*g+a,ambiguousObservations:ambiguous.length,witness};
}
export function run() {
  let cases=0, collisionCertificates=0, decoderMembershipChecks=0;
  const byDimension=[];
  for(let n=1;n<=3;n++) {
    const W=words(n), Y=observations(n);
    const sets=Array.from({length:2**W.length-1},(_,i)=>W.filter((_,j)=>(i+1)&(1<<j)));
    let count=0;
    for(let g=0;g<=1;g++) for(let a=0;a<=1;a++) {
      const masks=sets.map(S=>{
        let bits=0n;
        Y.forEach((y,i)=>{
          if(decode([S],y,g,a).length) bits|=1n<<BigInt(i);
          decoderMembershipChecks++;
        });
        return bits;
      });
      for(let i=0;i<sets.length;i++) for(let j=i;j<sets.length;j++) {
        const delta=separation(sets[i],sets[j]), overlap=(masks[i]&masks[j])!==0n;
        assert.equal(overlap,delta<=2*g+a);
        const certificate=collision(sets[i],sets[j],g,a);
        assert.equal(Boolean(certificate),overlap);
        if(certificate) collisionCertificates++;
        cases++; count++;
      }
    }
    byDimension.push({n,nonemptySupports:sets.length,cases:count});
  }
  const parity=analyze([[0,0],[1,1]],[[0,1],[1,0]],0,0);
  const oneError=analyze(words(4).filter(x=>x.reduce((a,b)=>a+b,0)===1),[[1,1,1,1]],1,0);
  const overBudget=analyze(oneError.S,oneError.T,1,1);
  // A construction, not only a necessary condition: concatenate 01/10 blocks.
  const coupled=analyze([[0,0,0,0],[1,1,1,1]],[[0,0,1,1],[1,1,0,0]],0,1);
  // We can identify a target class despite indistinguishable states inside it.
  const supports=[[[0,0,0]],[[0,0,0]],[[1,1,1]]], labels=['below','below','above'];
  let functionalObservations=0;
  for(const y of observations(3)) {
    const candidates=decode(supports,y,1,0), target=[...new Set(candidates.map(t=>labels[t]))];
    assert.ok(target.length<=1); if(candidates.length) functionalObservations++;
  }
  // Small exact inverse design: choose least-cost additional indexed tests.
  const base=[[0,0],[0,1],[1,0]], additions=[{name:'A',cost:2,values:[0,1,1]},{name:'B',cost:1,values:[0,0,1]},{name:'C',cost:1,values:[0,1,0]},{name:'D',cost:3,values:[0,1,2]}];
  const designs=[];
  for(let mask=0;mask<16;mask++) {
    const chosen=additions.filter((_,i)=>mask&(1<<i)), vectors=base.map((v,t)=>[...v,...chosen.map(c=>c.values[t])]);
    const d=Math.min(distance(vectors[0],vectors[1]),distance(vectors[0],vectors[2]),distance(vectors[1],vectors[2]));
    designs.push({tests:chosen.map(x=>x.name),cost:chosen.reduce((s,x)=>s+x.cost,0),distance:d,passes:d>=3});
  }
  const feasible=designs.filter(x=>x.passes), optimum=Math.min(...feasible.map(x=>x.cost));
  const optimalDesigns=feasible.filter(x=>x.cost===optimum);
  assert.equal(optimum,4); assert.deepEqual(optimalDesigns.map(x=>x.tests),[['A','B','C']]);
  return {cycle:'RC-2026-75',date:'2026-09-10',status:'analytic-proof-and-finite-computation-not-physical-validation',cases,collisionCertificates,decoderMembershipChecks,byDimension,examples:{parity,oneError,overBudget,coupled},functional:{supports,labels,fullStateIdentifiable:false,targetIdentifiable:true,admissibleObservations:functionalObservations},inverseDesign:{g:1,a:0,designs,optimalCost:optimum,optimalDesigns},limits:['Known exact healthy joint supports; indexed coordinates; bounded arbitrary substitutions and indexed erasures.','Enumerations test code only; the general claim rests on the written proof.','No physical support calibration, external peer review or proof-assistant kernel verification.','Classical error/erasure distance theory reconstructed; no novelty claim.']};
}
if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const result=run();
  if(process.argv.includes('--write')) fs.writeFileSync(new URL('../research/reproducibility/rc75-identification-result.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({cases:result.cases,collisionCertificates:result.collisionCertificates,decoderMembershipChecks:result.decoderMembershipChecks,optimalCost:result.inverseDesign.optimalCost}));
}
