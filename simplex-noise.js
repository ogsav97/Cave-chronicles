// Minimal SimplexNoise (public domain) by Jonas Wagner, tweaked for ES module
export class SimplexNoise {
  constructor(seed=0){
    this.p = new Uint8Array(256);
    for (let i=0;i<256;i++) this.p[i]=i;
    let n, q;
    let r = mulberry32(seed|0);
    for (let i=255;i>0;i--){
      n = Math.floor(r()* (i+1));
      q = this.p[i]; this.p[i]=this.p[n]; this.p[n]=q;
    }
    this.perm = new Uint8Array(512);
    this.permMod12 = new Uint8Array(512);
    for (let i=0;i<512;i++){
      this.perm[i] = this.p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }
  noise2D(xin, yin){
    const grad3 = new Float32Array([
      1,1, -1,1, 1,-1, -1,-1,
      1,0, -1,0, 1,0, -1,0,
      0,1, 0,-1, 0,1, 0,-1
    ]);
    const F2 = 0.5*(Math.sqrt(3.0)-1.0);
    const G2 = (3.0-Math.sqrt(3.0))/6.0;
    let n0=0, n1=0, n2=0;
    const s = (xin+yin)*F2;
    const i = Math.floor(xin+s);
    const j = Math.floor(yin+s);
    const t = (i+j)*G2;
    const X0 = i-t, Y0 = j-t;
    const x0 = xin - X0, y0 = yin - Y0;
    let i1, j1;
    if(x0>y0){ i1=1; j1=0; } else { i1=0; j1=1; }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1.0 + 2.0*G2;
    const y2 = y0 - 1.0 + 2.0*G2;
    const ii = i & 255, jj = j & 255;
    const gi0 = this.permMod12[ii+this.perm[jj]]*2;
    const gi1 = this.permMod12[ii+i1+this.perm[jj+j1]]*2;
    const gi2 = this.permMod12[ii+1+this.perm[jj+1]]*2;
    let t0 = 0.5 - x0*x0 - y0*y0;
    if(t0>=0){ t0 *= t0; n0 = t0 * t0 * (grad3[gi0]*x0 + grad3[gi0+1]*y0); }
    let t1 = 0.5 - x1*x1 - y1*y1;
    if(t1>=0){ t1 *= t1; n1 = t1 * t1 * (grad3[gi1]*x1 + grad3[gi1+1]*y1); }
    let t2 = 0.5 - x2*x2 - y2*y2;
    if(t2>=0){ t2 *= t2; n2 = t2 * t2 * (grad3[gi2]*x2 + grad3[gi2+1]*y2); }
    return 70.0*(n0+n1+n2);
  }
}

function mulberry32(a){ return function(){ let t=a+=0x6D2B79F5; t=Math.imul(t^t>>>15, t|1); t^=t+Math.imul(t^t>>>7, t|61); return ((t^t>>>14)>>>0)/4294967296; } }
