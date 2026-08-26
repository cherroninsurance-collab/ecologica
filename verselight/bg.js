import { SCALE, limiter } from './gate.js';
/* Verselight — WebGL atmosphere: volumetric god-rays, drifting dust motes, ink diffusion */

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl', { antialias:false, alpha:true, premultipliedAlpha:false });

const VERT = `
attribute vec2 p;
void main(){ gl_Position = vec4(p,0.,1.); }
`;

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform float uScroll;    // 0..1 page progress
uniform vec2  uMouse;     // 0..1
uniform float uPulse;     // 0..1 decaying burst

// --- hash / noise ---
float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),u.x),
             mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),u.x),u.y);
}
float fbm(vec2 p){
  float v=0., a=.5;
  mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<6;i++){ v+=a*noise(p); p=m*p; a*=.5; }
  return v;
}

// radial god-ray shafts emanating from a source point
float shafts(vec2 uv, vec2 src, float t){
  vec2 d = uv - src;
  float ang = atan(d.y, d.x);
  float dist = length(d);
  float rays = 0.;
  rays += .55 * noise(vec2(ang*7.0, t*0.10));
  rays += .30 * noise(vec2(ang*15.0, t*0.16 + 4.0));
  rays += .18 * noise(vec2(ang*31.0, t*0.22 + 9.0));
  rays = pow(max(rays,0.), 2.2);
  float fall = exp(-dist*1.55);
  return rays * fall;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 asp = vec2(uRes.x/uRes.y, 1.0);
  vec2 p = uv * asp;

  float t = uTime;

  // light source drifts slowly, nudged by cursor
  vec2 src = vec2(0.30, 0.86) * asp;
  src += vec2(sin(t*0.07)*0.05, cos(t*0.05)*0.03);
  src += (uMouse - 0.5) * vec2(0.16, 0.10) * asp;
  src.y -= uScroll * 0.55;

  // --- deep field ---
  vec3 col = vec3(0.027, 0.031, 0.043);

  // slow nebular ink diffusion
  vec2 q = p*1.6;
  q += vec2(fbm(q + t*0.028), fbm(q + vec2(5.2,1.3) - t*0.021)) * 0.65;
  float ink = fbm(q*1.25 + t*0.012);
  vec3 deep  = vec3(0.055,0.070,0.115);
  vec3 warm  = vec3(0.155,0.105,0.048);
  col = mix(col, deep, smoothstep(0.30,0.85,ink));
  col = mix(col, warm, smoothstep(0.55,0.98,ink)*0.55);

  // --- volumetric shafts ---
  float s = shafts(p, src, t);
  s += shafts(p*1.03 + 0.01, src, t*1.21) * 0.45;
  vec3 gold = vec3(1.00, 0.745, 0.315);
  col += gold * s * (0.85 + uPulse*1.3);

  // core glow at the source
  float d = length(p - src);
  col += gold * exp(-d*4.2) * 0.30;
  col += vec3(1.0,0.93,0.80) * exp(-d*13.0) * 0.42;

  // horizon bloom that grows as you scroll
  float horizon = exp(-abs(uv.y - (0.14 + uScroll*0.2))*7.0);
  col += vec3(0.22,0.32,0.75) * horizon * 0.10 * (0.4 + uScroll);

  // dust motes
  vec2 gp = p*vec2(26.0,26.0);
  vec2 gi = floor(gp);
  for(int j=-1;j<=1;j++){
    for(int i=-1;i<=1;i++){
      vec2 cell = gi + vec2(float(i), float(j));
      float h = hash(cell);
      if(h < 0.72) continue;
      vec2 off = vec2(hash(cell+1.7), hash(cell+9.1));
      off.y += sin(t*(0.20+h*0.35) + h*30.0)*0.28;
      off.x += cos(t*(0.14+h*0.22) + h*17.0)*0.20;
      float dm = length(gp - (cell+off));
      float tw = 0.55 + 0.45*sin(t*(1.1+h*2.4) + h*40.0);
      col += gold * (0.0042/(dm*dm+0.0035)) * tw * (0.35 + s*2.2);
    }
  }

  // vignette + subtle film curve
  float vig = smoothstep(1.25, 0.25, length(uv-0.5));
  col *= 0.42 + 0.58*vig;
  col = pow(col, vec3(0.92));

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(type, src){
  const s = gl.createShader(type);
  gl.shaderSource(s, src); gl.compileShader(s);
  if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
  return s;
}

let prog, uni = {}, raf;
if (gl) {
  prog = gl.createProgram();
  gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'p');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  ['uRes','uTime','uScroll','uMouse','uPulse'].forEach(n => uni[n] = gl.getUniformLocation(prog, n));
}

const state = { mx:0.5, my:0.5, tmx:0.5, tmy:0.5, scroll:0, tscroll:0, pulse:0, dpr:1 };

function resize(){
  state.dpr = Math.min(devicePixelRatio || 1, 1.75) * (SCALE < 1 ? 0.5 : 1);
  canvas.width  = Math.floor(innerWidth  * state.dpr);
  canvas.height = Math.floor(innerHeight * state.dpr);
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
  if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}
addEventListener('resize', resize);
resize();

addEventListener('pointermove', e => {
  state.tmx = e.clientX / innerWidth;
  state.tmy = 1 - e.clientY / innerHeight;
}, { passive:true });

addEventListener('scroll', () => {
  const max = Math.max(1, document.body.scrollHeight - innerHeight);
  state.tscroll = Math.min(1, scrollY / max);
}, { passive:true });

window.verselightPulse = () => { state.pulse = 1; };

const t0 = performance.now();
const tick = limiter(24);
function frame(){
  raf = requestAnimationFrame(frame);
  if (!tick()) return;
  if (!gl) return;
  state.mx += (state.tmx - state.mx) * 0.055;
  state.my += (state.tmy - state.my) * 0.055;
  state.scroll += (state.tscroll - state.scroll) * 0.07;
  state.pulse *= 0.955;

  gl.uniform2f(uni.uRes, canvas.width, canvas.height);
  gl.uniform1f(uni.uTime, (performance.now() - t0) / 1000);
  gl.uniform1f(uni.uScroll, state.scroll);
  gl.uniform2f(uni.uMouse, state.mx, state.my);
  gl.uniform1f(uni.uPulse, state.pulse);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
frame();

/* ---------- animated film grain (2D canvas) ---------- */
const gc = document.getElementById('grain');
const g2 = gc.getContext('2d');
let grainTiles = [];
function buildGrain(){
  gc.width = innerWidth; gc.height = innerHeight;
  grainTiles = [];
  for (let k = 0; k < 4; k++){
    const s = 220;
    const off = document.createElement('canvas');
    off.width = s; off.height = s;
    const ctx = off.getContext('2d');
    const img = ctx.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4){
      const v = 128 + (Math.random() - 0.5) * 255;
      img.data[i] = img.data[i+1] = img.data[i+2] = v;
      img.data[i+3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    grainTiles.push(off);
  }
}
addEventListener('resize', buildGrain);
buildGrain();

let gi = 0;
setInterval(() => {
  if (!grainTiles.length) return;
  gi = (gi + 1) % grainTiles.length;
  const pat = g2.createPattern(grainTiles[gi], 'repeat');
  g2.clearRect(0, 0, gc.width, gc.height);
  g2.fillStyle = pat;
  g2.save();
  g2.translate(-Math.random() * 200, -Math.random() * 200);
  g2.fillRect(0, 0, gc.width + 400, gc.height + 400);
  g2.restore();
}, 90);