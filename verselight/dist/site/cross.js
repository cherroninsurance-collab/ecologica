import { SCALE, visible, limiter } from './gate.js';
/* Verselight — hero centerpiece: raymarched volumetric cross + realistic open book.
   Camera framed so the full cross always fits. Book rebuilt with real bookbinding:
   thick page block, cover overhang (squares), rounded spine with headbands,
   individually curved leaves, ribbon marker, and grounded contact shadow. */

const canvas = document.getElementById('crossgl');
if (canvas) {
const gl = canvas.getContext('webgl', { antialias:false, alpha:true, premultipliedAlpha:false });

const VERT = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;
uniform float uPulse;
uniform float uScroll;
uniform float uAspect;   /* canvas w/h — used to auto-fit the composition */
uniform float uSteps;    /* march budget: lowered on phones */

#define PI 3.14159265

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float hash1(float n){ return fract(sin(n)*43758.5453123); }
float noise(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  float n=i.x+i.y*57.+113.*i.z;
  return mix(mix(mix(hash1(n),hash1(n+1.),f.x),mix(hash1(n+57.),hash1(n+58.),f.x),f.y),
             mix(mix(hash1(n+113.),hash1(n+114.),f.x),mix(hash1(n+170.),hash1(n+171.),f.x),f.y),f.z);
}
float fbm3(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }

/* ---------- SDF primitives ---------- */
float sdBox(vec3 p, vec3 b){ vec3 d=abs(p)-b; return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.); }
float sdRound(vec3 p, vec3 b, float r){ return sdBox(p,b)-r; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return length(pa-ba*h)-r;
}
float sdChamfer(vec3 p, vec3 b, float ch){
  float d = sdBox(p, b);
  vec3 a = abs(p);
  float oct = (a.x + a.y + a.z - (b.x + b.y + b.z - ch)) * 0.57735;
  return max(d, oct);
}

/* ---------- the cross ---------- */
float sdCross(vec3 p, out float face){
  float th = 0.062;
  vec3 vb = vec3(0.086, 0.540, th);
  vec3 hb = vec3(0.310, 0.086, th);

  float vert = sdChamfer(p - vec3(0., 0.045, 0.), vb, 0.048);
  float horz = sdChamfer(p - vec3(0., 0.218, 0.), hb, 0.048);
  float body = min(vert, horz);

  float iv = sdBox(p - vec3(0., 0.045, 0.), vec3(vb.x-0.027, vb.y-0.027, th+0.02));
  float ih = sdBox(p - vec3(0., 0.218, 0.), vec3(hb.x-0.027, hb.y-0.027, th+0.02));
  float groove = max(min(iv,ih), abs(p.z) - (th - 0.011));
  body = max(body, -groove * 0.92);

  float boss = length((p - vec3(0.,0.218,0.)) * vec3(1., 1., 0.60)) - 0.074;
  body = min(body, boss);

  face = smoothstep(th - 0.014, th - 0.004, abs(p.z));
  return body;
}
float sdCrossD(vec3 p){ float f; return sdCross(p, f); }

/* ---------- realistic book ----------
   Coordinates: x = spine(0) → fore-edge, z = head↔tail, y = up.
   A leaf sags on a curve anchored at the gutter and also droops slightly
   toward head and tail (real paper is a doubly-curved surface). */
float leaf(vec3 p, float side, float lift, float curl, float wob, float wid, float hgt, float thick){
  p.x *= side;
  float x = max(p.x, 0.0);
  float u = clamp(x / wid, 0.0, 1.0);

  /* primary sag: flat at spine, steep at fore-edge */
  float sag = lift * pow(u, 1.55) * 0.60;
  /* secondary cross-curl toward head/tail so the sheet is doubly curved */
  float zc = p.z / max(hgt, 1e-3);
  sag += lift * 0.10 * zc * zc * u;
  sag += wob * sin(u * 2.6) * 0.040;

  p.y += sag;
  p.xy = rot(-curl * u) * p.xy;

  /* fore-edge is very slightly convex (paper block rounds outward) */
  float w = wid * (1.0 - 0.030 * zc * zc);
  return sdRound(p - vec3(w*0.5, 0., 0.), vec3(w*0.5, thick, hgt), thick*0.9);
}

