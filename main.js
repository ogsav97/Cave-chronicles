import * as THREE from "https://unpkg.com/three@0.158.0/build/three.module.js";
import { SimplexNoise } from "./lib/simplex-noise.js";

// ---------- Basic helpers
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a,b,t)=>a+(b-a)*t;
const rand = (a=1,b=0)=>Math.random()*(b-a)+a;

// ---------- Game State
const state = {
  resources: { wood:0, stone:0 },
  hunger: 100, thirst: 100,
  day: 1,
  buildGhost: null,
  buildType: null,
  isPlacing: false,
};

// ---------- UI Hooks
const elWood = document.getElementById("wood");
const elStone = document.getElementById("stone");
const elHunger = document.getElementById("hunger");
const elThirst = document.getElementById("thirst");
const elDay = document.getElementById("day");
const promptText = document.getElementById("prompt-text");
const btnBuild = document.getElementById("btn-build");
const btnCraft = document.getElementById("btn-inventory");
const btnHelp = document.getElementById("btn-help");
const craftingPanel = document.getElementById("crafting");
const helpPanel = document.getElementById("help");
const closeCraft = document.getElementById("close-crafting");
const closeHelp = document.getElementById("close-help");
const actionBtn = document.getElementById("action-btn");
const placeBtn = document.getElementById("place-btn");
const cancelBtn = document.getElementById("cancel-btn");

function refreshHUD(){
  elWood.textContent = state.resources.wood|0;
  elStone.textContent = state.resources.stone|0;
  elHunger.textContent = state.hunger|0;
  elThirst.textContent = state.thirst|0;
  elDay.textContent = state.day|0;
}

function showPanel(p){p.classList.remove("hidden")}
function hidePanel(p){p.classList.add("hidden")}

// ---------- Mobile: simple virtual joystick & look pad
const leftPad = document.getElementById("joystick-left");
const lookPad = document.getElementById("look-pad");
let joyActive=false, joyStart={x:0,y:0}, joy={x:0,y:0};
leftPad.addEventListener("touchstart",e=>{joyActive=true; const t=e.touches[0]; joyStart={x:t.clientX,y:t.clientY};},{passive:true});
leftPad.addEventListener("touchmove",e=>{
  if(!joyActive) return;
  const t=e.touches[0];
  const dx=t.clientX-joyStart.x, dy=t.clientY-joyStart.y;
  const R=60;
  const mag=Math.hypot(dx,dy);
  const nx = clamp(dx / R, -1, 1);
  const ny = clamp(dy / R, -1, 1);
  joy={x:nx,y:ny};
},{passive:true});
leftPad.addEventListener("touchend",()=>{joyActive=false; joy={x:0,y:0};},{passive:true});

let lookActive=false, lastLook={x:0,y:0};
let lookDelta={x:0,y:0};
lookPad.addEventListener("touchstart",e=>{lookActive=true; const t=e.touches[0]; lastLook={x:t.clientX,y:t.clientY};},{passive:true});
lookPad.addEventListener("touchmove",e=>{
  if(!lookActive) return;
  const t=e.touches[0];
  lookDelta.x += (t.clientX - lastLook.x)*0.3;
  lookDelta.y += (t.clientY - lastLook.y)*0.3;
  lastLook={x:t.clientX,y:t.clientY};
},{passive:true});
lookPad.addEventListener("touchend",()=>{lookActive=false;},{passive:true});

// ---------- Keyboard
const keys = new Set();
window.addEventListener("keydown", e=>{ keys.add(e.key.toLowerCase()); if(["w","a","s","d","e"].includes(e.key.toLowerCase())) e.preventDefault(); });
window.addEventListener("keyup", e=>{ keys.delete(e.key.toLowerCase()); });

// ---------- Three.js Setup
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x88ccee);
const renderer = new THREE.WebGLRenderer({antialias:true, powerPreference:"high-performance"});
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
document.getElementById("game-root").appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(60, innerWidth/innerHeight, 0.1, 1000);
camera.position.set(0, 3, 6);

// Lighting
const hemi = new THREE.HemisphereLight(0xaaccff, 0x223344, 0.8);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.castShadow = true;
sun.position.set(30, 60, -10);
sun.shadow.mapSize.set(2048, 2048);
scene.add(sun);

// ---------- World Generation
const simplex = new SimplexNoise(12345);
const WORLD_SIZE = 600;
const RES = 180; // terrain resolution
const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, RES, RES);
geo.rotateX(-Math.PI/2);

