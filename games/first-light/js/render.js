// The three.js view of the valley: flat-shaded terrain banded like tuff, fairy chimneys, poplars and
// orchards, the potters' town, the red river, far volcanoes, a sky that warms from indigo to gold,
// your balloon and the others, crosses with light beams, and seeds drifting on the winds.
// Static scenery is built once; frame() only moves things. Draw calls stay around twenty.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getTerrain, EXTENT, N, CELL, STRATA, noise2, fbm, valleyInfo, VALLEYS, mountainProfile, ERCIYES_AZ, along } from './terrain.js';
import { K, windAt, predictMarker, dropTarget } from './engine.js';

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;
const tmpColor = new THREE.Color();
const srgb = (hex) => {
  tmpColor.set(hex);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
};
const srgbF = (r, g, b) => {
  tmpColor.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [tmpColor.r, tmpColor.g, tmpColor.b];
};
const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const h01 = (a, b) => {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Balloon envelope designs: [gore colours...], band colours by height, crown. */
export const DESIGNS = [
  { gores: ['#d8343c', '#f6c431'] },
  { gores: ['#22346e'], bands: [[0.55, 0.7, '#d8343c'], [0.7, 0.78, '#f4efe2']] },
  { gores: ['#2f8f5b', '#f6c431'], chevron: true },
  { gores: ['#ef7d2d', '#6a3f97'], crown: '#f4efe2' },
  { gores: ['#d8343c', '#ef7d2d', '#f6c431', '#3d9a52', '#2f6fb5', '#6a3f97'] },
  { gores: ['#f6c431'], bands: [[0.42, 0.62, '#d8343c']], crown: '#d8343c' },
  { gores: ['#1d8c8c', '#f4efe2'], chevron: true },
  { gores: ['#e77fa0', '#f7e8d0'], crown: '#e77fa0' },
];
export const PLAYER_DESIGN = { gores: ['#2849a8', '#ffc845'], bands: [[0.08, 0.16, '#f4efe2']], crown: '#ffc845' };

// Envelope profile: radius and height in metres from the throat up.
const PROFILE = [
  [2.2, 0], [4.4, 2.6], [7.0, 6.4], [8.7, 10.4], [9.3, 13.8], [9.0, 16.8], [7.7, 19.8], [5.4, 22.4], [2.6, 23.8], [0, 24.3],
];
const BASKET_Y = -5.4;

function envelopeGeometry(design) {
  const pts = PROFILE.map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 16).toNonIndexed();
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const top = PROFILE.at(-1)[1];
  const goreCols = design.gores.map(srgb);
  const bandCols = (design.bands ?? []).map(([a, b, c]) => [a, b, srgb(c)]);
  const crown = design.crown ? srgb(design.crown) : null;
  for (let t = 0; t < pos.count; t += 3) {
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (let k = 0; k < 3; k++) {
      cx += pos.getX(t + k) / 3;
      cy += pos.getY(t + k) / 3;
      cz += pos.getZ(t + k) / 3;
    }
    const gore = Math.floor(((Math.atan2(cz, cx) + TAU) % TAU) / (TAU / 16));
    const hy = cy / top;
    const band = Math.floor(hy * 9);
    let c = goreCols[(design.chevron ? gore + band : gore) % goreCols.length];
    for (const [a, b, bc] of bandCols) if (hy >= a && hy < b) c = bc;
    if (crown && hy > 0.9) c = crown;
    for (let k = 0; k < 3; k++) col.set(c, (t + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function basketGeometry() {
  const basket = new THREE.BoxGeometry(1.7, 1.15, 1.7);
  basket.translate(0, BASKET_Y + 0.55, 0);
  const frame = new THREE.BoxGeometry(1.1, 0.5, 1.1);
  frame.translate(0, BASKET_Y + 2.1, 0);
  const parts = [basket.toNonIndexed(), frame.toNonIndexed()];
  const cols = [srgb('#8b5a33'), srgb('#3a3036')];
  parts.forEach((p, i) => {
    const a = new Float32Array(p.attributes.position.count * 3);
    for (let k = 0; k < a.length; k += 3) a.set(cols[i], k);
    p.setAttribute('color', new THREE.BufferAttribute(a, 3));
    p.deleteAttribute('uv');
  });
  return mergeGeometries(parts);
}

function cablesGeometry() {
  const pts = [];
  for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    pts.push(sx * 0.8, BASKET_Y + 1.15, sz * 0.8, sx * 1.6, 0.2, sz * 1.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function paint(geo, fn) {
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    const c = fn((pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3, i);
    col.set(c, i * 3);
    col.set(c, i * 3 + 3);
    col.set(c, i * 3 + 6);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

function solid(geo, hex) {
  const c = srgb(hex);
  return paint(geo.index ? geo.toNonIndexed() : geo, () => c);
}

export function createRenderer(canvas, { lowPower = false } = {}) {
  const T = getTerrain();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: false });
  const maxRatio = lowPower ? 1.5 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxRatio));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 1, 15000);
  scene.fog = new THREE.Fog(0x8a7fb8, 700, 4300);

  // ---------------------------------------------------------------- light
  const hemi = new THREE.HemisphereLight(0x8b86c9, 0x3b2f4a, 2.2);
  const sun = new THREE.DirectionalLight(0xffb36b, 0);
  scene.add(hemi, sun, sun.target);

  // ---------------------------------------------------------------- sky
  const skyUniforms = {
    zenith: { value: new THREE.Color('#1f2350') },
    horizonCool: { value: new THREE.Color('#8a7fb8') },
    horizonWarm: { value: new THREE.Color('#f2a27a') },
    below: { value: new THREE.Color('#6b6090') },
    sunCol: { value: new THREE.Color('#ffcf7a') },
    sunDir: { value: new THREE.Vector3(0, 0, -1) },
    glow: { value: 0.5 },
    disc: { value: 1 },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(12000, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        uniform vec3 zenith, horizonCool, horizonWarm, below, sunCol, sunDir; uniform float glow, disc;
        varying vec3 vDir;
        void main(){
          vec3 d = normalize(vDir);
          vec2 sxz = normalize(sunDir.xz + vec2(1e-5));
          float toward = pow(max(dot(normalize(d.xz + vec2(1e-5)), sxz), 0.0), 2.5);
          vec3 hor = mix(horizonCool, horizonWarm, toward);
          vec3 col = d.y >= 0.0 ? mix(hor, zenith, pow(clamp(d.y * 1.6, 0.0, 1.0), 0.6)) : mix(hor, below, clamp(-d.y * 8.0, 0.0, 1.0));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * glow * (pow(s, 8.0) * 0.45 + pow(s, 90.0) * 0.8 + pow(s, 900.0) * 0.6);
          col = mix(col, vec3(1.0, 0.96, 0.84), smoothstep(0.99905, 0.99935, s) * disc);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }),
  );
  sky.renderOrder = -2;
  sky.frustumCulled = false;
  scene.add(sky);

  // Far volcanoes on a ring around the camera: Erciyes (snow) beside the sunrise, Hasan to the west.
  const mountains = buildMountains();
  scene.add(mountains);

  // ---------------------------------------------------------------- ground
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, map: grainTexture() });
  const terrain = new THREE.Mesh(buildTerrainGeometry(T), terrainMat);
  scene.add(terrain);
  scene.add(new THREE.Mesh(buildSkirt(T), terrainMat));

  const riverMat = new THREE.MeshLambertMaterial({ color: '#b46a52', emissive: new THREE.Color('#6b4f6a'), emissiveIntensity: 0.6, side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(buildRiver(T), riverMat));

  const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  scene.add(buildChimneys(T, rockMat));
  scene.add(buildTrees(T, rockMat));
  scene.add(buildTown(T, rockMat));
  scene.add(buildLandmarks(T, rockMat));

  // ---------------------------------------------------------------- balloons
  const envGeos = DESIGNS.map(envelopeGeometry);
  const basketGeo = basketGeometry();
  const balloonMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const others = envGeos.map((g) => {
    const m = new THREE.InstancedMesh(g, balloonMat, 12);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  const baskets = new THREE.InstancedMesh(basketGeo, balloonMat, 100);
  baskets.count = 0;
  baskets.frustumCulled = false;
  scene.add(baskets);

  const playerMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color('#ff8a3a'), emissiveIntensity: 0 });
  const player = new THREE.Group();
  player.add(new THREE.Mesh(envelopeGeometry(PLAYER_DESIGN), playerMat));
  player.add(new THREE.Mesh(basketGeometry(), balloonMat));
  player.add(new THREE.LineSegments(cablesGeometry(), new THREE.LineBasicMaterial({ color: '#2c2430' })));
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.6, 8).translate(0, 1.3, 0),
    new THREE.MeshBasicMaterial({ color: '#ffd27a', transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }),
  );
  flame.position.y = BASKET_Y + 2.4;
  player.add(flame);
  scene.add(player);

  // Shadow blob under the balloon, a small grid laid on the ground each frame.
  const shadowGeo = new THREE.PlaneGeometry(1, 1, 10, 10).rotateX(-Math.PI / 2);
  const shadow = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({ color: '#1b1430', transparent: true, opacity: 0.28, depthWrite: false, alphaMap: radialTexture(), polygonOffset: true, polygonOffsetFactor: -2 }));
  scene.add(shadow);

  // Drop sight: a dashed line to where a marker would land, and a ring there.
  const sightGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, -1, 0)]);
  const sightLine = new THREE.Line(sightGeo, new THREE.LineDashedMaterial({ color: '#ffffff', dashSize: 3, gapSize: 2.5, transparent: true, opacity: 0.85, fog: false }));
  const sightRing = new THREE.Mesh(new THREE.RingGeometry(2.4, 3.6, 28).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, fog: false }));
  sightLine.visible = sightRing.visible = false;
  scene.add(sightLine, sightRing);

  // Seeds on the wind around the camera.
  const SEEDS = lowPower ? 220 : 380;
  const seedPos = new Float32Array(SEEDS * 3);
  const seedGeo = new THREE.BufferGeometry();
  seedGeo.setAttribute('position', new THREE.BufferAttribute(seedPos, 3));
  const seeds = new THREE.Points(seedGeo, new THREE.PointsMaterial({ color: '#fff1d0', size: 1.5, sizeAttenuation: true, map: radialTexture(), transparent: true, opacity: 0.75, depthWrite: false, fog: true }));
  seeds.frustumCulled = false;
  scene.add(seeds);
  let seedsReady = false;

  // ---------------------------------------------------------------- per flight
  let crossGroup = null;
  let markerObjs = new Map();
  let flightRef = null;
  function setFlight(flight) {
    flightRef = flight;
    if (crossGroup) {
      scene.remove(crossGroup);
      crossGroup.traverse((o) => o.geometry?.dispose());
    }
    crossGroup = new THREE.Group();
    crossGroup.visible = flight.mode !== 'demo';
    for (const c of flight.crosses) crossGroup.add(buildCross(T, c));
    scene.add(crossGroup);
    for (const o of markerObjs.values()) scene.remove(o);
    markerObjs = new Map();
    seedsReady = false;
  }

  // ---------------------------------------------------------------- camera rig
  const cam = { yaw: 0, pitch: 0.2, basePitch: 0.2, dist: 72, userT: -99, pos: new THREE.Vector3(), look: new THREE.Vector3(), aimAt: new THREE.Vector3(), aimK: 0, init: false };
  const v3 = new THREE.Vector3();
  const sunDir = new THREE.Vector3();

  const shift = [0, 0];
  // Drop the pixel ratio if frames run slow (older phones), once, after a settling period.
  const perf = { t: 0, n: 0, slow: 0, done: false };
  function adapt(dt) {
    if (perf.done || dt <= 0 || dt > 0.25) return;
    perf.t += dt;
    perf.n++;
    if (perf.t < 3) return;
    const avg = perf.t / perf.n;
    perf.t = perf.n = 0;
    if (avg > 1 / 40) perf.slow++;
    else perf.slow = Math.max(0, perf.slow - 1);
    if (perf.slow >= 2 && renderer.getPixelRatio() > 1) {
      renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - 0.5));
      perf.slow = 0;
    }
    if (renderer.getPixelRatio() <= 1) perf.done = true;
  }
  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    if (canvas.width !== Math.floor(w * renderer.getPixelRatio()) || canvas.height !== Math.floor(h * renderer.getPixelRatio())) renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Keep at least ~62° across on a portrait phone.
    const hfov = 62 * DEG;
    const vfovFromH = 2 * Math.atan(Math.tan(hfov / 2) / camera.aspect);
    camera.fov = Math.min(78, Math.max(50, vfovFromH / DEG));
    // Shift the picture (the title card covers part of the screen).
    if (shift[0] || shift[1]) camera.setViewOffset(w, h, -shift[0] * w, -shift[1] * h, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  /**
   * Draw one frame. view = { flight, sky, pos: {x,y,z} (interpolated), now (s, real time),
   * light (0..1 sunrise ramp), demo }
   */
  function frame(view) {
    resize();
    adapt(view.dt ?? 1 / 60);
    const { flight, pos } = view;
    const b = flight.b;
    const dt = Math.min(0.1, view.dt ?? 1 / 60);

    // Light and colour: pre-dawn lavender to gold. `dawn` grows with the sun; `lit` is the ramp
    // that starts at first light.
    const lit = view.light;
    const sunElev = view.sunElev ?? flight.sun.elev;
    const dawn = clamp01((sunElev + 1) / 10);
    const elev = Math.max(sunElev, -0.5) * DEG;
    sunDir.set(Math.sin(K.sunAz) * Math.cos(elev), Math.sin(elev), -Math.cos(K.sunAz) * Math.cos(elev));
    skyUniforms.sunDir.value.copy(sunDir);
    mixColor(skyUniforms.zenith.value, '#1f2350', '#4867a6', smooth(0, 1, lit * 0.6 + dawn * 0.4));
    mixColor(skyUniforms.horizonCool.value, '#8a7fb8', '#d4c3dc', lit);
    mixColor(skyUniforms.horizonWarm.value, '#f2a27a', '#ffd79a', lit);
    mixColor(skyUniforms.below.value, '#6b6090', '#c7a99a', lit);
    skyUniforms.glow.value = 0.45 + 0.9 * lit;
    mixColor(scene.fog.color, '#8a7fb8', '#e2c4b4', lit);
    mixColor(hemi.color, '#a29cf0', '#d9dcff', lit);
    mixColor(hemi.groundColor, '#4d3d6e', '#a07a62', lit);
    hemi.intensity = lerp(2.7, 1.55, lit);
    const se = Math.max(elev, 9 * DEG);
    sun.position.set(pos.x + Math.sin(K.sunAz) * Math.cos(se) * 500, pos.y + Math.sin(se) * 500, pos.z - Math.cos(K.sunAz) * Math.cos(se) * 500);
    sun.target.position.set(pos.x, pos.y, pos.z);
    mixColor(sun.color, '#ff9a4a', '#ffe0a8', smooth(0, 1, (sunElev - 1) / 8));
    sun.intensity = 3.4 * lit;
    mixColor(mountains.material.color, '#958cc4', '#f2c9c0', lit);
    mixColor(riverMat.emissive, '#4b3f6a', '#d9a08a', lit);

    // Your balloon.
    player.position.set(pos.x, pos.y - BASKET_Y, pos.z);
    const sway = view.reduced ? 0 : 0.03;
    player.rotation.z = Math.sin(view.now * 0.7) * sway;
    player.rotation.x = Math.cos(view.now * 0.53) * sway;
    const burnGlow = view.burnGlow ?? 0;
    playerMat.emissiveIntensity = burnGlow * lerp(0.32, 0.1, lit);
    flame.visible = b.burning;
    if (b.burning) flame.scale.set(1, 0.8 + (view.reduced ? 0.2 : 0.5 * Math.abs(Math.sin(view.now * 37) * Math.sin(view.now * 23))), 1);

    // Shadow blob.
    const g = T.groundAt(pos.x, pos.z);
    const alt = pos.y - g;
    const size = 16 + alt * 0.08;
    shadow.scale.set(1, 1, 1);
    const sp = shadowGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const u = (i % 11) / 10 - 0.5;
      const w = Math.floor(i / 11) / 10 - 0.5;
      const x = pos.x + u * size;
      const z = pos.z + w * size;
      sp.setXYZ(i, x, T.groundAt(x, z) + 0.6, z);
    }
    sp.needsUpdate = true;
    shadowGeo.computeBoundingSphere();
    shadow.material.opacity = 0.32 * (1 - smooth(60, 380, alt));

    // Drop sight.
    const target = dropTarget(flight);
    if (target && flight.phase === 'flying') {
      const p = predictMarker(flight);
      const arr = sightGeo.attributes.position;
      arr.setXYZ(0, pos.x, pos.y - 1, pos.z);
      arr.setXYZ(1, p.x, p.y + 0.3, p.z);
      arr.needsUpdate = true;
      sightGeo.computeBoundingSphere();
      sightLine.computeLineDistances();
      sightLine.material.color.set(target.color);
      sightRing.material.color.set(target.color);
      sightRing.position.set(p.x, p.y + 0.5, p.z);
      sightLine.visible = sightRing.visible = true;
      view.sightPoint = p;
    } else {
      sightLine.visible = sightRing.visible = false;
    }

    // Crosses: beams fade once their marker is down.
    if (crossGroup) {
      crossGroup.children.forEach((g2, i) => {
        const c = flight.crosses[i];
        const beam = g2.userData.beam;
        const near = smooth(40, 360, Math.hypot(c.x - camera.position.x, c.z - camera.position.z));
        beam.material.opacity = c.dropped ? Math.max(0, beam.material.opacity - dt) : (0.3 + 0.08 * Math.sin(view.now * 2 + i)) * (0.15 + 0.85 * near);
        beam.visible = beam.material.opacity > 0.01;
      });
    }

    // Markers falling or lying in the field.
    flight.markers.forEach((m, i) => {
      let o = markerObjs.get(i);
      if (!o) {
        o = buildMarker(flight.crosses[m.cross].color);
        markerObjs.set(i, o);
        scene.add(o);
      }
      o.position.set(m.x, m.y, m.z);
      o.userData.streamer.rotation.x = m.landed ? -Math.PI / 2 + 0.05 : 0;
      o.userData.streamer.position.y = m.landed ? 0.15 : 0;
    });

    // Other balloons.
    if (view.sky) drawOthers(view.sky);

    // Seeds on the wind.
    driftSeeds(flight, pos, dt);

    // Camera: chase from behind the direction of travel unless the player has looked around.
    const speed = Math.hypot(b.vx, b.vz);
    if (!cam.init) {
      cam.yaw = speed > 0.3 ? Math.atan2(b.vx, -b.vz) : view.initialYaw ?? 0;
      cam.init = true;
    }
    // In range of a cross, turn to face it and tilt down so you can see where the marker will fall.
    const aim = flight.phase === 'flying' && !view.demo ? dropTarget(flight) : null;
    const sunward = view.lookSun && view.now - cam.userT > 4;
    if (sunward || (view.now - cam.userT > 4 && (aim || (speed > 0.6 && !view.holdYaw)))) {
      const want = sunward ? K.sunAz - 0.1 : aim ? Math.atan2(aim.x - pos.x, -(aim.z - pos.z)) : Math.atan2(b.vx, -b.vz);
      let d = want - cam.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      cam.yaw += d * Math.min(1, dt * (sunward ? 2.2 : aim ? 1.1 : 0.35));
    }
    const pitchWant = sunward ? 0.36 : aim && view.now - cam.userT > 4 ? 0.5 : cam.basePitch;
    cam.pitch += (pitchWant - cam.pitch) * Math.min(1, dt * 1.5);
    const hx = Math.sin(cam.yaw);
    const hz = -Math.cos(cam.yaw);
    const dist = cam.dist;
    cam.pos.set(pos.x - hx * dist * Math.cos(cam.pitch), pos.y + 14 + dist * Math.sin(cam.pitch), pos.z - hz * dist * Math.cos(cam.pitch));
    const cg = T.groundAt(cam.pos.x, cam.pos.z);
    if (cam.pos.y < cg + 6) cam.pos.y = cg + 6;
    camera.position.copy(cam.pos);
    // Look past the balloon, so it sits low in the frame and the way ahead stays open; in range of a
    // cross, look at the cross instead (the balloon rises to the top of the frame).
    cam.aimK += ((aim ? 1 : 0) - cam.aimK) * Math.min(1, dt * 1.6);
    cam.look.set(pos.x + hx * 90, pos.y + 22 - 70 * Math.sin(cam.pitch), pos.z + hz * 90);
    if (aim) cam.aimAt.set(aim.x, aim.y + 4, aim.z);
    if (cam.aimK > 0.001) cam.look.lerp(cam.aimAt, cam.aimK * 0.8);
    camera.lookAt(cam.look);
    sky.position.copy(camera.position);
    mountains.position.set(camera.position.x, camera.position.y * 0.85 - 40, camera.position.z);

    renderer.render(scene, camera);
  }

  function drawOthers(skyState) {
    const counts = new Array(others.length).fill(0);
    let nb = 0;
    const m4 = new THREE.Matrix4();
    for (const k of skyState.balloons) {
      const mesh = others[k.design];
      const i = counts[k.design]++;
      if (i >= 12) continue;
      m4.makeTranslation(k.b.x, k.b.y - BASKET_Y, k.b.z);
      mesh.setMatrixAt(i, m4);
      baskets.setMatrixAt(nb++, m4);
    }
    others.forEach((m, i) => {
      m.count = Math.min(12, counts[i]);
      m.instanceMatrix.needsUpdate = true;
    });
    baskets.count = nb;
    baskets.instanceMatrix.needsUpdate = true;
  }

  function driftSeeds(flight, pos, dt) {
    const R = 150;
    const H = 110;
    const rnd = () => Math.random();
    if (!seedsReady) {
      for (let i = 0; i < SEEDS; i++) seedPos.set([pos.x + (rnd() - 0.5) * 2 * R, Math.max(T.groundAt(pos.x, pos.z) + 5, pos.y + (rnd() - 0.5) * 2 * H), pos.z + (rnd() - 0.5) * 2 * R], i * 3);
      seedsReady = true;
    }
    for (let i = 0; i < SEEDS; i++) {
      let x = seedPos[i * 3];
      let y = seedPos[i * 3 + 1];
      let z = seedPos[i * 3 + 2];
      const w = windAt(flight, x, y, z);
      x += w.x * dt * 1.15;
      z += w.z * dt * 1.15;
      y += Math.sin((x + z) * 0.05) * dt * 0.3;
      if (x - pos.x > R) x -= 2 * R;
      if (x - pos.x < -R) x += 2 * R;
      if (z - pos.z > R) z -= 2 * R;
      if (z - pos.z < -R) z += 2 * R;
      if (y - pos.y > H) y -= 2 * H;
      if (y - pos.y < -H) y += 2 * H;
      const gy = T.groundAt(x, z);
      if (y < gy + 3) y = gy + 3 + Math.random() * 40;
      seedPos[i * 3] = x;
      seedPos[i * 3 + 1] = y;
      seedPos[i * 3 + 2] = z;
    }
    seedGeo.attributes.position.needsUpdate = true;
  }

  /** Screen position (CSS px) of a world point, and whether it is in front of the camera. */
  function project(x, y, z) {
    v3.set(x, y, z).project(camera);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    return { x: (v3.x * 0.5 + 0.5) * w, y: (-v3.y * 0.5 + 0.5) * h, front: v3.z < 1, nx: v3.x, ny: v3.y };
  }

  /**
   * A photo from the basket: a 4:3 view from `from` towards `to` (your own balloon and the drop
   * sight left out), as a JPEG data URL. The next frame() puts the chase view back.
   */
  function photo(from, to, { fov = 46, width = 400 } = {}) {
    const keep = { pos: camera.position.clone(), quat: camera.quaternion.clone(), fov: camera.fov, aspect: camera.aspect, view: camera.view ? { ...camera.view } : null };
    const hidden = [player, sightLine, sightRing, shadow].filter((o) => o.visible);
    hidden.forEach((o) => (o.visible = false));
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // Crop a 4:3 window from the middle of the canvas.
    const ch = Math.min(h, (w * 3) / 4);
    const cw = (ch * 4) / 3;
    camera.clearViewOffset();
    camera.aspect = 4 / 3;
    camera.fov = fov;
    camera.position.set(from.x, from.y, from.z);
    camera.lookAt(to.x, to.y, to.z);
    camera.updateProjectionMatrix();
    renderer.setViewport((w - cw) / 2, (h - ch) / 2, cw, ch);
    sky.position.copy(camera.position);
    renderer.render(scene, camera);
    const pr = renderer.getPixelRatio();
    const c = document.createElement('canvas');
    c.width = width;
    c.height = Math.round((width * 3) / 4);
    c.getContext('2d').drawImage(renderer.domElement, ((w - cw) / 2) * pr, ((h - ch) / 2) * pr, cw * pr, ch * pr, 0, 0, c.width, c.height);
    const url = c.toDataURL('image/jpeg', 0.75);
    renderer.setViewport(0, 0, w, h);
    hidden.forEach((o) => (o.visible = true));
    camera.position.copy(keep.pos);
    camera.quaternion.copy(keep.quat);
    camera.fov = keep.fov;
    camera.aspect = keep.aspect;
    if (keep.view) camera.setViewOffset(keep.view.fullWidth, keep.view.fullHeight, keep.view.offsetX, keep.view.offsetY, keep.view.width, keep.view.height);
    camera.updateProjectionMatrix();
    return url;
  }

  return {
    renderer,
    scene,
    camera,
    cam,
    setFlight,
    frame,
    project,
    photo,
    resize,
    sunDirection: () => sunDir.clone(),
    /** Move the picture by a fraction of the screen (to make room for a title card). */
    setShift(sx, sy) {
      shift[0] = sx;
      shift[1] = sy;
    },
    /** Turn the view by `d` radians (from a drag or arrow keys). */
    look(dyaw, dpitch = 0, now = 0) {
      cam.yaw += dyaw;
      cam.pitch = Math.max(-0.1, Math.min(1.1, cam.pitch + dpitch));
      cam.basePitch = cam.pitch;
      cam.userT = now;
    },
    resetCamera() {
      cam.init = false;
      cam.userT = -99;
      cam.pitch = cam.basePitch = 0.2;
    },
    /** Title-screen framing: further back and higher. */
    setDistance(d) {
      cam.dist = d;
    },
    get flight() {
      return flightRef;
    },
  };
}

