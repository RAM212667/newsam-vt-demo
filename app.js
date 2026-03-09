import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");

function fail(message, error) {
  console.error(error || message);
  statusEl.textContent = `Load failed: ${message}`;
  statusEl.className = "err";
}

try {
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
      if (!vrm) {
        fail("VRM data not found in model.");
        return;
      }

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
      fail("Could not load /models/sample.vrm", error);
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
} catch (error) {
  fail("Module initialization error. Check browser console.", error);
}