// height map
const heights = [];
for(let i=0;i<geo.attributes.position.count;i++){
  const x = geo.attributes.position.getX(i);
  const z = geo.attributes.position.getZ(i);
  const nx = x*0.0025, nz = z*0.0025;
  const e = simplex.noise2D(nx, nz)*8 + simplex.noise2D(nx*2.5, nz*2.5)*2;
  const h = e;
  heights.push(h);
  geo.attributes.position.setY(i, h);
}
geo.computeVertexNormals();
const mat = new THREE.MeshStandardMaterial({
  color: 0x7fb06f,
  roughness: 0.9,
  metalness: 0.0,
  flatShading: true
});
const ground = new THREE.Mesh(geo, mat);
ground.receiveShadow = true;
scene.add(ground);

// Water
const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
waterGeo.rotateX(-Math.PI/2);
const waterMat = new THREE.MeshStandardMaterial({color:0x2a6ca8, transparent:true, opacity:0.6});
const water = new THREE.Mesh(waterGeo, waterMat);
water.position.y = 0.5;
scene.add(water);

// ---------- Flora & Rocks
const trees = [];
const rocks = [];

function makeTree(){
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1,0.2,1.6,6), new THREE.MeshStandardMaterial({color:0x6b4e2e, roughness:1, flatShading:true}));
  trunk.castShadow = true;
  const crown = new THREE.Mesh(new THREE.ConeGeometry(0.9,1.4,8), new THREE.MeshStandardMaterial({color:0x2b6d2f, roughness:1, flatShading:true}));
  crown.position.y = 1.3;
  trunk.add(crown);
  return trunk;
}
function makeRock(){
  const r = new THREE.Mesh(new THREE.IcosahedronGeometry(0.6,0), new THREE.MeshStandardMaterial({color:0x767b85, roughness:1, flatShading:true}));
  r.castShadow = true;
  return r;
}

function sampleHeight(x,z){
  // convert world (x,z) to grid
  const half = WORLD_SIZE/2;
  const u = (x+half)/WORLD_SIZE;
  const v = (z+half)/WORLD_SIZE;
  const ix = Math.floor(u*RES);
  const iz = Math.floor(v*RES);
  const ix2 = clamp(ix, 0, RES);
  const iz2 = clamp(iz, 0, RES);
  const idx = iz2*(RES+1)+ix2;
  return heights[idx] || 0;
}

function scatter(){
  const Ntrees = 300, Nrocks=200;
  for(let i=0;i<Ntrees;i++){
    const x = rand(-WORLD_SIZE*0.45, WORLD_SIZE*0.45);
    const z = rand(-WORLD_SIZE*0.45, WORLD_SIZE*0.45);
    const y = sampleHeight(x,z);
    if(y < 1.0 || Math.random()<0.25) continue; // fewer trees near water
    const t = makeTree();
    t.position.set(x, y, z);
    t.scale.setScalar(rand(0.9,1.4));
    scene.add(t);
    trees.push(t);
  }
  for(let i=0;i<Nrocks;i++){
    const x = rand(-WORLD_SIZE*0.45, WORLD_SIZE*0.45);
    const z = rand(-WORLD_SIZE*0.45, WORLD_SIZE*0.45);
    const y = sampleHeight(x,z);
    const r = makeRock();
    r.position.set(x, y, z);
    r.scale.setScalar(rand(0.6,1.4));
    scene.add(r);
    rocks.push(r);
  }
}
scatter();

// ---------- Player
const player = new THREE.Object3D();
player.position.set(0, sampleHeight(0,0)+1.0, 0);
scene.add(player);

const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.9, 4, 8), new THREE.MeshStandardMaterial({color:0xcaa47d, flatShading:true}));
body.castShadow = true;
player.add(body);

// Camera follow
let camYaw = 0, camPitch = -0.3;
const camOffset = new THREE.Vector3(0, 1.8, 4.0);

// ---------- Interaction
let prompt=null;
function updatePrompt(txt=""){ promptText.textContent = txt; }

function nearestResource(list, maxDist=2.3){
  let best=null, bestD=maxDist;
  for(const m of list){
    const d = player.position.distanceTo(m.position);
    if(d < bestD){ best = m; bestD = d; }
  }
  return best;
}

function gather(target, type){
  // remove and add resources
  if(!target) return;
  scene.remove(target);
  if(type==="wood") state.resources.wood += Math.floor(rand(2,4));
  if(type==="stone") state.resources.stone += Math.floor(rand(1,3));
  refreshHUD();
}

