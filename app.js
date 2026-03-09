import * as THREE from "https://unpkg.com/three@0.169.0/build/three.module.js";
import { OrbitControls } from "https://unpkg.com/three@0.169.0/examples/jsm/controls/OrbitControls.js";
import { GLTFLoader } from "https://unpkg.com/three@0.169.0/examples/jsm/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "https://unpkg.com/@pixiv/three-vrm@3.4.2/lib/three-vrm.module.js";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(35, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0.0, 1.4, 2.4);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0.0, 1.2, 0.0);
controls.enableDamping = true;
controls.minDistance = 1.2;
controls.maxDistance = 6;
controls.update();

scene.add(new THREE.HemisphereLight(0xffffff, 0x2a1d5e, 1.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(1, 3, 2);
scene.add(dirLight);

const floor = new THREE.Mesh(
  new THREE.CircleGeometry(5, 64),
  new THREE.MeshStandardMaterial({ color: 0x24315a, roughness: 0.92, metalness: 0.1 })
);
floor.rotation.x = -Math.PI / 2;
floor.position.y = -0.01;
scene.add(floor);

const clock = new THREE.Clock();
let currentVRM = null;

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

loader.load(
  "./models/sample.vrm",
  (gltf) => {
    const vrm = gltf.userData.vrm;
    VRMUtils.rotateVRM0(vrm);
    VRMUtils.removeUnnecessaryJoints(vrm.scene);

    vrm.scene.position.set(0, 0, 0);
    scene.add(vrm.scene);
    currentVRM = vrm;

    statusEl.textContent = "Loaded. Model is live and updating each frame.";
    statusEl.className = "ok";
  },
  (progress) => {
    if (!progress.total) return;
    const pct = Math.round((progress.loaded / progress.total) * 100);
    statusEl.textContent = `Loading model... ${pct}%`;
  },
  (error) => {
    console.error(error);
    statusEl.textContent = "Load failed. Run with a local web server (not file://).";
    statusEl.className = "err";
  }
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (currentVRM) {
    currentVRM.update(delta);
    currentVRM.scene.rotation.y += delta * 0.18;
  }

  controls.update();
  renderer.render(scene, camera);
}

animate();