float sdBook(vec3 p, float t, out float id){
  id = 0.;
  float d = 1e9;

  float W = 0.320;    /* half-leaf width, spine → fore-edge */
  float Hh = 0.245;   /* half height (head→tail) */

  /* ---- 1. the text block: a genuinely THICK stack of leaves ---- */
  /* Modelled as a solid wedge (so it reads as hundreds of pages) plus a
     few resolved top leaves for silhouette. */
  vec3 bl = p;
  float blockLift = 0.42;
  /* solid block: use the same sag surface, extruded downward */
  {
    vec3 q = bl;
    q.x = abs(q.x);
    float u = clamp(q.x / W, 0., 1.);
    float sag = blockLift * pow(u, 1.55) * 0.60;
    float zc = q.z / Hh;
    sag += blockLift * 0.10 * zc*zc * u;
    /* thickness grows from spine to fore-edge — the classic open-book wedge */
    float thick = 0.012 + 0.058 * pow(u, 0.85);
    vec3 c = vec3(q.x, -sag - thick*0.5, q.z);
    float dblock = sdRound(q - vec3(c.x, c.y, 0.), vec3(0.0009, thick*0.5, Hh*(1.0-0.03*zc*zc)), 0.004);
    /* clamp to width */
    dblock = max(dblock, q.x - W);
    dblock = max(dblock, -q.x + 0.004);
    if(dblock < d){ d = dblock; id = 2.; }
  }

  /* resolved top leaves for crisp edges */
  for(int i=0;i<3;i++){
    float fi = float(i);
    float lf = blockLift - fi*0.020;
    float s = min(leaf(p - vec3(0., -0.0075*fi, 0.),  1., lf, 0.0, 0.008+fi*0.003, W, Hh, 0.0034),
                  leaf(p - vec3(0., -0.0075*fi, 0.), -1., lf, 0.0, 0.008+fi*0.003, W, Hh, 0.0034));
    if(s < d){ d = s; id = 2.; }
  }

  /* ---- 2. the cover: boards overhang the block on all sides (squares) ---- */
  vec3 cp = p - vec3(0., -0.052, 0.);
  float cw = W + 0.020, chh = Hh + 0.018;
  float board = min(leaf(cp,  1., 0.40, 0.02, 0.0, cw, chh, 0.0125),
                    leaf(cp, -1., 0.40, 0.02, 0.0, cw, chh, 0.0125));
  /* rounded spine: a half-cylinder bridging the two boards */
  vec3 sp = cp - vec3(0., -0.016, 0.);
  float spine = sdCapsule(sp, vec3(0.,0.,-chh), vec3(0.,0.,chh), 0.030);
  spine = max(spine, -sp.y - 0.052);            /* trim the top so it tucks under */
  float cover = min(board, spine);
  if(cover < d){ d = cover; id = 1.; }

  /* ---- 3. headbands at head & tail of the spine ---- */
  float hb = min(
    sdCapsule(sp, vec3(-0.020,0.006, chh-0.006), vec3(0.020,0.006, chh-0.006), 0.0085),
    sdCapsule(sp, vec3(-0.020,0.006,-chh+0.006), vec3(0.020,0.006,-chh+0.006), 0.0085));
  if(hb < d){ d = hb; id = 4.; }

  /* ---- 4. the turning leaf ---- */
  float ph  = fract(t*0.080);
  float ease = ph*ph*(3.0 - 2.0*ph);
  float ang = ease * PI;
  float fl  = sin(ph*PI);
  vec3 q = p - vec3(0., 0.004, 0.);
  q.xy = rot(-ang) * q.xy;
  float turning = leaf(q, -1., blockLift + fl*0.52, fl*0.50, fl*0.09, W, Hh, 0.0030 + fl*0.0012);
  if(turning < d){ d = turning; id = 3.; }

  /* ---- 5. silk ribbon marker trailing off the fore-edge ---- */
  vec3 rp = p;
  float rz = 0.075;
  vec3 ra = vec3(0.02, -0.010, rz);
  vec3 rbp = vec3(W*0.82, -0.190 + sin(t*0.9)*0.010, rz + 0.020);
  float ribbon = sdCapsule(rp, ra, rbp, 0.010);
  ribbon = max(ribbon, abs(rp.z - rz - (rp.x*0.06)) - 0.019);
  if(ribbon < d){ d = ribbon; id = 5.; }

  return d;
}