// ---------- Building
function buildGhost(type, pos){
  if(state.buildGhost) scene.remove(state.buildGhost);
  state.buildType = type;
  let mesh;
  if(type==="campfire"){
    const base = new THREE.Group();
    const stonesMat = new THREE.MeshStandardMaterial({color:0x777777, flatShading:true});
    for(let i=0;i<6;i++){
      const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2,0), stonesMat);
      s.position.set(Math.cos(i)*0.5, 0, Math.sin(i)*0.5);
      base.add(s);
    }
    const logMat = new THREE.MeshStandardMaterial({color:0x6b4e2e, flatShading:true});
    for(let i=0;i<3;i++){
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.06,0.06,0.8,6), logMat);
      l.rotation.z = Math.PI/2;
      l.position.y = 0.1;
      l.rotation.y = i*Math.PI/3;
      base.add(l);
    }
    mesh = base;
  } else if(type==="hut"){
    const hut = new THREE.Group();
    const wall = new THREE.Mesh(new THREE.CylinderGeometry(1.2,1.2,1.5,8,1,true), new THREE.MeshStandardMaterial({color:0x8b5a2b, flatShading:true, side:THREE.DoubleSide}));
    wall.position.y = 0.75;
    hut.add(wall);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.4,1.1,8), new THREE.MeshStandardMaterial({color:0x6b3a1e, flatShading:true}));
    roof.position.y = 1.6;
    hut.add(roof);
    mesh = hut;
  } else if(type==="spear"){
    const spear = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03,0.03,1.6,6), new THREE.MeshStandardMaterial({color:0x8b5a2b, flatShading:true}));
    shaft.position.y = 0.8;
    spear.add(shaft);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.09,0.24,6), new THREE.MeshStandardMaterial({color:0xaaaaaa, flatShading:true}));
    tip.position.y = 1.6;
    spear.add(tip);
    mesh = spear;
  }
  mesh.traverse(o=>{ if(o.isMesh){ o.castShadow = true; o.receiveShadow = true; }});
  mesh.position.copy(pos);
  mesh.userData.isGhost = true;
  state.buildGhost = mesh;
  scene.add(mesh);
}

function confirmPlacement(){
  const g = state.buildGhost; if(!g) return;
  // Cost check
  const type = state.buildType;
  const cost = { campfire:{wood:5, stone:0}, hut:{wood:20, stone:10}, spear:{wood:3, stone:2} }[type];
  if(state.resources.wood < cost.wood || state.resources.stone < cost.stone){
    updatePrompt("Not enough resources");
    return;
  }
  state.resources.wood -= cost.wood;
  state.resources.stone -= cost.stone;
  g.userData.isGhost = false;
  state.buildGhost = null;
  state.buildType = null;
  state.isPlacing = false;
  placeBtn.classList.add("hidden");
  cancelBtn.classList.add("hidden");
  refreshHUD();
  updatePrompt("");
}

function cancelPlacement(){
  if(state.buildGhost){ scene.remove(state.buildGhost); state.buildGhost=null; }
  state.isPlacing=false; state.buildType=null;
  placeBtn.classList.add("hidden"); cancelBtn.classList.add("hidden");
  updatePrompt("");
}

// ---------- Ground picking
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
function pickGround(screenX, screenY){
  ndc.set((screenX/innerWidth)*2-1, -(screenY/innerHeight)*2+1);
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(ground);
  return hits[0] || null;
}

// ---------- Buttons
btnBuild.addEventListener("click", ()=>{
  showPanel(craftingPanel);
});
btnCraft.addEventListener("click", ()=>{
  showPanel(craftingPanel);
});
btnHelp.addEventListener("click", ()=>showPanel(helpPanel));
closeCraft.addEventListener("click", ()=>hidePanel(craftingPanel));
closeHelp.addEventListener("click", ()=>hidePanel(helpPanel));
document.querySelectorAll(".recipe").forEach(b=>{
  b.addEventListener("click", ()=>{
    hidePanel(craftingPanel);
    const type = b.dataset.item;
    state.isPlacing = true;
    state.buildType = type;
    placeBtn.classList.remove("hidden");
    cancelBtn.classList.remove("hidden");
    updatePrompt("Tap/click ground to position, then Place.");
  });
});

placeBtn.addEventListener("click", confirmPlacement);
cancelBtn.addEventListener("click", cancelPlacement);
actionBtn.addEventListener("click", ()=>interact());

// ---------- Mouse look (desktop)
let dragging=false, last={x:0,y:0};
window.addEventListener("mousedown", (e)=>{ dragging=true; last={x:e.clientX,y:e.clientY}; });
window.addEventListener("mouseup", ()=>{ dragging=false; });
window.addEventListener("mousemove", (e)=>{
  if(!dragging) return;
  lookDelta.x += (e.clientX-last.x)*0.2;
  lookDelta.y += (e.clientY-last.y)*0.2;
  last={x:e.clientX,y:e.clientY};
});

