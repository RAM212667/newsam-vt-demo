import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const micBtn = document.getElementById("micBtn");
const micStatusEl = document.getElementById("micStatus");

function fail(message, error) {
  console.error(error || message);
  statusEl.textContent = `Load failed: ${message}`;
  statusEl.className = "err";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getBone(vrm, boneName) {
  const humanoid = vrm?.humanoid;
  if (!humanoid) return null;
  if (typeof humanoid.getNormalizedBoneNode === "function") {
    const node = humanoid.getNormalizedBoneNode(boneName);
    if (node) return node;
  }
  if (typeof humanoid.getRawBoneNode === "function") {
    return humanoid.getRawBoneNode(boneName);
  }
  return null;
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

  let neckBone = null;
  let headBone = null;
  let leftEyeBone = null;
  let rightEyeBone = null;
  let jawBone = null;

  let neckBaseQ = null;
  let headBaseQ = null;
  let leftEyeBaseQ = null;
  let rightEyeBaseQ = null;
  let jawBaseQ = null;

  const tempQ = new THREE.Quaternion();
  const tempEuler = new THREE.Euler(0, 0, 0, "YXZ");

  let lookTargetX = 0;
  let lookTargetY = 0;
  let lookCurrentX = 0;
  let lookCurrentY = 0;

  let mouthOpenTarget = 0;
  let mouthOpenCurrent = 0;

  let analyser = null;
  let audioData = null;
  let audioContext = null;

  function applyLook(node, baseQ, yaw, pitch) {
    if (!node || !baseQ) return;
    tempEuler.set(pitch, yaw, 0, "YXZ");
    tempQ.setFromEuler(tempEuler);
    node.quaternion.copy(baseQ).multiply(tempQ);
  }

  async function enableMic() {
    if (analyser) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      micStatusEl.textContent = "Mic: browser does not support getUserMedia";
      micStatusEl.className = "err";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioContext = new window.AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.75;
      audioData = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      micBtn.disabled = true;
      micBtn.textContent = "Mic Enabled";
      micStatusEl.textContent = "Mic: live (mouth moves while you talk)";
      micStatusEl.className = "ok";
    } catch (error) {
      micStatusEl.textContent = "Mic: permission denied or unavailable";
      micStatusEl.className = "err";
      console.error(error);
    }
  }

  micBtn.addEventListener("click", enableMic);

  window.addEventListener("pointermove", (event) => {
    const x = (event.clientX / window.innerWidth) * 2 - 1;
    const y = (event.clientY / window.innerHeight) * 2 - 1;
    lookTargetX = clamp(x, -1, 1);
    lookTargetY = clamp(y, -1, 1);
  });

  window.addEventListener("pointerleave", () => {
    lookTargetX = 0;
    lookTargetY = 0;
  });

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

      neckBone = getBone(vrm, "neck");
      headBone = getBone(vrm, "head");
      leftEyeBone = getBone(vrm, "leftEye");
      rightEyeBone = getBone(vrm, "rightEye");
      jawBone = getBone(vrm, "jaw");

      neckBaseQ = neckBone?.quaternion.clone() || null;
      headBaseQ = headBone?.quaternion.clone() || null;
      leftEyeBaseQ = leftEyeBone?.quaternion.clone() || null;
      rightEyeBaseQ = rightEyeBone?.quaternion.clone() || null;
      jawBaseQ = jawBone?.quaternion.clone() || null;

      statusEl.textContent = "Loaded. Mouse tracks eyes/head. Enable mic to drive talking.";
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

  function updateMicMouth() {
    if (!analyser || !audioData) {
      mouthOpenTarget = 0;
      return;
    }

    analyser.getByteTimeDomainData(audioData);

    let sum = 0;
    for (let i = 0; i < audioData.length; i += 1) {
      const v = (audioData[i] - 128) / 128;
      sum += v * v;
    }

    const rms = Math.sqrt(sum / audioData.length);
    mouthOpenTarget = clamp((rms - 0.02) * 10, 0, 1);
  }

  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();

    if (currentVRM) {
      lookCurrentX = THREE.MathUtils.lerp(lookCurrentX, lookTargetX, 0.12);
      lookCurrentY = THREE.MathUtils.lerp(lookCurrentY, lookTargetY, 0.12);

      const headYaw = lookCurrentX * 0.24;
      const headPitch = -lookCurrentY * 0.12;
      const neckYaw = lookCurrentX * 0.12;
      const neckPitch = -lookCurrentY * 0.06;
      const eyeYaw = lookCurrentX * 0.36;
      const eyePitch = -lookCurrentY * 0.2;

      applyLook(neckBone, neckBaseQ, neckYaw, neckPitch);
      applyLook(headBone, headBaseQ, headYaw, headPitch);
      applyLook(leftEyeBone, leftEyeBaseQ, eyeYaw, eyePitch);
      applyLook(rightEyeBone, rightEyeBaseQ, eyeYaw, eyePitch);

      updateMicMouth();
      mouthOpenCurrent = THREE.MathUtils.lerp(mouthOpenCurrent, mouthOpenTarget, 0.35);
      if (jawBone && jawBaseQ) {
        tempEuler.set(mouthOpenCurrent * 0.35, 0, 0, "YXZ");
        tempQ.setFromEuler(tempEuler);
        jawBone.quaternion.copy(jawBaseQ).multiply(tempQ);
      }

      currentVRM.update(delta);
    }

    controls.update();
    renderer.render(scene, camera);
  }

  animate();
} catch (error) {
  fail("Module initialization error. Check browser console.", error);
}