float map(vec3 p, float t, out float mat){
  mat = 0.;
  vec3 bp = p - vec3(0., -0.72 + sin(t*0.52)*0.018, 0.);
  bp.xz = rot(sin(t*0.17)*0.18) * bp.xz;
  bp.yz = rot(-0.50) * bp.yz;
  float pid;
  float db = sdBook(bp, t, pid);

  vec3 cp = p - vec3(0., 0.42, 0.);
  cp.xz = rot(t*0.18 + (uMouse.x-0.5)*0.70) * cp.xz;
  cp.yz = rot((uMouse.y-0.5)*0.18) * cp.yz;
  float face;
  float dc = sdCross(cp, face);

  float d = db;
  mat = pid;
  if(dc < d){ d = dc; mat = 10.; }
  return d;
}

vec3 calcNormal(vec3 p, float t){
  vec2 e = vec2(0.0011, 0.);
  float m;
  return normalize(vec3(
    map(p+e.xyy,t,m)-map(p-e.xyy,t,m),
    map(p+e.yxy,t,m)-map(p-e.yxy,t,m),
    map(p+e.yyx,t,m)-map(p-e.yyx,t,m)));
}

float softShadow(vec3 ro, vec3 rd, float t){
  float res=1., h, m;
  float d=0.025;
  for(int i=0;i<26;i++){
    h = map(ro+rd*d, t, m);
    res = min(res, 10.0*h/d);
    d += clamp(h, 0.012, 0.09);
    if(res<0.004 || d>2.4) break;
  }
  return clamp(res, 0., 1.);
}

float ao(vec3 p, vec3 n, float t){
  float occ=0., sca=1., m;
  for(int i=0;i<5;i++){
    float h = 0.010 + 0.080*float(i);
    occ += (h - map(p + n*h, t, m)) * sca;
    sca *= 0.72;
  }
  return clamp(1.0 - 2.6*occ, 0., 1.);
}

float aniso(vec3 n, vec3 l, vec3 v, vec3 tang, float rough){
  vec3 h = normalize(l + v);
  float dt = dot(tang, h);
  float nh = dot(n, h);
  float k = dt / max(rough, 1e-3);
  return exp(-2.0 * (k*k) / (1.0 + max(nh,0.0))) * max(nh, 0.0);
}