function mixColor(target, a, b, t) {
  target.set(a).lerp(new THREE.Color(b), clamp01(t));
}

function radialTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  return t;
}

// ---------------------------------------------------------------- terrain geometry

const FIELD_COLS = ['#9aa45e', '#d6b878', '#b88a62', '#a9b471', '#cdb48e', '#c79a52'].map(srgb);
const STEPPE_COLS = ['#cbb68e', '#bfb385', '#d1bf99'].map(srgb);
// Bands pulled halfway towards one apricot cream, so neighbours differ gently.
const soften = ([r, g, b]) => srgbF(0.5 * r + 0.5 * 0.94, 0.5 * g + 0.5 * 0.8, 0.5 * b + 0.5 * 0.66);
const STRATA_LIN = STRATA.map(soften);
const ROSE_LIN = [[0.9, 0.62, 0.64], [0.96, 0.82, 0.76], [0.86, 0.56, 0.6], [0.93, 0.72, 0.66]].map(([r, g, b]) => srgbF(r, g, b));
const RIVERBED = srgb('#7a4a3c');

/** Rock strata at a point: soft bands that follow the contours. */
function strataColor(x, z, h) {
  const rose = valleyInfo('rose', x, z).d < 260;
  const pal = rose ? ROSE_LIN : STRATA_LIN;
  const u = (h + 7 * noise2(x / 90, z / 90, 21)) / 11;
  const i = Math.floor(u);
  const f = u - i;
  const a = pal[((i % pal.length) + pal.length) % pal.length];
  const b = pal[(((i + 1) % pal.length) + pal.length) % pal.length];
  const k = f < 0.7 ? 0 : (f - 0.7) / 0.3;
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

function groundColor(x, z, h, ny) {
  const main = valleyInfo('main', x, z);
  if (main.d < 24) return RIVERBED;
  if (ny < 0.8) return null; // rock: coloured per vertex by strata
  // A valley floor, or the plateau above?
  let floor = false;
  for (const v of VALLEYS) {
    const info = valleyInfo(v.id, x, z);
    if (info.d < v.w + 18) {
      floor = true;
      break;
    }
  }
  if (floor && h < 100) {
    // Patchwork fields, slightly rotated cells.
    const u = x * 0.94 + z * 0.34;
    const w = -x * 0.34 + z * 0.94;
    const k = h01(Math.floor(u / 58), Math.floor(w / 40));
    return FIELD_COLS[Math.floor(k * FIELD_COLS.length)];
  }
  const s = fbm(x / 200, z / 200, 33, 2);
  return STEPPE_COLS[Math.min(2, Math.floor(s * 3.2))];
}

function buildTerrainGeometry(T) {
  const tris = (N - 1) * (N - 1) * 2;
  const pos = new Float32Array(tris * 9);
  const col = new Float32Array(tris * 9);
  let o = 0;
  const H = T.heights;
  const X = (i) => -EXTENT + i * CELL;
  const push = (ax, ay, az, bx, by, bz, cx, cy, cz) => {
    pos.set([ax, ay, az, bx, by, bz, cx, cy, cz], o);
    // Face normal's y for steepness.
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    const nx = uy * vz - uz * vy;
    const nyy = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const ny = nyy / Math.hypot(nx, nyy, nz);
    const mx = (ax + bx + cx) / 3;
    const mz = (az + bz + cz) / 3;
    const c = groundColor(mx, mz, (ay + by + cy) / 3, ny);
    const shade = 0.98 + 0.03 * h01(Math.floor(mx), Math.floor(mz * 7));
    const verts = [[ax, ay, az], [bx, by, bz], [cx, cy, cz]];
    for (let k = 0; k < 3; k++) {
      // Steep faces take the strata at each corner, so bands run along the contours.
      const cc = c ?? strataColor(verts[k][0], verts[k][2], verts[k][1]);
      col[o + k * 3] = cc[0] * shade;
      col[o + k * 3 + 1] = cc[1] * shade;
      col[o + k * 3 + 2] = cc[2] * shade;
    }
    o += 9;
  };
  for (let j = 0; j < N - 1; j++) {
    for (let i = 0; i < N - 1; i++) {
      const h00 = H[j * N + i];
      const h10 = H[j * N + i + 1];
      const h01_ = H[(j + 1) * N + i];
      const h11 = H[(j + 1) * N + i + 1];
      const x0 = X(i);
      const x1 = X(i + 1);
      const z0 = X(j);
      const z1 = X(j + 1);
      push(x0, h00, z0, x0, h01_, z1, x1, h10, z0);
      push(x1, h10, z0, x0, h01_, z1, x1, h11, z1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('uv', worldUV(pos));
  g.computeVertexNormals();
  return g;
}

/** UVs from world x and z, one texture tile every 36 m. */
function worldUV(pos) {
  const uv = new Float32Array((pos.length / 3) * 2);
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) {
    uv[j] = pos[i] / 36;
    uv[j + 1] = pos[i + 2] / 36;
  }
  return new THREE.BufferAttribute(uv, 2);
}

/** Value noise that repeats every `P` units (for tiling textures). */
function pnoise(x, y, P, seed) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const h = (a, b) => h01(((a % P) + P) % P + seed * 977, ((b % P) + P) % P);
  const a = h(i, j);
  const b = h(i + 1, j);
  const c = h(i, j + 1);
  const d = h(i + 1, j + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Fine grain for the ground: speckle and soft blotches, near white so it only tints. */
function grainTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      // Blotches from value noise that wraps at the tile's edge, plus speckle.
      const blot = 0.5 * pnoise((x / S) * 8, (y / S) * 8, 8, 5) + 0.5 * pnoise((x / S) * 24, (y / S) * 24, 24, 6);
      const speck = h01(x, y) < 0.08 ? -0.1 : h01(y, x) < 0.05 ? 0.05 : 0;
      const k = Math.max(0, Math.min(1, 0.86 + 0.12 * blot + speck));
      const i = (y * S + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = k * 255;
      img.data[i + 3] = 255;
    }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A ring of plateau from the grid's edge out to the far distance, so the world never ends. */
function buildSkirt(T) {
  const edge = [];
  const H = T.heights;
  const X = (i) => -EXTENT + i * CELL;
  for (let i = 0; i < N - 1; i++) edge.push([X(i), H[i], -EXTENT]);
  for (let j = 0; j < N - 1; j++) edge.push([EXTENT, H[j * N + N - 1], X(j)]);
  for (let i = N - 1; i > 0; i--) edge.push([X(i), H[(N - 1) * N + i], EXTENT]);
  for (let j = N - 1; j > 0; j--) edge.push([-EXTENT, H[j * N], X(j)]);
  const rings = [1, 1.5, 2.6, 5];
  const ringH = (h, r) => (r === 1 ? h : lerp(h, 110 + 20 * Math.sin(r * 3), Math.min(1, (r - 1) / 1.2)));
  const pos = [];
  const col = [];
  const steppe = srgb('#c3ad86');
  const P = (k, r) => {
    const [x, h, z] = edge[k % edge.length];
    return [x * r, ringH(h, r), z * r];
  };
  for (let ri = 0; ri < rings.length - 1; ri++) {
    for (let k = 0; k < edge.length; k += 2) {
      const a = P(k, rings[ri]);
      const b = P(k + 2, rings[ri]);
      const c = P(k, rings[ri + 1]);
      const d = P(k + 2, rings[ri + 1]);
      pos.push(...a, ...c, ...b, ...b, ...c, ...d);
      for (let q = 0; q < 6; q++) col.push(...steppe);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', worldUV(pos));
  g.computeVertexNormals();
  return g;
}

function buildRiver(T) {
  const pts = T.river;
  const pos = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const nx = dz / L;
    const nz = -dx / L;
    const w = 12;
    const ya = T.groundAt(a.x, a.z) + 1.4;
    const yb = T.groundAt(b.x, b.z) + 1.4;
    const A1 = [a.x + nx * w, ya, a.z + nz * w];
    const A2 = [a.x - nx * w, ya, a.z - nz * w];
    const B1 = [b.x + nx * w, yb, b.z + nz * w];
    const B2 = [b.x - nx * w, yb, b.z - nz * w];
    pos.push(...A1, ...B1, ...A2, ...A2, ...B1, ...B2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  // Faces may point down depending on winding; draw both sides.
  return g;
}

function buildMountains() {
  const R = 9000;
  const seg = 360;
  const pos = [];
  const col = [];
  const rock = srgb('#9c95c4');
  const rockFar = srgb('#b7aed3');
  const snow = srgb('#ffffff');
  for (let i = 0; i < seg; i++) {
    const a0 = (i / seg) * 360;
    const a1 = ((i + 1) / seg) * 360;
    const e0 = mountainProfile(a0);
    const e1 = mountainProfile(a1);
    const P = (a, e) => [Math.sin(a * DEG) * R, Math.tan(e * DEG) * R, -Math.cos(a * DEG) * R];
    const top0 = P(a0, e0);
    const top1 = P(a1, e1);
    const bot0 = P(a0, -4);
    const bot1 = P(a1, -4);
    pos.push(...bot0, ...top0, ...bot1, ...bot1, ...top0, ...top1);
    const nearE = Math.abs(((a0 - ERCIYES_AZ + 540) % 360) - 180) < 14;
    const cTop = (e) => (e > 2.2 || (nearE && e > 1.6) ? snow : nearE || e > 1.2 ? rock : rockFar);
    col.push(...rockFar, ...cTop(e0), ...rockFar, ...rockFar, ...cTop(e0), ...cTop(e1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide, depthWrite: false }));
  m.renderOrder = -1;
  m.frustumCulled = false;
  return m;
}

// ---------------------------------------------------------------- chimneys, trees, town

const CREAM = ['#f3e2c8', '#efd7b8', '#f6eadb', '#e9c7a2'].map(srgb);

function chimneyGeometry() {
  const g = new THREE.CylinderGeometry(0.55, 1, 1, 7, 4, true).translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const k = 1 + 0.12 * Math.sin(y * 9 + i);
    p.setX(i, p.getX(i) * k);
    p.setZ(i, p.getZ(i) * k);
  }
  const ng = g.toNonIndexed();
  return paint(ng, (y) => CREAM[Math.floor(y * 5.5) % CREAM.length]);
}

function capGeometry() {
  return solid(new THREE.CylinderGeometry(0.22, 1, 1, 7, 1).translate(0, 0.5, 0), '#4a3d44');
}

function buildChimneys(T, mat) {
  const group = new THREE.Group();
  const list = T.chimneys;
  const body = new THREE.InstancedMesh(chimneyGeometry(), mat, list.length);
  const capped = list.filter((c) => c.cap);
  const caps = new THREE.InstancedMesh(capGeometry(), mat, capped.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const tint = new THREE.Color();
  list.forEach((c, i) => {
    e.set(c.lean, (c.x * 0.013) % TAU, c.lean * 0.7);
    q.setFromEuler(e);
    m.compose(p.set(c.x, c.y, c.z), q, s.set(c.r, c.h, c.r));
    body.setMatrixAt(i, m);
    const k = 0.92 + 0.1 * h01(Math.floor(c.x), Math.floor(c.z));
    body.setColorAt(i, tint.setRGB(k, k * (0.97 + 0.03 * h01(i, 3)), k * 0.96));
  });
  capped.forEach((c, i) => {
    e.set(c.lean, (c.x * 0.013) % TAU, c.lean * 0.7);
    q.setFromEuler(e);
    const top = new THREE.Vector3(0, c.h * 0.98, 0).applyQuaternion(q);
    m.compose(p.set(c.x + top.x, c.y + top.y, c.z + top.z), q, s.set(c.r * 0.82, 2.4 + c.r * 0.55, c.r * 0.82));
    caps.setMatrixAt(i, m);
  });
  group.add(body, caps);
  return group;
}

function buildTrees(T, mat) {
  const group = new THREE.Group();
  const pop = T.trees.filter((t) => t.kind === 'poplar');
  const apr = T.trees.filter((t) => t.kind === 'apricot');
  const popGeo = paint(new THREE.ConeGeometry(1, 1, 6, 1).translate(0, 0.5, 0).toNonIndexed(), () => [1, 1, 1]);
  const aprGeo = paint(new THREE.IcosahedronGeometry(1, 0), () => [1, 1, 1]);
  const pm = new THREE.InstancedMesh(popGeo, mat, pop.length);
  const am = new THREE.InstancedMesh(aprGeo, mat, apr.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const autumn = ['#c9a83e', '#6f8a3c', '#d8b54a', '#5f7a38', '#b98f34'].map((h) => new THREE.Color(h));
  const orchard = ['#7d9a47', '#c98a3a', '#9aa64a', '#d07a3a'].map((h) => new THREE.Color(h));
  pop.forEach((t, i) => {
    m.compose(p.set(t.x, t.y - 0.5, t.z), q, s.set(1.9, t.h, 1.9));
    pm.setMatrixAt(i, m);
    pm.setColorAt(i, autumn[i % autumn.length]);
  });
  apr.forEach((t, i) => {
    m.compose(p.set(t.x, t.y + 2.4, t.z), q, s.set(2.6, 2.1, 2.6));
    am.setMatrixAt(i, m);
    am.setColorAt(i, orchard[i % orchard.length]);
  });
  group.add(pm, am);
  return group;
}

function buildTown(T, mat) {
  const group = new THREE.Group();
  const geo = paint(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0).toNonIndexed(), (y) => (y > 0.99 ? srgb('#d9c4a6') : [1, 1, 1]));
  const houses = new THREE.InstancedMesh(geo, mat, T.town.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  const cols = ['#efe0c8', '#e6c9a0', '#f4ead8', '#d9a982', '#e8d3b4'].map((h) => new THREE.Color(h));
  T.town.forEach((h, i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), h.rot);
    m.compose(p.set(h.x, h.y - 1, h.z), q, s.set(h.w, h.h + 1, h.d));
    houses.setMatrixAt(i, m);
    houses.setColorAt(i, cols[i % cols.length]);
  });
  group.add(houses);
  // A minaret beside the town square.
  const c = T.town[3];
  const tower = mergeGeometries([
    solid(new THREE.CylinderGeometry(1.3, 1.5, 24, 8).translate(0, 12, 0), '#f1e6d2'),
    solid(new THREE.CylinderGeometry(2.1, 2.1, 1, 8).translate(0, 18, 0), '#e4d4ba'),
    solid(new THREE.ConeGeometry(1.4, 5, 8).translate(0, 26.5, 0), '#5a6b8a'),
  ]);
  const mm = new THREE.Mesh(tower, mat);
  mm.position.set(c.x + 18, c.y - 1, c.z + 6);
  group.add(mm);
  return group;
}

// ---------------------------------------------------------------- landmarks

function cone(r, h, x, y, z, color, seg = 8, top = 0.45) {
  const g = new THREE.CylinderGeometry(r * top, r, h, seg, 3).translate(x, y + h / 2, z);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.1 * Math.sin(p.getY(i) * 0.7 + i * 1.7);
    p.setX(i, x + (p.getX(i) - x) * k);
    p.setZ(i, z + (p.getZ(i) - z) * k);
  }
  return solid(g, color);
}
function cap(r, h, x, y, z) {
  return solid(new THREE.CylinderGeometry(r * 0.25, r, h, 8).translate(x, y + h / 2, z), '#43373f');
}
function windows(list, color = '#2a2230') {
  // Small dark boxes standing in for carved doors and windows.
  return list.map(([x, y, z, w, h]) => solid(new THREE.BoxGeometry(w, h, w).translate(x, y, z), color));
}

function buildLandmarks(T, mat) {
  const group = new THREE.Group();
  const parts = [];
  const by = Object.fromEntries(T.landmarks.map((m) => [m.id, m]));

  // Castle Rock: a crag of rounded towers, riddled with windows.
  {
    const c = by.castle;
    const y = c.y - 4;
    const towers = [[0, 0, 30, 92], [20, 12, 17, 64], [-18, 14, 18, 70], [8, -20, 19, 58], [-12, -16, 14, 50], [28, -12, 12, 42], [-28, -2, 13, 46]];
    const win = [];
    for (const [dx, dz, r, h] of towers) {
      parts.push(cone(r, h, c.x + dx, y, c.z + dz, '#efd9bb', 9, 0.28));
      for (let k = 0; k < 14; k++) {
        const a = h01(dx + k, dz) * TAU;
        const yy = y + 8 + h01(k, dx) * (h * 0.75 - 10);
        const rr = r * (1 - 0.72 * ((yy - y) / h)) + 0.3;
        win.push([c.x + dx + Math.cos(a) * rr, yy, c.z + dz + Math.sin(a) * rr, 1.3, 2.2]);
      }
    }
    parts.push(...windows(win));
    // A pennant on the top.
    parts.push(solid(new THREE.CylinderGeometry(0.15, 0.15, 7, 4).translate(c.x, y + 92 + 3.5, c.z), '#3a3036'));
    parts.push(solid(new THREE.BoxGeometry(3.2, 1.8, 0.1).translate(c.x + 1.7, y + 97.6, c.z), '#c8303a'));
  }
  // The Three Beauties: three tall capped chimneys, one smaller.
  {
    const c = by.beauties;
    for (const [dx, dz, r, h] of [[-7, 0, 5.2, 30], [5, -3, 4.8, 27], [3, 9, 3.6, 18]]) {
      const yy = T.groundAt(c.x + dx, c.z + dz) - 1;
      parts.push(cone(r, h, c.x + dx, yy, c.z + dz, '#f0d6b6', 8, 0.5));
      parts.push(cap(r * 0.95, 4.4, c.x + dx, yy + h - 0.5, c.z + dz));
    }
  }
  // Camel Rock: body, hump, neck and head of soft tuff on a pedestal.
  {
    const c = by.camel;
    const y = c.y;
    const blob = (sx, sy, sz, x, yy, z) => solid(new THREE.IcosahedronGeometry(1, 1).scale(sx, sy, sz).translate(c.x + x, y + yy, c.z + z), '#e9bf93');
    parts.push(cone(9, 6, c.x, y - 1, c.z, '#dcae86', 9, 0.85));
    parts.push(blob(9, 4.5, 4.2, 0, 9, 0));
    parts.push(blob(4, 3.4, 3.4, -1, 12.5, 0));
    parts.push(solid(new THREE.CylinderGeometry(1.5, 2.2, 9, 7).rotateZ(-0.6).translate(c.x + 10, y + 13, c.z), '#e9bf93'));
    parts.push(blob(3, 1.7, 1.7, 14.4, 17.2, 0));
    for (const [lx, lz] of [[-5, -2], [-5, 2], [5, -2], [5, 2]]) parts.push(solid(new THREE.CylinderGeometry(0.9, 1.1, 6, 6).translate(c.x + lx, y + 4.5, c.z + lz), '#dcae86'));
  }
  // Pigeon Valley: white-painted dovecotes along the cliffs.
  {
    const c = by.pigeons;
    const doves = [];
    for (let k = 0; k < 90; k++) {
      const t = 0.38 + 0.25 * h01(k, 91);
      const side = h01(k, 92) < 0.5 ? -1 : 1;
      const p = along('pigeon', t, side * (52 + 22 * h01(k, 93)));
      const g = T.groundAt(p.x, p.z);
      if (T.slopeAt(p.x, p.z) < 0.4) continue;
      doves.push([p.x, g + 2 + 6 * h01(k, 94), p.z, 3.4, 2.6]);
    }
    parts.push(...windows(doves, '#fbf6ee'));
    const holes = doves.map(([x, y, z]) => [x, y, z, 3.5, 0.7]);
    parts.push(...windows(holes, '#4a3a40'));
    void c;
  }
  // The Cave Church: a wide chimney cluster with a carved façade.
  {
    const c = by.church;
    const y = c.y - 1;
    parts.push(cone(12, 26, c.x, y, c.z, '#f2dcc0', 9, 0.6));
    parts.push(cone(8, 20, c.x + 13, y, c.z + 4, '#ecd3b2', 8, 0.5));
    parts.push(cap(6, 4, c.x + 13, y + 19.4, c.z + 4));
    // Façade facing the valley floor: an arched door, windows and a carved cross.
    const f = [c.x - 12.6, c.z];
    parts.push(solid(new THREE.BoxGeometry(1, 7, 4.6).translate(f[0], y + 3.5, f[1]), '#2a2230'));
    parts.push(solid(new THREE.CylinderGeometry(2.3, 2.3, 1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(f[0], y + 7, f[1]), '#2a2230'));
    parts.push(...windows([[f[0] + 0.6, y + 13, f[1] - 4, 1.4, 2.2], [f[0] + 0.6, y + 13, f[1] + 4, 1.4, 2.2], [f[0] + 1.2, y + 17, f[1], 1.2, 3.6], [f[0] + 1.2, y + 17.8, f[1], 1.2, 1.2]]));
    parts.push(solid(new THREE.BoxGeometry(1.2, 1.2, 3.4).translate(f[0] + 1.2, y + 17.8, f[1]), '#2a2230'));
  }
  // Monks' Valley: chimneys with two or three caps.
  {
    const c = by.monks;
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.4;
      const x = c.x + Math.cos(a) * (18 + 10 * h01(k, 5));
      const z = c.z + Math.sin(a) * (18 + 10 * h01(k, 6));
      const y = T.groundAt(x, z) - 1;
      const h = 14 + 6 * h01(k, 7);
      parts.push(cone(6.5, h, x, y, z, '#f2e0c6', 8, 0.75));
      const heads = 2 + (k % 2);
      for (let q = 0; q < heads; q++) {
        const b = (q / heads) * TAU + k;
        const hx = x + Math.cos(b) * 2.6;
        const hz = z + Math.sin(b) * 2.6;
        const hh = 7 + 4 * h01(k, q);
        parts.push(cone(2.4, hh, hx, y + h - 1, hz, '#efd8bc', 7, 0.6));
        parts.push(cap(2.2, 2.4, hx, y + h + hh - 1.6, hz));
      }
    }
  }
  // Red River Bridge: a stone arch over the river.
  {
    const c = by.bridge;
    const p0 = along('main', 0.552, 0);
    const p1 = along('main', 0.558, 0);
    const ang = Math.atan2(p1.z - p0.z, p1.x - p0.x);
    const g = T.groundAt(c.x, c.z);
    const deck = new THREE.BoxGeometry(5, 1.2, 64);
    const arch = new THREE.TorusGeometry(9, 1.6, 6, 12, Math.PI);
    arch.rotateY(Math.PI / 2);
    const parapet = new THREE.BoxGeometry(0.6, 1, 64);
    const merged = mergeGeometries([solid(deck.translate(0, 6.6, 0), '#b9705a'), solid(arch.translate(0, -2.5, 0), '#a8624e'), solid(parapet.clone().translate(2.3, 7.6, 0), '#c98a6e'), solid(parapet.translate(-2.3, 7.6, 0), '#c98a6e')]);
    const mesh = new THREE.Mesh(merged, mat);
    mesh.position.set(c.x, g, c.z);
    mesh.rotation.y = -ang;
    group.add(mesh);
  }
  // Apricot Orchards: a farmhouse and haystacks beside the rows (the trees are in buildTrees).
  {
    const c = by.orchards;
    const p = along('main', 0.43, -160);
    const g = T.groundAt(p.x, p.z);
    parts.push(solid(new THREE.BoxGeometry(10, 6, 8).translate(p.x, g + 3, p.z), '#efe0c8'));
    parts.push(solid(new THREE.BoxGeometry(10.6, 0.8, 8.6).translate(p.x, g + 6.2, p.z), '#b9705a'));
    for (let k = 0; k < 4; k++) parts.push(solid(new THREE.ConeGeometry(2.2, 3.2, 7).translate(p.x + 12 + k * 5, g + 1.6, p.z + 8), '#e3b75a'));
    void c;
  }
  // Rose Valley: sharp pink spires along the ridge.
  {
    for (let k = 0; k < 16; k++) {
      const t = 0.35 + 0.2 * (k / 16);
      const side = k % 2 ? -1 : 1;
      const p = along('rose', t, side * (48 + 16 * h01(k, 3)));
      const y = T.groundAt(p.x, p.z) - 1;
      parts.push(cone(4 + 2 * h01(k, 4), 14 + 12 * h01(k, 5), p.x, y, p.z, k % 3 ? '#e2a0a0' : '#f0c4b4', 7, 0.3));
    }
  }

  const merged = mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g;
  }));
  merged.computeVertexNormals();
  group.add(new THREE.Mesh(merged, mat));
  return group;
}

// ---------------------------------------------------------------- crosses and markers

function buildCross(T, c) {
  const g = new THREE.Group();
  const col = srgb(c.color);
  const white = srgb('#fbf7ef');
  const arm = (len, wid, rot) => {
    const geo = new THREE.PlaneGeometry(wid, len, 1, 16).rotateX(-Math.PI / 2).rotateY(rot);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, T.groundAt(c.x + p.getX(i), c.z + p.getZ(i)) - c.y + 0.35);
    return geo;
  };
  const crossGeo = mergeGeometries([arm(46, 6, 0), arm(46, 6, Math.PI / 2)]);
  const cross = new THREE.Mesh(crossGeo, new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...white), polygonOffset: true, polygonOffsetFactor: -2 }));
  g.add(cross);
  for (const r of [10, 25, 50]) {
    const ring = new THREE.RingGeometry(r - 0.8, r + 0.8, 48, 1).rotateX(-Math.PI / 2);
    const p = ring.attributes.position;
    for (let i = 0; i < p.count; i++) p.setY(i, T.groundAt(c.x + p.getX(i), c.z + p.getZ(i)) - c.y + 0.3);
    g.add(new THREE.Mesh(ring, new THREE.MeshLambertMaterial({ color: new THREE.Color().setRGB(...col), polygonOffset: true, polygonOffsetFactor: -2 })));
  }
  // A beam of light so you can find it from the far side of the valley.
  const beamGeo = new THREE.CylinderGeometry(1.4, 2.6, 260, 10, 6, true).translate(0, 130, 0);
  const bc = new Float32Array(beamGeo.attributes.position.count * 3);
  for (let i = 0; i < beamGeo.attributes.position.count; i++) {
    const y = beamGeo.attributes.position.getY(i);
    const k = Math.pow(1 - y / 260, 1.6);
    bc.set([col[0] * k, col[1] * k, col[2] * k], i * 3);
  }
  beamGeo.setAttribute('color', new THREE.BufferAttribute(bc, 3));
  const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
  g.add(beam);
  g.userData.beam = beam;
  g.position.set(c.x, c.y, c.z);
  return g;
}

function buildMarker(color) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.7, 0.9).translate(0, 0.35, 0), new THREE.MeshLambertMaterial({ color: '#8b5a33' })));
  const streamer = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 9).translate(0, 4.8, 0), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
  g.add(streamer);
  g.userData.streamer = streamer;
  return g;
}
