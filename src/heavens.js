/* ============================================================================
   HEAVENS.JS — a drop-in animated sky for any website
   ----------------------------------------------------------------------------
   Blue sky, drifting sunlit clouds, heaven's gates, and an optional floating
   glass codex — raymarched in a single WebGL fragment shader.

   No dependencies. No build step. No network. One file.

     <script src="heavens.js"></script>
     <script>Heavens.mount();</script>

   Or auto-mount with zero JavaScript of your own:

     <script src="heavens.js" data-heavens></script>

   OPTIONS
     accent    0xc2870b   gold light colour (hex int)
     book      true       show the floating codex
     gates     true       show heaven's gates
     clouds    true       show cloud layers
     parallax  true       follow the pointer (auto-off on touch devices)
     quality   'auto'     'auto' | 'low' | 'high'
     zIndex    -1         canvas stacking (default sits behind page content)

   API
     const sky = Heavens.mount(target?, options?)
     sky.setAccent(0xef4444)      retheme the light
     sky.setZoom(zoom, bloom)     0..1 dolly toward the codex, 0..1 whiteout
     sky.bookRect()               codex rect in CSS pixels (for hit-testing)
     sky.pause() / sky.resume()   stop/start the render loop
     sky.destroy()                remove it entirely

   PERFORMANCE
     Raymarching is fill-rate bound, so this renders to a reduced-resolution
     buffer that the browser scales up — invisible for a soft-focus backdrop,
     and the difference between 60fps and a slideshow on a phone. Quality
     adapts to measured frame time, and the loop pauses whenever the tab is
     hidden or the canvas scrolls out of view.

   MIT licensed. Part of ECOLOGIA.
   ========================================================================== */