// ---------- Interact key
window.addEventListener("keydown", (e)=>{
  if(e.key.toLowerCase()==="e"){ interact(); }
});

function interact(){
  // gather priority: tree then rock
  const t = nearestResource(trees, 2.2);
  if(t){ gather(t, "wood"); trees.splice(trees.indexOf(t),1); updatePrompt("Gathered wood"); return; }
  const r = nearestResource(rocks, 2.0);
  if(r){ gather(r, "stone"); rocks.splice(rocks.indexOf(r),1); updatePrompt("Gathered stone"); return; }
}

// ---------- Resize
window.addEventListener("resize", ()=>{
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------- Game Loop
let tClock = new THREE.Clock();
let timeOfDay = 0; // 0..1
function tick(){
  const dt = Math.min(0.033, tClock.getDelta());
  // hunger & thirst
  state.hunger = clamp(state.hunger - dt*0.8, 0, 100);
  state.thirst = clamp(state.thirst - dt*1.2, 0, 100);
  if(state.hunger===0 || state.thirst===0){
    // slow movement when starving
  }
  timeOfDay += dt*0.02; // day cycle ~50 sec
  if(timeOfDay>=1){ timeOfDay=0; state.day++; refreshHUD(); }
  const sunAng = timeOfDay*Math.PI*2;
  sun.position.set(Math.cos(sunAng)*50, Math.sin(sunAng)*60, Math.sin(sunAng)*-20);
  sun.intensity = THREE.MathUtils.mapLinear(Math.sin(sunAng), -1,1, 0.1, 1.2);
  hemi.intensity = THREE.MathUtils.mapLinear(Math.sin(sunAng), -1,1, 0.15, 0.9);
  const dayColor = new THREE.Color(0x88ccee), dusk = new THREE.Color(0x223048);
  scene.background.lerpColors(dusk, dayColor, clamp(Math.sin(sunAng)*0.5+0.5,0,1));
  water.material.opacity = lerp(0.35,0.7, clamp(Math.sin(sunAng)*0.5+0.5,0,1));

  // Camera orbit deltas
  camYaw -= lookDelta.x*0.01; camPitch -= lookDelta.y*0.01; lookDelta.x=0; lookDelta.y=0;
  camPitch = clamp(camPitch, -1.2, 0.3);
  const cx = Math.sin(camYaw)*camOffset.z;
  const cz = Math.cos(camYaw)*camOffset.z;
  camera.position.set(player.position.x + cx, player.position.y + camOffset.y, player.position.z + cz);
  camera.lookAt(player.position.x, player.position.y+0.8, player.position.z);

  // Movement
  let mx=0,my=0;
  if(keys.has("w")) my += 1;
  if(keys.has("s")) my -= 1;
  if(keys.has("a")) mx -= 1;
  if(keys.has("d")) mx += 1;
  // mobile joystick
  mx += joy.x; my += -joy.y;
  const len = Math.hypot(mx,my) || 1;
  mx/=len; my/=len;
  const speed = (state.hunger<10||state.thirst<10) ? 2.0 : 3.2;
  const forward = new THREE.Vector3(Math.sin(camYaw), 0, Math.cos(camYaw));
  const right = new THREE.Vector3(forward.z, 0, -forward.x);
  player.position.addScaledVector(forward, my*speed*dt);
  player.position.addScaledVector(right, mx*speed*dt);

  // keep on ground
  const y = sampleHeight(player.position.x, player.position.z)+1.0;
  player.position.y = lerp(player.position.y, y, 0.4);

  // Build placement preview
  if(state.isPlacing && state.buildType){
    updatePrompt("Tap/click ground to position, then Place.");
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}
refreshHUD();
tick();

// ---------- Ground tap to position build ghost
window.addEventListener("pointerdown", (e)=>{
  if(!state.isPlacing) return;
  const hit = pickGround(e.clientX, e.clientY);
  if(hit){
    const pos = hit.point.clone();
    pos.y = sampleHeight(pos.x,pos.z)+0.02;
    buildGhost(state.buildType, pos);
  }
});

// ---------- Prevent gestures scrolling on mobile
document.addEventListener('gesturestart', e=>e.preventDefault());
document.addEventListener('gesturechange', e=>e.preventDefault());
document.addEventListener('gestureend', e=>e.preventDefault());
