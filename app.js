import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { VRMLoaderPlugin, VRMUtils } from "@pixiv/three-vrm";

const app = document.getElementById("app");
const statusEl = document.getElementById("status");
const micBtn = document.getElementById("micBtn");
const micStatusEl = document.getElementById("micStatus");
const skinUploadEl = document.getElementById("skinUpload");
const skinBtn = document.getElementById("skinBtn");
const skinStatusEl = document.getElementById("skinStatus");

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
  const textureLoader = new THREE.TextureLoader();
  const DEFAULT_SAM_SKIN = "./models/sam-skin.png";
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

  function applyLook(node, baseQ, yaw, pitch) {
    if (!node || !baseQ) return;
    tempEuler.set(pitch, yaw, 0, "YXZ");
    tempQ.setFromEuler(tempEuler);
    node.quaternion.copy(baseQ).multiply(tempQ);
  }

  function setLipExpressions(vrm, open) {
    const manager = vrm?.expressionManager;
    if (!manager || typeof manager.setValue !== "function") return false;

    const v = clamp(open, 0, 1);
    manager.setValue("aa", v);
    manager.setValue("oh", v * 0.35);
    manager.setValue("ou", v * 0.2);
    manager.setValue("ee", v * 0.1);
    manager.setValue("ih", v * 0.08);
    return true;
  }

  function clearLipExpressions(vrm) {
    const manager = vrm?.expressionManager;
    if (!manager || typeof manager.setValue !== "function") return;
    manager.setValue("aa", 0);
    manager.setValue("oh", 0);
    manager.setValue("ou", 0);
    manager.setValue("ee", 0);
    manager.setValue("ih", 0);
  }

  async function enableMic() {
    if (analyser) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      micStatusEl.textContent = "Mic: browser does not support getUserMedia";
      micStatusEl.className = "err";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      const audioContext = new window.AudioContext();
      await audioContext.resume();
      const source = audioContext.createMediaStreamSource(stream);
      analyser = audioContext.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      audioData = new Uint8Array(analyser.fftSize);
      source.connect(analyser);

      micBtn.disabled = true;
      micBtn.textContent = "Mic Enabled";
      micStatusEl.textContent = "Mic: live lip sync enabled";
      micStatusEl.className = "ok";
    } catch (error) {
      micStatusEl.textContent = "Mic: permission denied or unavailable";
      micStatusEl.className = "err";
      console.error(error);
    }
  }

  function applySkinTexture(texture) {
    if (!currentVRM) {
      skinStatusEl.textContent = "Skin: load model first";
      skinStatusEl.className = "err";
      return;
    }

    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.needsUpdate = true;

    let updated = 0;

    currentVRM.scene.traverse((obj) => {
      if (!obj.isMesh || !obj.material) return;
      const name = (obj.name || "").toLowerCase();
      if (name.includes("eye") || name.includes("iris") || name.includes("pupil")) return;

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      const nextMats = mats.map((mat) => {
        if (!mat || !("map" in mat)) return mat;
        const cloned = mat.clone();
        cloned.map = texture;
        cloned.color = new THREE.Color(0xffffff);
        cloned.needsUpdate = true;
        updated += 1;
        return cloned;
      });

      obj.material = Array.isArray(obj.material) ? nextMats : nextMats[0];
    });

    skinStatusEl.textContent = `Skin: SAM image applied to ${updated} material slots`;
    skinStatusEl.className = "ok";
  }

  function tryLoadDefaultSkin() {
    skinStatusEl.textContent = "Skin: checking default ./models/sam-skin.png...";
    skinStatusEl.className = "";

    textureLoader.load(
      DEFAULT_SAM_SKIN,
      (texture) => {
        applySkinTexture(texture);
      },
      undefined,
      () => {
        skinStatusEl.textContent = "Skin: default not found (add models/sam-skin.png)";
        skinStatusEl.className = "";
      }
    );
  }

  function loadUploadedTexture(file) {
    if (!file) {
      skinStatusEl.textContent = "Skin: choose an image first";
      skinStatusEl.className = "err";
      return;
    }

    const blobUrl = URL.createObjectURL(file);
    skinStatusEl.textContent = "Skin: applying image...";
    skinStatusEl.className = "";

    textureLoader.load(
      blobUrl,
      (texture) => {
        applySkinTexture(texture);
        URL.revokeObjectURL(blobUrl);
      },
      undefined,
      (error) => {
        console.error(error);
        URL.revokeObjectURL(blobUrl);
        skinStatusEl.textContent = "Skin: failed to load image";
        skinStatusEl.className = "err";
      }
    );
  }

  micBtn.addEventListener("click", enableMic);
  skinBtn.addEventListener("click", () => loadUploadedTexture(skinUploadEl.files?.[0]));

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

      statusEl.textContent = "Loaded. Mouse tracks eyes/head. Enable mic for lip sync.";
      statusEl.className = "ok";
      tryLoadDefaultSkin();
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
    mouthOpenTarget = clamp((rms - 0.008) * 22, 0, 1);
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
      mouthOpenCurrent = THREE.MathUtils.lerp(mouthOpenCurrent, mouthOpenTarget, 0.4);

      const usedExpressions = setLipExpressions(currentVRM, mouthOpenCurrent);
      if (!usedExpressions && jawBone && jawBaseQ) {
        tempEuler.set(mouthOpenCurrent * 0.35, 0, 0, "YXZ");
        tempQ.setFromEuler(tempEuler);
        jawBone.quaternion.copy(jawBaseQ).multiply(tempQ);
      } else if (jawBone && jawBaseQ) {
        jawBone.quaternion.copy(jawBaseQ);
      }

      if (mouthOpenCurrent < 0.001) {
        clearLipExpressions(currentVRM);
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
