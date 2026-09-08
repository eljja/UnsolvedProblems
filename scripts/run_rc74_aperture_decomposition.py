"""Offline development audit of retired RC73 pixels; never downloads data."""
import argparse
import hashlib
import json
import math
from pathlib import Path
from collections import defaultdict
import numpy as np
import scipy
from scipy.integrate import quad
from astropy.stats import sigma_clip
import astropy

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/reproducibility'

def overlap(x, y, r):
    """Integrate the vertical chord intersected with one unit pixel."""
    if (abs(x)+.5)**2 + (abs(y)+.5)**2 <= r*r:
        return 1.0
    if max(abs(x)-.5, 0)**2 + max(abs(y)-.5, 0)**2 >= r*r:
        return 0.0
    a, b = max(x-.5, -r), min(x+.5, r)
    if b <= a:
        return 0.0
    points = [a, b, 0.0]
    for v in (y-.5, y+.5):
        if abs(v) < r:
            u = math.sqrt(r*r-v*v)
            points.extend([-u, u])
    points = sorted(set(p for p in points if a <= p <= b))
    def chord(u):
        h = math.sqrt(max(0, r*r-u*u))
        return max(0, min(y+.5, h)-max(y-.5, -h))
    return sum(quad(chord, p, q, epsabs=1e-12, epsrel=1e-12)[0] for p, q in zip(points, points[1:]))

def weights(xs, ys, cx, cy, r):
    return np.array([[overlap(x-cx, y-cy, r) for x in xs] for y in ys])

def flux(data, w, bg):
    if np.any(~np.isfinite(data) & (w > 0)):
        return None  # Keep the exposure; refuse to impute or qualify its flux.
    return float(np.sum(np.where(np.isfinite(data), data-bg, 0)*w))

def groups(rows, field):
    out = {}
    for key in sorted(set(r['group'] for r in rows)):
        rr = sorted((r for r in rows if r['group'] == key), key=lambda r:r['pattern'])
        if any(r[field] is None for r in rr):
            out[key] = {'n':sum(r[field] is not None for r in rr),'mean':None,'normalized':None,'maximumExcursion':None,'status':'incomplete-aperture-support'}
            continue
        ff = np.array([r[field] for r in rr])
        out[key] = {'n':len(rr), 'mean':float(ff.mean()), 'normalized':(ff/ff.mean()).tolist(), 'maximumExcursion':float(np.max(abs(ff/ff.mean()-1)))}
    return out