(function (global) {
  'use strict';

  var VERT = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';

  var FRAG = [
'precision highp float;',
'uniform vec2  uRes;',
'uniform float uTime;',
'uniform vec2  uMouse;',
'uniform vec3  uAccent;',
'uniform float uOpen;',
'uniform float uZoom;',
'uniform float uBloom;',
'uniform float uSteps;',   // march budget — the main quality dial
'uniform float uBook;',
'uniform float uGates;',
'uniform float uClouds;',

'mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}',
'float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}',
'float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);',
'  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}',

/* Authored colours are display-space; the pipeline ends in ACES + 1/2.2
   gamma, so they must be linearised on the way in or the sky bleaches. */
'vec3 sRGB(vec3 c){return pow(max(c,0.0),vec3(2.2));}',

'float fbm(vec2 p){float v=0.0,a=0.5;',
'  for(int i=0;i<5;i++){v+=a*noise(p);p*=2.03;a*=0.5;}return v;}',

'float cloudLayer(vec3 d,float h,float sc,float dr,float t){',
'  if(d.y<0.02)return 0.0;',
'  vec2 p=(d.xz*(h/d.y))*sc+vec2(t*dr,t*dr*0.35);',
'  return smoothstep(0.60,0.97,fbm(p))*smoothstep(0.02,0.20,d.y);}',

'float sdSeg(vec2 p,vec2 a,vec2 b){vec2 pa=p-a,ba=b-a;',
'  return length(pa-ba*clamp(dot(pa,ba)/dot(ba,ba),0.0,1.0));}',

/* Pillars, arch, and railings — light rather than architecture.
   "and its gates will never be shut by day" (Revelation 21:25) */
'float gateField(vec2 q){',
'  const float SPAN=0.46,SPRING=0.02,FOOT=-0.55;',
'  float d=min(sdSeg(q,vec2(-SPAN,FOOT),vec2(-SPAN,SPRING))-0.022,',
'              sdSeg(q,vec2( SPAN,FOOT),vec2( SPAN,SPRING))-0.022);',
'  vec2 ac=q-vec2(0.0,SPRING);',
'  if(ac.y>=0.0)d=min(d,abs(length(ac)-SPAN)-0.018);',
'  for(int i=1;i<7;i++){float x=-SPAN+float(i)*(2.0*SPAN/7.0);',
'    float top=SPRING+sqrt(max(SPAN*SPAN-x*x,0.0));',
'    d=min(d,sdSeg(q,vec2(x,FOOT),vec2(x,top*0.93))-0.007);}',
'  return d;}',

'vec3 env(vec3 d){',
/* The sun must sit in the hemisphere the rays travel toward (-z), or it
   never enters frame and the clouds lose their gold rim. */
'  vec3 L=normalize(vec3(0.06,0.58,-0.81));',
'  float y=clamp(d.y*0.5+0.5,0.0,1.0);',
'  vec3 c=mix(sRGB(vec3(0.62,0.80,0.95)),sRGB(vec3(0.13,0.38,0.80)),pow(y,0.55));',
'  float sd=max(dot(d,L),0.0);',
'  c+=sRGB(vec3(1.00,0.98,0.92))*pow(sd,320.0)*4.0;',
'  c+=sRGB(vec3(1.00,0.94,0.80))*pow(sd,22.0)*0.55;',
'  if(uGates>0.5 && d.z<-0.05){',
'    float g=max(gateField(d.xy/(-d.z)*1.9),0.0);',
'    c+=sRGB(vec3(1.00,0.99,0.95))*exp(-g*20.0)*2.10;',
'    c+=sRGB(vec3(1.00,0.86,0.52))*exp(-g*5.0)*0.55;}',
'  if(uClouds>0.5){',
'    float cl=clamp(cloudLayer(d,5.5,0.35,0.05,uTime)*0.45',
'                  +cloudLayer(d,2.4,0.62,0.14,uTime)*0.65,0.0,1.0);',
'    vec3 cc=mix(sRGB(vec3(1.0)),sRGB(vec3(1.00,0.96,0.86)),pow(sd,2.0));',
'    c=mix(c,cc,cl*0.80);',
'    c+=sRGB(vec3(1.00,0.88,0.62))*cl*pow(sd,3.0)*0.30;}',
'  return c;}',

'float sdRoundBox(vec3 p,vec3 b,float r){vec3 q=abs(p)-b+r;',
'  return length(max(q,0.0))+min(max(q.x,max(q.y,q.z)),0.0)-r;}',

'float mapBook(vec3 p){',
'  vec3 pc=p;pc.z+=0.20;',
'  float cover=sdRoundBox(pc,vec3(1.16,1.52,0.055),0.05);',
'  float hinge=mix(0.55,0.15,uOpen);',
'  vec3 pl=p;pl.x+=0.56;pl.xz*=rot(-hinge);',
'  vec3 pr=p;pr.x-=0.56;pr.xz*=rot(hinge);',
'  return min(cover,min(sdRoundBox(pl,vec3(0.52,1.42,0.028),0.02),',
'                       sdRoundBox(pr,vec3(0.52,1.42,0.028),0.02)));}',

'vec3 calcNormal(vec3 p){vec2 e=vec2(1.0,-1.0)*0.0012;',
'  return normalize(e.xyy*mapBook(p+e.xyy)+e.yyx*mapBook(p+e.yyx)+',
'                   e.yxy*mapBook(p+e.yxy)+e.xxx*mapBook(p+e.xxx));}',

'float marchInside(vec3 ro,vec3 rd){float t=0.004;',
'  for(int i=0;i<28;i++){float d=-mapBook(ro+rd*t);',
'    if(d<0.0008)break;t+=max(d,0.006);if(t>5.0)break;}return t;}',

/* Static swizzles per channel: dynamic vector indexing inside a loop is
   legal ES 1.0 but mis-compiled by several mobile drivers. */
'vec3 glassChannel(vec3 pos,vec3 N,vec3 rd,float ior){',
'  vec3 rr=refract(rd,N,1.0/ior);',
'  if(dot(rr,rr)<0.001)rr=reflect(rd,N);',
'  float inner=marchInside(pos+rr*0.006,rr);',
'  vec3 outR=refract(rr,-calcNormal(pos+rr*inner),ior);',
'  if(dot(outR,outR)<0.001)outR=rr;',
'  float ab=exp(-inner*0.55);',
'  return env(outR)*ab*0.88+uAccent*(1.0-ab)*1.05;}',

'void main(){',
'  vec2 uv=(gl_FragCoord.xy-0.5*uRes)/uRes.y;',
'  float pull=clamp((1.10-uRes.x/uRes.y)/0.60,0.0,1.0);',
'  vec3 ro=vec3(0.0,0.0,mix(mix(7.5,12.0,pull),2.35,uZoom));',
'  vec3 rd=normalize(vec3(uv*1.35,-2.6));',
'  float ax=uMouse.x*0.55+sin(uTime*0.30)*0.05;',
'  float ay=uMouse.y*0.36+cos(uTime*0.21)*0.03;',
'  ro.y-=sin(uTime*0.8)*0.075;',
'  ro.xz*=rot(ax);rd.xz*=rot(ax);',
'  ro.yz*=rot(ay);rd.yz*=rot(ay);',

'  float t=0.0,hit=0.0;vec3 shaft=vec3(0.0);',
'  for(int i=0;i<80;i++){',
'    if(float(i)>uSteps)break;',            // runtime quality dial
'    vec3 pos=ro+rd*t;',
'    float d=(uBook>0.5)?mapBook(pos):1e4;',
'    if(d<0.0016){hit=1.0;break;}',
'    float st=max(d*0.86,0.012);',
/* Density weighted by STEP LENGTH: sphere-tracing steps shrink near
   surfaces, so a per-iteration sum haloes every silhouette. */
'    float cone=1.0-smoothstep(0.0,mix(0.34,1.30,clamp(0.5-pos.y*0.35,0.0,1.0)),abs(pos.x));',
'    float dens=cone*smoothstep(-2.2,1.9,pos.y)',
'              *(0.55+0.45*noise(vec2(pos.x*2.4,pos.y*1.5-uTime*0.16)));',
'    shaft+=uAccent*dens*st*0.0045;',
'    t+=st;if(t>12.0)break;}',

'  vec3 col;',
'  if(hit>0.5){',
'    vec3 pos=ro+rd*t;vec3 N=calcNormal(pos);',
'    float fres=pow(1.0-max(dot(-rd,N),0.0),4.0);',
'    vec3 disp=vec3(glassChannel(pos,N,rd,1.440).r,',
'                   glassChannel(pos,N,rd,1.495).g,',
'                   glassChannel(pos,N,rd,1.550).b);',
'    col=mix(disp,env(reflect(rd,N)),clamp(fres,0.0,0.85));',
'    vec3 L=normalize(vec3(0.0,1.0,0.42));',
'    col+=vec3(1.0,0.97,0.88)*pow(max(dot(reflect(-L,N),-rd),0.0),88.0)*1.3;',
'    col+=uAccent*fres*0.95;',
'    col+=uAccent*pow(max(dot(N,L),0.0),2.0)*0.22;',
'    col+=vec3(0.55,0.62,1.0)*pow(1.0-max(dot(-rd,N),0.0),2.0)*0.10;',
'    col*=vec3(1.03,0.98,0.88);',
/* Script as ink, not glow: on a luminous page dark strokes read as text. */
'    float freq=74.0;float line=floor(pos.y*freq);',
'    float rule=smoothstep(0.74,0.97,sin(pos.y*freq)*0.5+0.5);',
'    float words=smoothstep(0.34,0.46,noise(vec2(pos.x*22.0,line*3.7)));',
'    float margin=smoothstep(1.24,1.12,abs(pos.y))*smoothstep(0.08,0.22,abs(pos.x))',
'                *smoothstep(1.02,0.90,abs(pos.x))*step(0.0,pos.z);',
'    col=mix(col,col*vec3(0.30,0.24,0.15),rule*words*margin*0.88);',
'  } else { col=env(rd); }',
'  col+=shaft;',
'  col*=1.05;',
'  col=(col*(2.51*col+0.03))/(col*(2.43*col+0.59)+0.14);',
'  col*=mix(0.88,1.0,smoothstep(1.45,0.25,length(uv*vec2(0.85,1.0))));',
'  col=pow(max(col,0.0),vec3(0.4545));',
'  col=mix(col,vec3(1.0,0.99,0.95),clamp(uBloom,0.0,1.0));',
'  gl_FragColor=vec4(col,1.0);}'
  ].join('\n');

  var UNIFORMS = ['uRes','uTime','uMouse','uAccent','uOpen','uZoom','uBloom',
                  'uSteps','uBook','uGates','uClouds'];

  function isTouch() {
    return matchMedia('(hover: none), (pointer: coarse)').matches;
  }
  function toRGB(hex) {
    return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
  }

  function mount(target, options) {
    if (target && typeof target === 'object' && !target.nodeType && !options) {
      options = target; target = null;                 // Heavens.mount({...})
    }
    var o = options || {};
    var canvas = typeof target === 'string' ? document.querySelector(target)
               : (target && target.nodeType ? target : null);
    var created = false;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;' +
        'display:block;pointer-events:none;z-index:' + (o.zIndex != null ? o.zIndex : -1);
      document.body.appendChild(canvas);
      created = true;
    }

    var gl = null, prog = null, uni = {}, raf = 0, dead = false, running = false;
    try {
      gl = canvas.getContext('webgl', { antialias: false, alpha: false,
                                        powerPreference: 'high-performance' })
        || canvas.getContext('experimental-webgl');
      if (!gl) throw new Error('WebGL unavailable');
      prog = gl.createProgram();
      [[gl.VERTEX_SHADER, VERT], [gl.FRAGMENT_SHADER, FRAG]].forEach(function (pair) {
        var sh = gl.createShader(pair[0]);
        gl.shaderSource(sh, pair[1]); gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
          throw new Error(gl.getShaderInfoLog(sh));
        gl.attachShader(prog, sh);
      });
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      var buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(prog, 'p');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      UNIFORMS.forEach(function (n) { uni[n] = gl.getUniformLocation(prog, n); });
    } catch (e) {
      // Graceful degradation: a CSS sky, so the page never looks broken.
      canvas.style.background =
        'linear-gradient(180deg,#7db6ec 0%,#b6dbf7 46%,#e9f5ff 100%)';
      return {
        failed: true, reason: String(e && e.message || e),
        setAccent: function () {}, setZoom: function () {},
        bookRect: function () { return { left: 0, top: 0, width: 0, height: 0 }; },
        pause: function () {}, resume: function () {},
        destroy: function () { if (created) canvas.remove(); },
      };
    }

    var touch = isTouch();
    var quality = o.quality || 'auto';
    /* Phones get a much smaller buffer. Raymarching is fill-rate bound, and
       for a soft-focus backdrop the upscale is invisible — this is the whole
       difference between 60fps and a slideshow on mobile. */
    var targetScale = quality === 'high' ? Math.min(devicePixelRatio || 1, 1.5)
                    : quality === 'low'  ? 0.45
                    : (touch ? 0.55 : Math.min(devicePixelRatio || 1, 1.35));
    var scale = targetScale;
    var steps = touch ? 52 : 80;

    var accent = toRGB(o.accent != null ? o.accent : 0xc2870b);
    var accentTarget = accent.slice();
    var mouse = { x: 0, y: 0 }, look = { x: 0, y: 0 };
    var open = 0, zoom = 0, bloom = 0;
    var t0 = (performance || Date).now();
    var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var parallax = o.parallax !== false && !touch;
    var showBook = o.book !== false, showGates = o.gates !== false,
        showClouds = o.clouds !== false;

    function resize() {
      var w = canvas.clientWidth || innerWidth, h = canvas.clientHeight || innerHeight;
      canvas.width = Math.max(1, Math.floor(w * scale));
      canvas.height = Math.max(1, Math.floor(h * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    var onResize = function () { resize(); };
    addEventListener('resize', onResize, { passive: true });

    var onMove = null;
    if (parallax) {
      onMove = function (e) {
        mouse.x = (e.clientX - innerWidth / 2) / (innerWidth / 2);
        mouse.y = (e.clientY - innerHeight / 2) / (innerHeight / 2);
      };
      addEventListener('pointermove', onMove, { passive: true });
    }

    // Adaptive quality: watch real frame times and back off if we're slow.
    var frames = 0, acc = 0, last = t0, adaptive = quality === 'auto';

    function loop(now) {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      var dt = now - last; last = now;

      if (adaptive) {
        acc += dt; frames++;
        if (frames >= 40) {
          var avg = acc / frames; acc = 0; frames = 0;
          if (avg > 24 && scale > 0.36) { scale = Math.max(0.36, scale * 0.82); resize(); }
          else if (avg < 12 && scale < targetScale) {
            scale = Math.min(targetScale, scale * 1.10); resize();
          }
        }
      }

      var time = reduced ? 0 : (now - t0) / 1000;
      look.x += (mouse.x - look.x) * 0.05;
      look.y += (mouse.y - look.y) * 0.05;
      for (var i = 0; i < 3; i++) accent[i] += (accentTarget[i] - accent[i]) * 0.06;
      open += (1 - open) * 0.018;

      gl.uniform2f(uni.uRes, canvas.width, canvas.height);
      gl.uniform1f(uni.uTime, time);
      gl.uniform2f(uni.uMouse, look.x, look.y);
      gl.uniform3f(uni.uAccent, accent[0], accent[1], accent[2]);
      gl.uniform1f(uni.uOpen, open);
      gl.uniform1f(uni.uZoom, zoom);
      gl.uniform1f(uni.uBloom, bloom);
      gl.uniform1f(uni.uSteps, steps);
      gl.uniform1f(uni.uBook, showBook ? 1 : 0);
      gl.uniform1f(uni.uGates, showGates ? 1 : 0);
      gl.uniform1f(uni.uClouds, showClouds ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    var api = {
      failed: false,
      canvas: canvas,
      resume: function () {
        if (dead || running) return;
        running = true; last = (performance || Date).now();
        raf = requestAnimationFrame(loop);
      },
      pause: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      },
      setAccent: function (hex) { accentTarget = toRGB(hex); },
      setZoom: function (z, b) { zoom = z || 0; bloom = b || 0; },
      setLayers: function (opts) {
        if (opts.book != null) showBook = !!opts.book;
        if (opts.gates != null) showGates = !!opts.gates;
        if (opts.clouds != null) showClouds = !!opts.clouds;
      },
      /* Codex rect in CSS pixels, from the same camera constants the shader
         uses — so hit-areas track the book exactly. */
      bookRect: function () {
        var W = canvas.clientWidth || innerWidth, H = canvas.clientHeight || innerHeight;
        var pull = Math.min(Math.max((1.10 - W / H) / 0.60, 0), 1);
        var camZ = 7.5 + (12.0 - 7.5) * pull;
        var s = 1.35 * camZ / 2.6;
        var hw = 1.20 / s * H, hh = 1.56 / s * H;
        return { left: W / 2 - hw, top: H / 2 - hh, width: hw * 2, height: hh * 2 };
      },
      destroy: function () {
        dead = true; api.pause();
        removeEventListener('resize', onResize);
        if (onMove) removeEventListener('pointermove', onMove);
        var ext = gl.getExtension('WEBGL_lose_context');
        if (ext) ext.loseContext();
        if (created) canvas.remove();
      },
    };

    // Don't burn battery on a tab nobody is looking at.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) api.pause(); else api.resume();
    });
    // Or on a canvas that has scrolled out of view.
    if (!created && global.IntersectionObserver) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting) api.resume(); else api.pause();
      }, { threshold: 0 }).observe(canvas);
    }

    api.resume();
    return api;
  }

  var Heavens = { mount: mount, version: '1.0.0' };
  global.Heavens = Heavens;
  if (typeof module !== 'undefined' && module.exports) module.exports = Heavens;

  // <script src="heavens.js" data-heavens></script> → mount with no JS at all
  var self = document.currentScript;
  if (self && self.hasAttribute('data-heavens')) {
    var auto = {};
    ['accent', 'zIndex'].forEach(function (k) {
      var v = self.getAttribute('data-' + k.toLowerCase());
      if (v != null) auto[k] = k === 'accent' ? parseInt(v.replace('#', ''), 16) : Number(v);
    });
    ['book', 'gates', 'clouds', 'parallax'].forEach(function (k) {
      var v = self.getAttribute('data-' + k);
      if (v != null) auto[k] = v !== 'false';
    });
    var q = self.getAttribute('data-quality');
    if (q) auto.quality = q;
    if (document.body) mount(auto);
    else addEventListener('DOMContentLoaded', function () { mount(auto); });
  }
})(typeof window !== 'undefined' ? window : this);