void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5*uRes) / uRes.y;
  float t = uTime;

  /* ---- auto-fit framing: pull back on narrow/short canvases so the whole
     cross + book always fits inside the frame with margin ---- */
  float fit = clamp(1.28 / max(uAspect, 0.55), 1.0, 2.05);
  float dist = 2.62 * fit;
  float fov  = 1.72 / fit;

  vec3 ro = vec3(0., 0.02, dist);
  ro.xz = rot((uMouse.x-0.5)*0.22) * ro.xz;
  ro.y += (uMouse.y-0.5)*0.18 + uScroll*0.26;
  vec3 ta = vec3(0., -0.13, 0.);
  vec3 fw = normalize(ta-ro), rt = normalize(cross(vec3(0,1,0), fw)), up = cross(fw, rt);
  vec3 rd = normalize(uv.x*rt + uv.y*up + fov*fw);

  vec3 gold     = vec3(1.00, 0.755, 0.315);
  vec3 goldDeep = vec3(0.46, 0.275, 0.070);
  vec3 goldLite = vec3(1.00, 0.930, 0.760);
  vec3 col = vec3(0.);
  float alpha = 0.;

  float d = 0., m = 0., hit = -1.;
  for(int i=0;i<108;i++){
    if(float(i) > uSteps) break;
    vec3 p = ro + rd*d;
    float h = map(p, t, m);
    if(h < 0.0014){ hit = d; break; }
    d += h*0.90;
    if(d > 7.0) break;
  }

  vec3 keyDir  = normalize(vec3(-0.42, 0.86, 0.44));
  vec3 rimDir  = normalize(vec3( 0.70, 0.20,-0.62));
  vec3 fillDir = normalize(vec3( 0.35,-0.55, 0.60));

  vec3 base = vec3(0.);
  if(hit > 0.){
    vec3 p = ro + rd*hit;
    vec3 n = calcNormal(p, t);
    float mm; map(p,t,mm);
    float occ = ao(p, n, t);
    float sh  = softShadow(p + n*0.011, keyDir, t);

    float dif  = clamp(dot(n, keyDir), 0., 1.);
    float rimL = clamp(dot(n, rimDir), 0., 1.);
    float fres = pow(1.0 - clamp(dot(n, -rd), 0., 1.), 3.2);
    float spe  = pow(clamp(dot(reflect(-keyDir, n), -rd), 0., 1.), 62.0);
    float fill = clamp(0.5 + 0.5*dot(n, fillDir), 0., 1.);

    /* book-local coordinates for texturing */
    vec3 bq = p - vec3(0., -0.72, 0.);
    bq.yz = rot(0.50) * bq.yz;
    bq.xz = rot(-sin(t*0.17)*0.18) * bq.xz;

    if(mm > 5.){
      /* ---- the cross: forged gold, brushed vertically ---- */
      vec3 cq = p - vec3(0., 0.42, 0.);
      cq.xz = rot(t*0.18 + (uMouse.x-0.5)*0.70) * cq.xz;
      cq.yz = rot((uMouse.y-0.5)*0.18) * cq.yz;

      float grain = fbm3(cq*vec3(46.0, 7.0, 46.0));
      float patina = fbm3(cq*4.2 + 11.0);
      base = mix(goldDeep, gold, 0.44 + 0.42*grain + 0.20*patina);

      vec3 tang = normalize(cross(n, vec3(0.,1.,0.)));
      float an = aniso(n, keyDir, -rd, tang, 0.16);

      col  = base * (0.16 + 1.28*dif*mix(0.35, 1.0, sh));
      col += goldLite * an   * (1.25 + uPulse*2.0);
      col += goldLite * spe  * (0.85 + uPulse*1.4);
      col += gold     * rimL * 0.55;
      col += goldLite * fres * 0.42;
      col *= 0.30 + 0.70*occ;
      col += gold * 0.115;

    } else if(mm > 4.5){
      /* ---- silk ribbon marker ---- */
      float weave = fbm3(p*180.0);
      base = mix(vec3(0.42,0.055,0.055), vec3(0.66,0.13,0.11), weave);
      col  = base * (0.28 + 1.05*dif*mix(0.5,1.0,sh));
      col += vec3(1.0,0.65,0.55) * pow(clamp(dot(-n,keyDir),0.,1.),1.4) * 0.35;
      col += vec3(1.0,0.85,0.80) * spe * 0.30;
      col *= 0.42 + 0.58*occ;

    } else if(mm > 3.5){
      /* ---- headbands: striped silk ---- */
      float stripe = step(0.5, fract(bq.x*90.0));
      base = mix(vec3(0.72,0.60,0.34), vec3(0.30,0.10,0.09), stripe);
      col  = base * (0.30 + 1.0*dif*sh);
      col += goldLite * spe * 0.35;
      col *= 0.45 + 0.55*occ;

    } else if(mm > 2.5){
      /* ---- the turning leaf: backlit vellum with visible fibre + faint type ---- */
      float trans = pow(clamp(dot(-n, keyDir),0.,1.), 1.20);
      float fibre = fbm3(p*vec3(190.0, 40.0, 190.0));
      float mottle = fbm3(p*13.0 + 2.0);
      base = mix(vec3(0.955,0.930,0.868), vec3(0.995,0.982,0.955), fibre*0.5 + mottle*0.5);

      /* show-through of type from the other side */
      float row  = fract(bq.z*46.0);
      float line = smoothstep(0.62,0.46,row)*smoothstep(0.05,0.19,row);
      float word = step(0.32, hash(floor(bq.zx*vec2(46.0, 27.0))));
      base = mix(base, vec3(0.55,0.50,0.44), line*word*0.16);

      col  = base * (0.30 + 0.88*dif*mix(0.62,1.0,sh));
      col += vec3(1.00,0.90,0.72) * trans * (0.90 + 0.30*fibre);
      col += vec3(1.0,0.97,0.90) * fres * 0.46;
      col += goldLite * spe * 0.16;
      col *= 0.50 + 0.50*occ;

    } else if(mm > 1.5){
      /* ---- the page block: printed type, gutter shadow, laminated edge ---- */
      float u = abs(bq.x);
      float zc = bq.z;

      /* two-column-free single measure of ruled type */
      float row  = fract(zc*46.0);
      float line = smoothstep(0.62, 0.46, row) * smoothstep(0.05, 0.19, row);
      float wcell = hash(floor(vec2(zc*46.0, u*30.0)));
      float word = step(0.28, wcell);
      float body = step(0.085, u) * step(u, 0.272) * step(abs(zc), 0.205);
      float ink  = line * word * body;

      /* paper: warm, slightly foxed */
      float fox = fbm3(bq*9.0 + 5.0);
      base = mix(vec3(0.950,0.925,0.858), vec3(0.905,0.868,0.788), fox*0.55);
      base = mix(base, vec3(0.155,0.130,0.108), ink*0.80);

      /* verse numbers: tiny gold ticks at line starts */
      float tick = step(0.088, u)*step(u,0.104)*line*step(0.55, hash(floor(vec2(zc*46.0, 3.0))));
      base = mix(base, gold*0.85, tick*0.7);

      /* rubricated initial */
      float initial = smoothstep(0.042, 0.0, length(vec2(u-0.140, zc+0.150))-0.028);
      base = mix(base, vec3(0.60,0.13,0.10), initial*0.85);

      /* running head rule */
      float rule = smoothstep(0.0022,0.0, abs(zc + 0.222)) * step(0.085,u)*step(u,0.272);
      base = mix(base, vec3(0.45,0.38,0.30), rule*0.5);

      /* deep gutter shadow near the spine — the key realism cue */
      float gutter = exp(-u*11.0);
      base *= 1.0 - gutter*0.62;

      /* laminated leaf striations on the visible fore-edge stack */
      float striate = 0.5 + 0.5*sin(bq.y*760.0);
      float edgeMask = smoothstep(0.255, 0.315, u);
      base = mix(base, mix(vec3(0.86,0.82,0.74), gold*1.02, 0.45) * (0.75 + 0.25*striate), edgeMask*0.85);

      /* gilt head/tail edges */
      float gilt = smoothstep(0.200, 0.238, abs(zc));
      base = mix(base, gold*1.05, gilt*0.60);

      col  = base * (0.24 + 0.94*dif*mix(0.46,1.0,sh));
      col += goldLite * spe * 0.18;
      col += gold * fres * 0.20;
      col *= 0.34 + 0.66*occ;

    } else {
      /* ---- leather boards: pebble grain, blind tooling, worn corners ---- */
      float pebble = fbm3(bq*86.0);
      float grainL = fbm3(bq*vec3(210.0, 60.0, 210.0));
      float scuff  = fbm3(bq*7.0 + 3.0);
      base = mix(vec3(0.055,0.030,0.026), vec3(0.165,0.098,0.064), pebble*0.62 + grainL*0.22 + scuff*0.30);

      /* wear highlights along the raised grain */
      base += vec3(0.10,0.065,0.038) * smoothstep(0.62,0.92,pebble) * 0.7;

      /* blind-tooled double gold fillet border */
      float bx = abs(bq.x), bz = abs(bq.z);
      float f1 = smoothstep(0.0075,0.0018, abs(bx-0.292)) * step(bz,0.242);
      float f2 = smoothstep(0.0075,0.0018, abs(bx-0.272)) * step(bz,0.226);
      float f3 = smoothstep(0.0075,0.0018, abs(bz-0.238)) * step(bx,0.298);
      float tool = clamp(f1+f2*0.7+f3, 0., 1.);
      base = mix(base, gold*0.92, tool*0.62);

      /* corner fleurons */
      float fl = smoothstep(0.030,0.0, length(vec2(bx-0.262, bz-0.208))-0.012);
      base = mix(base, gold*0.95, fl*0.55);

      vec3 tang = normalize(cross(n, vec3(0.,1.,0.)));
      col  = base * (0.20 + 0.82*dif*sh);
      col += goldLite * aniso(n, keyDir, -rd, tang, 0.30) * 0.20;
      col += gold * rimL * 0.38;
      col += goldLite * fres * 0.28;
      col += goldLite * spe * 0.14;
      col *= 0.34 + 0.66*occ;
    }
    col += fill * base * 0.085;
    alpha = 1.0;
  }

  /* ---------- volumetric halo + shafts around the cross ---------- */
  vec3 crossC = vec3(0., 0.42, 0.);
  float glow = 0., rays = 0.;
  for(int i=0;i<42;i++){
    float fi = float(i);
    float sd = 0.35 + fi*0.056;
    if(hit > 0. && sd > hit) break;
    vec3 p = ro + rd*sd;
    vec3 q = p - crossC;
    q.xz = rot(t*0.18 + (uMouse.x-0.5)*0.70) * q.xz;
    q.yz = rot((uMouse.y-0.5)*0.18) * q.yz;
    float dc = sdCrossD(q);
    glow += exp(-dc*10.5) * 0.028;
    float ang = atan(q.y, q.x);
    float turb = 0.35 + 0.65*noise(vec3(ang*5.0, sd*1.1, t*0.26));
    rays += exp(-dc*2.2) * turb * 0.0145;
  }
  col += gold * glow * (1.45 + uPulse*2.4);
  col += goldLite * rays * (0.80 + uPulse*1.7);
  alpha = max(alpha, clamp(glow*2.3 + rays*1.5, 0., 1.));

  /* ---------- drifting motes ---------- */
  vec2 gp = uv*9.0;
  vec2 gi2 = floor(gp);
  for(int j=-1;j<=1;j++){
    for(int i=-1;i<=1;i++){
      vec2 cell = gi2 + vec2(float(i), float(j));
      float h = hash(cell);
      if(h < 0.56) continue;
      vec2 off = vec2(hash(cell+3.1) + sin(t*(0.25+h*0.4)+h*20.0)*0.10,
                      fract(hash(cell+7.7) + t*(0.018+h*0.045)));
      float dm = length(gp - (cell+off));
      float tw = 0.45 + 0.55*sin(t*(0.9+h*2.2) + h*40.0);
      float m2 = 0.00048/(dm*dm+0.00042) * tw;
      col += goldLite * m2;
      alpha = max(alpha, clamp(m2*1.4,0.,1.));
    }
  }

  /* contact shadow beneath the book */
  float shadowPool = exp(-pow(length((uv - vec2(0.0,-0.86))*vec2(0.95,2.8)), 1.5)*4.2);
  col *= 1.0 - shadowPool*0.34;

  float pool = exp(-length((uv - vec2(0.0,-0.60))*vec2(1.0,1.5))*4.6);
  col += gold * pool * 0.10;
  alpha = max(alpha, pool*0.24);

  col = pow(max(col,0.), vec3(0.90));
  gl_FragColor = vec4(col, alpha);
}
`;

function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn('cross:', gl.getShaderInfoLog(s));
  return s;
}

let uni = {};
if (gl) {
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  ['uRes','uTime','uMouse','uPulse','uScroll','uAspect','uSteps'].forEach(n => uni[n] = gl.getUniformLocation(prog, n));
}

const st = { mx:.5, my:.5, tmx:.5, tmy:.5, pulse:0, scroll:0, tscroll:0, visible:true };

function resize(){
  const dpr = Math.min(devicePixelRatio || 1, 1.5) * SCALE * (SCALE < 1 ? 0.7 : 1);
  const r = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(r.width * dpr));
  const h = Math.max(1, Math.floor(r.height * dpr));
  if (canvas.width !== w || canvas.height !== h){
    canvas.width = w; canvas.height = h;
    if (gl) gl.viewport(0, 0, w, h);
  }
}
addEventListener('resize', resize);
setTimeout(resize, 0);

addEventListener('pointermove', e => {
  st.tmx = e.clientX / innerWidth;
  st.tmy = 1 - e.clientY / innerHeight;
}, { passive:true });

addEventListener('scroll', () => {
  const r = canvas.getBoundingClientRect();
  st.visible = r.bottom > -100 && r.top < innerHeight + 100;
  st.tscroll = Math.min(1, Math.max(0, -r.top / innerHeight));
}, { passive:true });

const prevPulse = window.verselightPulse;
window.verselightPulse = () => {
  st.pulse = 1;
  if (typeof prevPulse === 'function') prevPulse();
};

const t0 = performance.now();
const vis = visible(canvas);
const tick = limiter(24);
function frame(){
  requestAnimationFrame(frame);
  if (!vis.on || !tick()) return;
  if (!gl || !st.visible) return;
  resize();
  st.mx += (st.tmx - st.mx) * 0.06;
  st.my += (st.tmy - st.my) * 0.06;
  st.scroll += (st.tscroll - st.scroll) * 0.08;
  st.pulse *= 0.95;

  gl.uniform2f(uni.uRes, canvas.width, canvas.height);
  gl.uniform1f(uni.uTime, (performance.now() - t0) / 1000);
  gl.uniform2f(uni.uMouse, st.mx, st.my);
  gl.uniform1f(uni.uPulse, st.pulse);
  gl.uniform1f(uni.uScroll, st.scroll);
  gl.uniform1f(uni.uAspect, canvas.width / Math.max(1, canvas.height));
  gl.uniform1f(uni.uSteps, SCALE < 1 ? 46.0 : 108.0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
frame();
}