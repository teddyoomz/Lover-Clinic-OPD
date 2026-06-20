// Filler3D — real WebGL 3D anatomical model (clinical/medical style, non-explicit).
// Lazy-loaded by FillerSimulator only when the 3D view is selected, so `three`
// stays out of the initial bundle. Scales live from the fillerMath estimate.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { girthToRadiusCm } from '../lib/fillerMath.js';

function buildModel(group, material, est, lengthCm) {
  // clear + dispose old geometries (material is shared, disposed on unmount)
  while (group.children.length) {
    const c = group.children.pop();
    if (c.geometry) c.geometry.dispose();
  }
  const r = Math.max(girthToRadiusCm(est?.c1Low ?? 5.5), 0.3); // shaft radius (cm)
  const L = Math.max(lengthCm ?? 12.7, 4); // cm
  // glans radius from the (damped) glans Ø — INDEPENDENT of shaft, so injecting the
  // shaft makes the shaft grow past the head (not the head following the shaft).
  const glansR = Math.max((est?.glans?.visualLow ?? r * 2) / 2, 0.3);

  // shaft (cylinder along X)
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, 48, 1, false), material);
  shaft.rotation.z = Math.PI / 2;
  group.add(shaft);
  // glans bulb (slightly elongated sphere) at +X tip — mushroom head
  const glans = new THREE.Mesh(new THREE.SphereGeometry(glansR, 48, 32), material);
  glans.scale.x = 1.18;
  glans.position.x = L / 2 + glansR * 0.25;
  group.add(glans);
  // corona ridge — prominent torus at glans base
  const corona = new THREE.Mesh(new THREE.TorusGeometry(glansR * 0.96, glansR * 0.16, 18, 56), material);
  corona.rotation.y = Math.PI / 2;
  corona.position.x = L / 2 - glansR * 0.12;
  group.add(corona);
  // rounded base
  const base = new THREE.Mesh(new THREE.SphereGeometry(r, 40, 24), material);
  base.position.x = -L / 2;
  group.add(base);
}

// model's intrinsic X-extent (cm) — shaft length + glans bulb + rounded base
function computeModelLen(est, lengthCm) {
  const r = Math.max(girthToRadiusCm(est?.c1Low ?? 5.5), 0.3);
  const glansR = Math.max((est?.glans?.visualLow ?? r * 2) / 2, 0.3);
  const L = Math.max(lengthCm ?? 12.7, 4);
  return L + glansR * 2.4 + r * 2;
}

// auto-scale: frame the model so its length fills ~the canvas width (using the live FOV+aspect),
// reframed on every rebuild/resize so it always looks good. Preserves the current orbit angle.
function frameCamera(camera, controls, modelLen) {
  const vFOV = (camera.fov * Math.PI) / 180;
  const hFOV = 2 * Math.atan(Math.tan(vFOV / 2) * camera.aspect);
  const fill = 0.82; // model spans ~82% of the width at the front-facing angle
  const dist = (modelLen / 2) / Math.tan(hFOV / 2) / fill;
  let dir = camera.position.clone().sub(controls.target);
  if (dir.lengthSq() < 1e-6) dir = new THREE.Vector3(0, 0.32, 1);
  dir.normalize();
  controls.target.set(0, 0, 0);
  camera.position.copy(dir.multiplyScalar(dist));
  camera.near = Math.max(dist / 100, 0.1);
  camera.far = dist * 100;
  camera.updateProjectionMatrix();
  controls.update();
}

export default function Filler3D({ est, lengthCm = 11, t }) {
  const tr = typeof t === 'function' ? t : (k) => k;
  const mountRef = useRef(null);
  const refs = useRef({});

  // init once
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const width = mount.clientWidth || 320;
    const height = 300;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 1000);
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    mount.appendChild(renderer.domElement);

    const material = new THREE.MeshStandardMaterial({ color: 0xc9886a, roughness: 0.78, metalness: 0.04 });
    const group = new THREE.Group();
    scene.add(group);

    scene.add(new THREE.AmbientLight(0xffffff, 1.15));
    const key = new THREE.DirectionalLight(0xfff1ea, 1.5); key.position.set(6, 9, 10); scene.add(key);
    const fill = new THREE.DirectionalLight(0xff8a6a, 0.5); fill.position.set(-8, -3, -6); scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 5;
    controls.maxDistance = 160;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 1.4;

    refs.current = { scene, camera, renderer, material, group, controls, mount };
    buildModel(group, material, est, lengthCm);
    refs.current.modelLen = computeModelLen(est, lengthCm);
    frameCamera(camera, controls, refs.current.modelLen); // auto-scale to fill the canvas

    let raf;
    const animate = () => { controls.update(); renderer.render(scene, camera); raf = requestAnimationFrame(animate); };
    animate();

    const onResize = () => {
      const w = mount.clientWidth || width;
      camera.aspect = w / height; renderer.setSize(w, height);
      frameCamera(camera, controls, refs.current.modelLen || computeModelLen(est, lengthCm)); // re-fit on resize
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
      refs.current = {};
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // rebuild geometry + auto-scale on estimate / length change
  useEffect(() => {
    const r = refs.current;
    if (!r.group) return;
    buildModel(r.group, r.material, est, lengthCm);
    r.modelLen = computeModelLen(est, lengthCm);
    frameCamera(r.camera, r.controls, r.modelLen); // re-fit so it always fills nicely
  }, [est, lengthCm]);

  return (
    <div ref={mountRef} style={{ width: '100%', height: 300, cursor: 'grab' }} aria-label={tr('model3dAria')} />
  );
}
