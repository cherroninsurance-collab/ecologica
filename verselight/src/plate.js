import { SCALE, visible, limiter } from './gate.js';
/* Verselight — illuminated plate: flowing gold-leaf filigree + a realistic codex. */

/* ---------- 1. filigree backdrop (2D canvas, flow-field gold threads) ---------- */
(function(){
  const c = document.getElementById('plategl');
  if(!c) return;
  const x = c.getContext('2d');
  let W=0, H=0, dpr=1, particles=[], t=0;

  function hash(a,b){ const s=Math.sin(a*127.1+b*311.7)*43758.5453; return s-Math.floor(s); }
  function noise(px,py){
    const ix=Math.floor(px), iy=Math.floor(py), fx=px-ix, fy=py-iy;
    const u=fx*fx*(3-2*fx), v=fy*fy*(3-2*fy);
    return (hash(ix,iy)*(1-u)+hash(ix+1,iy)*u)*(1-v) + (hash(ix,iy+1)*(1-u)+hash(ix+1,iy+1)*u)*v;
  }

  function seed(){
    particles = [];
    const n = Math.min(220, Math.floor(W*H/9000));
    for(let i=0;i<n;i++) particles.push({
      x: Math.random()*W, y: Math.random()*H,
      life: Math.random()*260, max: 180+Math.random()*220,
      w: 0.35+Math.random()*1.05
    });
  }

  function resize(){
    dpr = Math.min(devicePixelRatio||1, 1.6) * SCALE;
    const r = c.getBoundingClientRect();
    W = Math.max(1, Math.floor(r.width*dpr));
    H = Math.max(1, Math.floor(r.height*dpr));
    if(c.width!==W||c.height!==H){ c.width=W; c.height=H; seed(); x.clearRect(0,0,W,H); }
  }
  addEventListener('resize', resize);
  setTimeout(resize,0);

  const vis = visible(c);
  const tick = limiter(24);
  function frame(){
    requestAnimationFrame(frame);
    if (!vis.on || !tick()) return;
    resize();
    if(!W||!H) return;
    const r = c.getBoundingClientRect();
    if(r.bottom < -200 || r.top > innerHeight+200) return;

    t += 0.0032;
    x.fillStyle = 'rgba(9,10,15,0.045)';
    x.fillRect(0,0,W,H);
    x.globalCompositeOperation = 'lighter';

    for(const p of particles){
      const nx = noise(p.x*0.0022 + t*2.2, p.y*0.0022);
      const ny = noise(p.x*0.0022 + 31.7, p.y*0.0022 - t*1.6);
      const ang = (nx-0.5)*Math.PI*2.6 + (ny-0.5)*Math.PI*1.4;
      const sp = 0.7*dpr;
      const px = p.x, py = p.y;
      p.x += Math.cos(ang)*sp;
      p.y += Math.sin(ang)*sp - 0.16*dpr;
      p.life++;

      const fade = Math.sin(Math.min(1,p.life/p.max)*Math.PI);
      x.strokeStyle = `rgba(217,164,65,${0.055*fade})`;
      x.lineWidth = p.w*dpr;
      x.beginPath(); x.moveTo(px,py); x.lineTo(p.x,p.y); x.stroke();

      if(p.life>p.max || p.x<-20||p.x>W+20||p.y<-20||p.y>H+20){
        p.x = Math.random()*W; p.y = H*0.55 + Math.random()*H*0.6;
        p.life = 0; p.max = 180+Math.random()*220;
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
  frame();
})();

/* ---------- 2. the codex: realistic raymarched book ---------- */
(function(){
  const canvas = document.getElementById('bookgl');
  if(!canvas) return;
  const gl = canvas.getContext('webgl', { antialias:false, alpha:true, premultipliedAlpha:false });
  if(!gl) return;

  const VERT = `attribute vec2 p; void main(){ gl_Position=vec4(p,0.,1.); }`;
  const FRAG = `
precision highp float;
uniform vec2 uRes; uniform float uTime; uniform vec2 uMouse; uniform float uPulse; uniform float uAspect;
#define PI 3.14159265
float h1(float n){ return fract(sin(n)*43758.5453123); }
float h2(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise(vec3 x){
  vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  float n=i.x+i.y*57.+113.*i.z;
  return mix(mix(mix(h1(n),h1(n+1.),f.x),mix(h1(n+57.),h1(n+58.),f.x),f.y),
             mix(mix(h1(n+113.),h1(n+114.),f.x),mix(h1(n+170.),h1(n+171.),f.x),f.y),f.z);
}
float fbm(vec3 p){ float v=0.,a=.5; for(int i=0;i<4;i++){v+=a*noise(p);p*=2.05;a*=.5;} return v; }
mat2 rot(float a){ float c=cos(a),s=sin(a); return mat2(c,-s,s,c); }
float sdBox(vec3 p, vec3 b){ vec3 d=abs(p)-b; return length(max(d,0.))+min(max(d.x,max(d.y,d.z)),0.); }
float sdR(vec3 p, vec3 b, float r){ return sdBox(p,b)-r; }
float sdCap(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa=p-a, ba=b-a;
  float h=clamp(dot(pa,ba)/dot(ba,ba),0.,1.);
  return length(pa-ba*h)-r;
}

float leaf(vec3 p, float side, float lift, float curl, float wob, float wid, float hgt, float th){
  p.x *= side;
  float x = max(p.x, 0.0);
  float u = clamp(x/wid, 0., 1.);
  float zc = p.z/max(hgt,1e-3);
  float sag = lift*pow(u,1.55)*0.60 + lift*0.10*zc*zc*u + wob*sin(u*2.6)*0.040;
  p.y += sag;
  p.xy = rot(-curl*u)*p.xy;
  float w = wid*(1.0 - 0.030*zc*zc);
  return sdR(p - vec3(w*0.5,0.,0.), vec3(w*0.5, th, hgt), th*0.9);
}

float mapBook(vec3 p, float t, out float id){
  id=0.; float d=1e9;
  float W=0.330, Hh=0.258, lift=0.40;

  /* solid wedge page block */
  {
    vec3 q=p; q.x=abs(q.x);
    float u=clamp(q.x/W,0.,1.);
    float zc=q.z/Hh;
    float sag=lift*pow(u,1.55)*0.60 + lift*0.10*zc*zc*u;
    float th=0.012 + 0.060*pow(u,0.85);
    float db=sdR(q - vec3(q.x, -sag-th*0.5, 0.), vec3(0.0009, th*0.5, Hh*(1.0-0.03*zc*zc)), 0.004);
    db=max(db, q.x-W); db=max(db, -q.x+0.004);
    if(db<d){ d=db; id=2.; }
  }

  for(int i=0;i<3;i++){
    float fi=float(i);
    float s=min(leaf(p-vec3(0.,-0.0075*fi,0.), 1., lift-fi*0.020, 0.0, 0.008+fi*0.003, W, Hh, 0.0034),
                leaf(p-vec3(0.,-0.0075*fi,0.),-1., lift-fi*0.020, 0.0, 0.008+fi*0.003, W, Hh, 0.0034));
    if(s<d){ d=s; id=2.; }
  }

  /* cover with overhang */
  vec3 cp=p-vec3(0.,-0.052,0.);
  float cw=W+0.020, chh=Hh+0.018;
  float board=min(leaf(cp, 1., 0.38, 0.02, 0.0, cw, chh, 0.0125),
                  leaf(cp,-1., 0.38, 0.02, 0.0, cw, chh, 0.0125));
  vec3 sp=cp-vec3(0.,-0.016,0.);
  float spine=sdCap(sp, vec3(0.,0.,-chh), vec3(0.,0.,chh), 0.030);
  spine=max(spine, -sp.y-0.052);
  float cov=min(board,spine);
  if(cov<d){ d=cov; id=1.; }

  /* headbands */
  float hb=min(sdCap(sp, vec3(-0.020,0.006, chh-0.006), vec3(0.020,0.006, chh-0.006), 0.0085),
               sdCap(sp, vec3(-0.020,0.006,-chh+0.006), vec3(0.020,0.006,-chh+0.006), 0.0085));
  if(hb<d){ d=hb; id=4.; }

  /* turning leaf */
  float ph=fract(t*0.095);
  float ease=ph*ph*(3.-2.*ph);
  float fl=sin(ph*PI);
  vec3 q=p-vec3(0.,0.004,0.);
  q.xy=rot(-ease*PI)*q.xy;
  float tp=leaf(q,-1., lift+fl*0.52, fl*0.50, fl*0.09, W, Hh, 0.0030+fl*0.0012);
  if(tp<d){ d=tp; id=3.; }

  /* ribbon */
  float rz=0.078;
  float rib=sdCap(p, vec3(0.02,-0.010,rz), vec3(W*0.82,-0.195+sin(t*0.9)*0.010, rz+0.020), 0.010);
  rib=max(rib, abs(p.z-rz-(p.x*0.06))-0.019);
  if(rib<d){ d=rib; id=5.; }

  return d;
}

float mapAll(vec3 p, float t, out float id){
  vec3 bp = p - vec3(0., -0.02 + sin(t*0.6)*0.020, 0.);
  bp.xz = rot(0.28 + sin(t*0.20)*0.28 + (uMouse.x-0.5)*0.50) * bp.xz;
  bp.yz = rot(-0.54 + (uMouse.y-0.5)*0.16) * bp.yz;
  return mapBook(bp, t, id);
}

float aniso(vec3 n, vec3 l, vec3 v, vec3 tang, float rough){
  vec3 h=normalize(l+v);
  float dt=dot(tang,h), nh=dot(n,h);
  float k=dt/max(rough,1e-3);
  return exp(-2.0*(k*k)/(1.0+max(nh,0.0)))*max(nh,0.0);
}

vec3 nrm(vec3 p, float t){ vec2 e=vec2(0.0013,0.); float m;
  return normalize(vec3(mapAll(p+e.xyy,t,m)-mapAll(p-e.xyy,t,m),
                        mapAll(p+e.yxy,t,m)-mapAll(p-e.yxy,t,m),
                        mapAll(p+e.yyx,t,m)-mapAll(p-e.yyx,t,m))); }
float sha(vec3 ro, vec3 rd, float t){ float res=1.,m,d=0.03;
  for(int i=0;i<22;i++){ float h=mapAll(ro+rd*d,t,m); res=min(res,8.5*h/d); d+=clamp(h,0.012,0.09); if(res<0.005||d>1.9)break; }
  return clamp(res,0.,1.); }
float occf(vec3 p, vec3 n, float t){ float o=0.,s=1.,m;
  for(int i=0;i<5;i++){ float h=0.012+0.080*float(i); o+=(h-mapAll(p+n*h,t,m))*s; s*=0.72; }
  return clamp(1.-2.4*o,0.,1.); }

void main(){
  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;
  float t=uTime;

  float fit = clamp(1.05/max(uAspect,0.60), 1.0, 1.75);
  vec3 ro=vec3(0., 0.34*fit, 1.70*fit);
  vec3 ta=vec3(0.,-0.05,0.);
  vec3 fw=normalize(ta-ro), rt=normalize(cross(vec3(0,1,0),fw)), up=cross(fw,rt);
  vec3 rd=normalize(uv.x*rt+uv.y*up+(1.85/fit)*fw);

  vec3 gold=vec3(1.,0.755,0.315), lite=vec3(1.,0.93,0.76);
  vec3 col=vec3(0.); float alpha=0.;
  float d=0., m=0., hit=-1.;
  for(int i=0;i<92;i++){
    vec3 p=ro+rd*d; float hh=mapAll(p,t,m);
    if(hh<0.0015){ hit=d; break; }
    d+=hh*0.90; if(d>5.) break;
  }
  vec3 key=normalize(vec3(-0.35,0.92,0.40));
  vec3 rimD=normalize(vec3(0.68,0.18,-0.62));

  if(hit>0.){
    vec3 p=ro+rd*hit, n=nrm(p,t); float mm; mapAll(p,t,mm);
    float o=occf(p,n,t), sh=sha(p+n*0.011,key,t);
    float dif=clamp(dot(n,key),0.,1.);
    float rimL=clamp(dot(n,rimD),0.,1.);
    float fres=pow(1.-clamp(dot(n,-rd),0.,1.),3.2);
    float spe=pow(clamp(dot(reflect(-key,n),-rd),0.,1.),58.);

    vec3 bq = p - vec3(0.,-0.02,0.);
    bq.yz = rot(0.54)*bq.yz;
    bq.xz = rot(-(0.28+sin(t*0.20)*0.28))*bq.xz;

    vec3 base=vec3(0.);
    if(mm>4.5){
      float weave=fbm(p*180.);
      base=mix(vec3(0.42,0.055,0.055), vec3(0.66,0.13,0.11), weave);
      col=base*(0.28+1.05*dif*mix(0.5,1.,sh));
      col+=vec3(1.,0.65,0.55)*pow(clamp(dot(-n,key),0.,1.),1.4)*0.35;
      col+=vec3(1.,0.85,0.80)*spe*0.30;
      col*=0.42+0.58*o;
    } else if(mm>3.5){
      float stripe=step(0.5, fract(bq.x*90.));
      base=mix(vec3(0.72,0.60,0.34), vec3(0.30,0.10,0.09), stripe);
      col=base*(0.30+1.0*dif*sh);
      col+=lite*spe*0.35; col*=0.45+0.55*o;
    } else if(mm>2.5){
      float trans=pow(clamp(dot(-n,key),0.,1.),1.20);
      float fibre=fbm(p*vec3(190.,40.,190.));
      float mottle=fbm(p*13.+2.);
      base=mix(vec3(0.955,0.930,0.868), vec3(0.995,0.982,0.955), fibre*0.5+mottle*0.5);
      float row=fract(bq.z*46.);
      float line=smoothstep(0.62,0.46,row)*smoothstep(0.05,0.19,row);
      float word=step(0.32,h2(floor(bq.zx*vec2(46.,27.))));
      base=mix(base, vec3(0.55,0.50,0.44), line*word*0.16);
      col=base*(0.30+0.88*dif*mix(0.62,1.,sh));
      col+=vec3(1.,0.90,0.72)*trans*(0.90+0.30*fibre);
      col+=vec3(1.,.97,.90)*fres*0.46;
      col+=lite*spe*0.16;
      col*=0.50+0.50*o;
    } else if(mm>1.5){
      float u=abs(bq.x), zc=bq.z;
      float row=fract(zc*46.);
      float line=smoothstep(0.62,0.46,row)*smoothstep(0.05,0.19,row);
      float word=step(0.28, h2(floor(vec2(zc*46., u*30.))));
      float body=step(0.085,u)*step(u,0.282)*step(abs(zc),0.215);
      float ink=line*word*body;
      float fox=fbm(bq*9.+5.);
      base=mix(vec3(0.950,0.925,0.858), vec3(0.905,0.868,0.788), fox*0.55);
      base=mix(base, vec3(0.155,0.130,0.108), ink*0.80);
      float tick=step(0.088,u)*step(u,0.104)*line*step(0.55,h2(floor(vec2(zc*46.,3.))));
      base=mix(base, gold*0.85, tick*0.7);
      float initial=smoothstep(0.042,0., length(vec2(u-0.145, zc+0.158))-0.028);
      base=mix(base, vec3(0.60,0.13,0.10), initial*0.85);
      float rule=smoothstep(0.0022,0., abs(zc+0.232))*step(0.085,u)*step(u,0.282);
      base=mix(base, vec3(0.45,0.38,0.30), rule*0.5);
      float gutter=exp(-u*11.);
      base*=1.-gutter*0.62;
      float striate=0.5+0.5*sin(bq.y*760.);
      float edgeMask=smoothstep(0.264,0.325,u);
      base=mix(base, mix(vec3(0.86,0.82,0.74), gold*1.02, 0.45)*(0.75+0.25*striate), edgeMask*0.85);
      float gilt=smoothstep(0.210,0.248,abs(zc));
      base=mix(base, gold*1.05, gilt*0.60);
      col=base*(0.24+0.94*dif*mix(0.46,1.,sh));
      col+=lite*spe*0.18; col+=gold*fres*0.20; col*=0.34+0.66*o;
    } else {
      float pebble=fbm(bq*86.), grainL=fbm(bq*vec3(210.,60.,210.)), scuff=fbm(bq*7.+3.);
      base=mix(vec3(0.055,0.030,0.026), vec3(0.165,0.098,0.064), pebble*0.62+grainL*0.22+scuff*0.30);
      base+=vec3(0.10,0.065,0.038)*smoothstep(0.62,0.92,pebble)*0.7;
      float bx=abs(bq.x), bz=abs(bq.z);
      float f1=smoothstep(0.0075,0.0018, abs(bx-0.302))*step(bz,0.252);
      float f2=smoothstep(0.0075,0.0018, abs(bx-0.282))*step(bz,0.236);
      float f3=smoothstep(0.0075,0.0018, abs(bz-0.248))*step(bx,0.308);
      base=mix(base, gold*0.92, clamp(f1+f2*0.7+f3,0.,1.)*0.62);
      float flr=smoothstep(0.030,0., length(vec2(bx-0.272, bz-0.218))-0.012);
      base=mix(base, gold*0.95, flr*0.55);
      vec3 tang=normalize(cross(n,vec3(0.,1.,0.)));
      col=base*(0.20+0.82*dif*sh);
      col+=lite*aniso(n,key,-rd,tang,0.30)*0.20;
      col+=gold*rimL*0.38; col+=lite*fres*0.28; col+=lite*spe*0.14;
      col*=0.34+0.66*o;
    }
    alpha=1.;
  }

  float halo=exp(-length(uv-vec2(0.,0.0))*3.1);
  col+=gold*halo*0.15*(1.+uPulse*1.5);
  alpha=max(alpha, halo*0.34);

  float shadowPool=exp(-pow(length((uv-vec2(0.,-0.44))*vec2(0.95,2.9)),1.5)*4.2);
  col*=1.-shadowPool*0.30;

  vec2 gp=uv*10.; vec2 gi=floor(gp);
  for(int j=-1;j<=1;j++) for(int i=-1;i<=1;i++){
    vec2 cl=gi+vec2(float(i),float(j));
    float hh=h2(cl); if(hh<0.62) continue;
    vec2 off=vec2(h2(cl+2.3), fract(h2(cl+6.1)+t*(0.03+hh*0.05)));
    float dm=length(gp-(cl+off));
    float tw=0.5+0.5*sin(t*(1.+hh*2.)+hh*40.);
    float mo=0.00045/(dm*dm+0.0004)*tw;
    col+=lite*mo; alpha=max(alpha,clamp(mo*1.3,0.,1.));
  }

  col=pow(max(col,0.),vec3(0.90));
  gl_FragColor=vec4(col,alpha);
}
`;
  function cs(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) console.warn('plate:',gl.getShaderInfoLog(s)); return s; }

  const prog=gl.createProgram();
  gl.attachShader(prog,cs(gl.VERTEX_SHADER,VERT));
  gl.attachShader(prog,cs(gl.FRAGMENT_SHADER,FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(prog,'p'); gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const U={}; ['uRes','uTime','uMouse','uPulse','uAspect'].forEach(n=>U[n]=gl.getUniformLocation(prog,n));

  const st={mx:.5,my:.5,tmx:.5,tmy:.5,pulse:0,vis:true};
  function resize(){
    const dpr=Math.min(devicePixelRatio||1,1.5) * SCALE;
    const r=canvas.getBoundingClientRect();
    const w=Math.max(1,Math.floor(r.width*dpr)), h=Math.max(1,Math.floor(r.height*dpr));
    if(canvas.width!==w||canvas.height!==h){ canvas.width=w; canvas.height=h; gl.viewport(0,0,w,h); }
    st.vis = r.bottom>-200 && r.top<innerHeight+200;
  }
  addEventListener('resize',resize); setTimeout(resize,0);
  addEventListener('pointermove',e=>{ st.tmx=e.clientX/innerWidth; st.tmy=1-e.clientY/innerHeight; },{passive:true});

  const prev=window.verselightPulse;
  window.verselightPulse=()=>{ st.pulse=1; if(typeof prev==='function') prev(); };

  const t0=performance.now();
  const tickBook = limiter(24);
  (function loop(){
    requestAnimationFrame(loop);
    resize();
    if(!st.vis || !tickBook()) return;
    st.mx+=(st.tmx-st.mx)*0.06; st.my+=(st.tmy-st.my)*0.06; st.pulse*=0.95;
    gl.uniform2f(U.uRes,canvas.width,canvas.height);
    gl.uniform1f(U.uTime,(performance.now()-t0)/1000);
    gl.uniform2f(U.uMouse,st.mx,st.my);
    gl.uniform1f(U.uPulse,st.pulse);
    gl.uniform1f(U.uAspect, canvas.width/Math.max(1,canvas.height));
    gl.drawArrays(gl.TRIANGLES,0,3);
  })();
})();