def run():
    original_path = OUT / 'rc73-nircam-calibration-result.json'
    old = json.loads(original_path.read_text(encoding='utf-8'))
    rows, pixels, manifest = [], [], []
    for row in old['measurements']:
        path = ROOT / '.cache/rc73-nircam-calibration/strips' / row['filename'].replace('_cal.fits', '_strip.npz')
        if not path.exists():
            raise FileNotFoundError(path)
        manifest.append({'filename':row['filename'], 'sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
        with np.load(path, allow_pickle=False) as z:
            data = z['science'].astype(float) / float(z['photmjsr']) * z['area']
            dq = z['dq'].astype(np.uint32)
            ystart = int(z['yStart'])
        cx, cy = row['centroidX'], row['centroidY']-ystart
        xs, ys = np.arange(math.floor(cx)-10, math.floor(cx)+12), np.arange(math.floor(cy)-10, math.floor(cy)+12)
        cut = data[np.ix_(ys, xs)]
        flags = dq[np.ix_(ys, xs)]
        bg = row['backgroundDnPerSecond']
        ww = {str(r):weights(xs, ys, cx, cy, r) for r in [2,3,5,8]}
        exact = {r:flux(cut, w, bg) for r,w in ww.items()}
        yy, xx = np.indices(data.shape)
        dist = (xx-cx)**2 + (yy-cy)**2
        ann = (dist > 20**2) & (dist < 35**2) & np.isfinite(data)
        clipped = sigma_clip(data[ann], sigma=3, maxiters=5)
        bgstd = float(clipped.mean())
        shifts = []
        for dx in [-.25, 0, .25]:
            for dy in [-.25, 0, .25]:
                shifts.append({'dx':dx,'dy':dy,'flux':flux(cut,weights(xs,ys,cx+dx,cy+dy,5),bg)})
        rr = {'filename':row['filename'],'group':'|'.join([row['target'],row['detector'],row['filter']]),'pattern':row['patternNumber'],
              'oldR5':row['fluxDnPerSecond']['r5'],'exactR5':exact['5'], 'exactR3':exact['3'], 'exactR8':exact['8'],
              'numericalFraction':None if exact['5'] is None else exact['5']/row['fluxDnPerSecond']['r5']-1,
              'stdBackgroundR5':flux(cut,ww['5'],bgstd),'originalBackground':bg,'stdBackground':bgstd,
              'backgroundFraction':None if exact['5'] is None else flux(cut,ww['5'],bgstd)/exact['5']-1,
              'concentrationR3R5':None if exact['5'] is None else exact['3']/exact['5'],'concentrationR8R5':None if exact['8'] is None or exact['5'] is None else exact['8']/exact['5'],
              'shiftSensitivity':shifts,'maximumShiftFraction':None if exact['5'] is None or any(s['flux'] is None for s in shifts) else max(abs(s['flux']/exact['5']-1) for s in shifts),
              'missingPixelsR5':int(np.sum(~np.isfinite(cut) & (ww['5']>0))),
              'missingAreaR5':float(np.sum(ww['5'][~np.isfinite(cut)])),
              'bit4PixelsR2':int(np.sum(((flags & 4)>0) & (ww['2']>0))),
              'doNotUsePixelsR5':int(np.sum(((flags & 1)>0) & (ww['5']>0))),
              'localPeakDnPerSecond':float(np.nanmax(cut)),
              'areaErrorR5':float(ww['5'].sum()-math.pi*25)}
        rows.append(rr)
        pixels.append({'filename':row['filename'],'xs':xs.tolist(),'ys':ys.tolist(),'cx':cx,'cy':cy,'background':bg,'stdBackground':bgstd,'group':rr['group'],'pattern':row['patternNumber'],
                       'data':[[float(v) if np.isfinite(v) else None for v in line] for line in cut]})
    variants={f:groups(rows,f) for f in ['oldR5','exactR5','stdBackgroundR5']}
    target_rows=[r for r in rows if r['group']=='WDFS0458-56|NRCB1|F090W']
    ranges=[]
    for r in target_rows:
        family=[s['flux']+db*math.pi*25 for s in r['shiftSensitivity'] for db in [0,r['originalBackground']-r['stdBackground']]]
        ranges.append({'pattern':r['pattern'],'lower':min(family),'upper':max(family)})
    bad=next(r for r in ranges if r['pattern']==2)
    optimistic_deficit=1-4*bad['upper']/(bad['upper']+sum(r['lower'] for r in ranges if r['pattern']!=2))
    patterns={}
    for field, gg in variants.items():
        patterns[field]={f:float(np.max(abs(np.array(gg[f'WDFS0458-56|NRCB1|{f}']['normalized'])-np.array(gg[f'WDFS0122-30|NRCB1|{f}']['normalized'])))) for f in ['F090W','F150W']}
    result={'cycle':'RC-2026-74','status':'development-only','runtime':{'numpy':np.__version__,'scipy':scipy.__version__,'astropy':astropy.__version__},
            'hashPolicy':'JSON SHA-256 uses UTF-8 bytes with CRLF normalized to LF; NPZ cache hashes use unmodified bytes.',
            'inputResultSha256':hashlib.sha256(original_path.read_bytes().replace(b'\r\n',b'\n')).hexdigest(),'cacheHashes':manifest,'rows':rows,'groups':variants,'matchedPatterns':patterns,
            'finiteFamilyEnvelope':{'group':'WDFS0458-56|NRCB1|F090W','ranges':ranges,'optimisticPattern2Deficit':optimistic_deficit,'family':'Nine discrete center offsets times two fixed backgrounds per exposure. A rectangular flux envelope gives an optimistic lower bound on the pattern-2 deficit. Not a bound on untested continuous centers or spatially structured sky.','cannotReachTwoPercent':optimistic_deficit>0.02},
            'summary':{'maxNumericalFraction':max(abs(r['numericalFraction']) for r in rows if r['numericalFraction'] is not None),'maxBackgroundFraction':max(abs(r['backgroundFraction']) for r in rows if r['backgroundFraction'] is not None),'maxShiftFraction':max(r['maximumShiftFraction'] for r in rows if r['maximumShiftFraction'] is not None),'maxAreaError':max(abs(r['areaErrorR5']) for r in rows),'bit4R2ExposureCount':sum(r['bit4PixelsR2']>0 for r in rows),'doNotUseR5ExposureCount':sum(r['doNotUsePixelsR5']>0 for r in rows),'missingR5ExposureCount':sum(r['missingPixelsR5']>0 for r in rows)},
            'preservedFailure':'Initial strict flux calculation stopped at a non-finite aperture sample. Diagnostic v2 records null full-aperture flux for that exposure and retains it as failed support, rather than deleting it or silently summing the surviving pixels.',
            'boundary':'No fresh holdout, physical-cause identification, absolute calibration, distance or H0 qualification.'}
    if args.write:
        (OUT/'rc74-aperture-decomposition.json').write_text(json.dumps(result,indent=2,allow_nan=False)+'\n',encoding='utf-8')
        (OUT/'rc74-aperture-pixels.json').write_text(json.dumps({'cycle':'RC-2026-74','boundary':'Converted cached pixels; shared extraction and centroids, independent downstream aperture geometry only.','exposures':pixels},separators=(',',':'),allow_nan=False)+'\n',encoding='utf-8')
    print(json.dumps({'summary':result['summary'],'failedGroup':variants['exactR5']['WDFS0458-56|NRCB1|F090W'],'patterns':patterns},indent=2))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--write',action='store_true'); args=parser.parse_args(); run()
