import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { MTLLoader } from "three/addons/loaders/MTLLoader.js";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { KStereoEffect } from "/vendor/kmax/KStereoEffect.js";
import { KStylusRaycaster } from "/vendor/kmax/KStylusRaycaster.js";
import { WSTrack } from "/vendor/kmax/ws-track.js";

const uploadCard = document.getElementById("upload-card");
const fileInput = document.getElementById("model-files");
const entryFileSelect = document.getElementById("entry-file");
const themeSelect = document.getElementById("theme-select");
const lightRange = document.getElementById("light-range");
const lightValue = document.getElementById("light-value");
const loadButton = document.getElementById("load-model");
const resetCameraButton = document.getElementById("reset-camera");
const autoRotateButton = document.getElementById("toggle-autorotate");
const wireframeButton = document.getElementById("toggle-wireframe");
const gridButton = document.getElementById("toggle-grid");
const stereoButton = document.getElementById("toggle-stereo-3d");
const fullscreenButton = document.getElementById("toggle-fullscreen");
const exportButton = document.getElementById("export-image");
const fileList = document.getElementById("file-list");
const recentList = document.getElementById("recent-list");
const stereoDeviceBadge = document.getElementById("stereo-device-badge");
const stereoStatusDetail = document.getElementById("stereo-status-detail");
const statusText = document.getElementById("status-text");
const fileCount = document.getElementById("file-count");
const formatStat = document.getElementById("format-stat");
const meshStat = document.getElementById("mesh-stat");
const triangleStat = document.getElementById("triangle-stat");
const vertexStat = document.getElementById("vertex-stat");
const animationStat = document.getElementById("animation-stat");
const sizeStat = document.getElementById("size-stat");
const modelName = document.getElementById("model-name");
const modelMeta = document.getElementById("model-meta");
const viewerHost = document.getElementById("viewer");
const viewerShell = document.getElementById("viewer-shell");

const resourceMap = new Map();
const recentStorageKey = "model-preview-recent";

const stereoConfig = {
  screenWidth: 0.544,
  screenHeight: 0.306,
  screenScale: 1,
  trackingScale: 0.32,
  trackingScaleX: 0.24,
  trackingScaleY: 0.16,
  trackingScaleZ: 0.2,
  trackingSmoothing: 0.1,
  fitSize: 0.17,
  targetDepth: -0.135,
  cameraDistance: 0.46,
  penRotationSpeed: 3.2,
  penMoveScaleX: 1.25,
  penMoveScaleY: 1.1,
  penScaleSpeed: 1.8
};

let currentObject = null;
let animationMixer = null;
let dragDepth = 0;
let isWireframe = false;
let isGridVisible = true;
let isStereoEnabled = false;
let isStereoDisplayActive = false;
let stereoEffect = null;
let stereoTracker = null;
let stylusRaycaster = null;
let stereoTrackingData = null;
let stereoBaseCameraPosition = null;
let stereoBaseTarget = new THREE.Vector3();
let isPointerModelRotating = false;
let activePointerId = null;
let pointerStart = { x: 0, y: 0 };
let modelRotationOnPointerStart = new THREE.Euler(0, 0, 0, "YXZ");
let lastPenPose = null;
let wasPenPressed = false;
let smoothedEyeOffset = new THREE.Vector3();
let lastStylusIntersections = [];
let isPenGrabbingModel = false;
let penGrabStartPose = null;
let penGrabStartPosition = new THREE.Vector3();
let penGrabStartQuaternion = new THREE.Quaternion();
let penGrabStartScale = new THREE.Vector3(1, 1, 1);
let penGrabStartRotation = null;
let penGrabHitPointLocal = null;

const animationClock = new THREE.Clock();

const scene = new THREE.Scene();
const previewRoot = new THREE.Group();
scene.add(previewRoot);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
const stereoCamera = new THREE.PerspectiveCamera(45, 1, 0.01, 10);
camera.position.set(3.5, 2.2, 5.5);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
viewerHost.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.autoRotate = false;
controls.autoRotateSpeed = 2;

const hemiLight = new THREE.HemisphereLight(0xfff4dd, 0xc98f66, 1.45);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.75);
keyLight.position.set(6, 10, 8);
keyLight.castShadow = true;
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffd9bf, 1.05);
fillLight.position.set(-6, 5, -6);
scene.add(fillLight);

const grid = new THREE.GridHelper(20, 20, 0xd7b08f, 0xe7d6c7);
grid.position.y = -0.001;
previewRoot.add(grid);

const groundMaterial = new THREE.MeshStandardMaterial({
  color: 0xf4ece1,
  transparent: true,
  opacity: 0.95
});
const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.002;
ground.receiveShadow = true;
previewRoot.add(ground);

bootstrap();

function bootstrap() {
  stereoEffect = new KStereoEffect(renderer);
  stereoEffect.setSize(window.innerWidth, window.innerHeight);
  stereoEffect.setViewScale(1);
  stereoEffect.setCameraFrustum = applyStereoCameraFrustum;
  stylusRaycaster = new KStylusRaycaster(scene);
  stylusRaycaster.line.visible = false;
  stylusRaycaster.helper.visible = false;

  fileInput.addEventListener("change", (event) => applySelectedFiles(Array.from(event.target.files || [])));
  entryFileSelect.addEventListener("change", () => {
    highlightSelectedEntry();
    if (entryFileSelect.value) {
      void handleLoadModel();
    }
  });
  themeSelect.addEventListener("change", () => applyTheme(themeSelect.value));
  lightRange.addEventListener("input", () => updateLightStrength(Number(lightRange.value)));
  loadButton.addEventListener("click", () => void handleLoadModel());
  resetCameraButton.addEventListener("click", resetCameraView);
  autoRotateButton.addEventListener("click", toggleAutoRotate);
  wireframeButton.addEventListener("click", toggleWireframe);
  gridButton.addEventListener("click", toggleGrid);
  stereoButton.addEventListener("click", toggleStereoMode);
  fullscreenButton.addEventListener("click", () => void toggleFullscreen());
  exportButton.addEventListener("click", exportPng);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  window.addEventListener("resize", handleResize);
  renderer.domElement.addEventListener("pointerdown", handleViewerPointerDown);
  renderer.domElement.addEventListener("pointermove", handleViewerPointerMove);
  renderer.domElement.addEventListener("pointerup", handleViewerPointerUp);
  renderer.domElement.addEventListener("pointercancel", handleViewerPointerUp);
  renderer.domElement.addEventListener("lostpointercapture", handleViewerPointerUp);
  window.addEventListener("kmax-module-ready", () => {
    syncStereoRuntimeParams();
    if (isStereoEnabled && document.fullscreenElement === viewerShell) {
      maybeActivateStereoDisplay();
    }
    updateStereoButton();
    if (isStereoEnabled && !isStereoDisplayActive) {
      setStatus("裸眼 3D 引擎已就绪，进入全屏后生效");
    }
  });
  window.addEventListener("error", (event) => {
    setStatus("脚本错误");
    modelMeta.textContent = formatPreviewError(event.error || event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    setStatus("加载错误");
    modelMeta.textContent = formatPreviewError(event.reason);
  });

  bindDragAndDrop();
  setupStereoTracking();
  loadRecentEntries();
  applyTheme(themeSelect.value);
  updateLightStrength(Number(lightRange.value || 1.4));
  controls.addEventListener("change", handleControlsChange);
  handleResize();
  animate();

  setStatus("准备就绪");
  modelName.textContent = "尚未加载模型";
  modelMeta.textContent = "上传本地模型文件后，即可在浏览器中预览。";
  updateAutoRotateButton();
  updateWireframeButton();
  updateGridButton();
  updateStereoButton();
  updateFullscreenButton();
}

function setupStereoTracking() {
  try {
    stereoTracker = new WSTrack();
    stereoTracker.ondata = (data) => {
      stereoTrackingData = data;
    };

    stereoTracker.ws?.addEventListener("open", () => {
      if (isStereoEnabled && document.fullscreenElement === viewerShell) {
        maybeActivateStereoDisplay();
      }
      updateStereoButton();
      if (isStereoEnabled && !isStereoDisplayActive) {
        setStatus("检测到裸眼 3D 设备服务，进入全屏后将启用立体显示");
      }
    });

    stereoTracker.ws?.addEventListener("close", () => {
      stereoTrackingData = null;
      if (isStereoDisplayActive) {
        deactivateStereoDisplay();
      }
      updateStereoButton();
    });

    stereoTracker.ws?.addEventListener("error", () => {
      updateStereoButton();
    });
  } catch {
    stereoTracker = null;
    updateStereoButton();
  }
}

function bindDragAndDrop() {
  const prevent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  ["dragenter", "dragover", "dragleave", "drop"].forEach((type) => {
    uploadCard.addEventListener(type, prevent);
  });

  uploadCard.addEventListener("dragenter", () => {
    dragDepth += 1;
    uploadCard.classList.add("drag-active");
  });

  uploadCard.addEventListener("dragover", () => {
    uploadCard.classList.add("drag-active");
  });

  uploadCard.addEventListener("dragleave", () => {
    dragDepth = Math.max(0, dragDepth - 1);
    if (dragDepth === 0) {
      uploadCard.classList.remove("drag-active");
    }
  });

  uploadCard.addEventListener("drop", (event) => {
    dragDepth = 0;
    uploadCard.classList.remove("drag-active");
    const files = Array.from(event.dataTransfer?.files || []);
    syncFileInput(files);
    applySelectedFiles(files);
  });
}

function applySelectedFiles(files) {
  resourceMap.clear();
  for (const file of files) {
    resourceMap.set(file.name, file);
  }

  fileCount.textContent = String(files.length);
  updateFileList(files);
  updateEntryOptions(files);

  if (files.length === 0) {
    setStatus("等待上传");
    resetStats();
    modelName.textContent = "尚未加载模型";
    modelMeta.textContent = "上传本地模型文件后，即可在浏览器中预览。";
    clearCurrentObject();
    return;
  }

  if (entryFileSelect.value) {
    setStatus("文件已就绪");
    highlightSelectedEntry();
    void handleLoadModel();
  } else {
    setStatus("未发现可预览模型文件");
    resetStats();
    modelName.textContent = "没有可预览的模型";
    modelMeta.textContent = "请上传 .glb、.gltf、.fbx、.obj 或 .stl 文件。";
    clearCurrentObject();
  }
}

function syncFileInput(files) {
  if (typeof DataTransfer === "undefined") return;
  const transfer = new DataTransfer();
  for (const file of files) {
    transfer.items.add(file);
  }
  fileInput.files = transfer.files;
}

async function handleLoadModel() {
  const selectedName = entryFileSelect.value;
  const entryFile = resourceMap.get(selectedName);

  if (!entryFile) {
    setStatus("请先选择模型文件");
    return;
  }

  loadButton.disabled = true;
  setStatus("正在加载模型...");
  modelName.textContent = entryFile.name;
  formatStat.textContent = getExtension(entryFile.name).toUpperCase();

  try {
    await loadModel(entryFile);
    applyWireframeState();
    captureStereoReferenceCamera();
    setStatus("预览已加载");
  } catch (error) {
    clearCurrentObject();
    resetStats();
    setStatus("模型预览失败");
    modelMeta.textContent = formatPreviewError(error);
  } finally {
    loadButton.disabled = false;
  }
}

async function loadModel(entryFile) {
  clearCurrentObject();

  const extension = getExtension(entryFile.name);
  const manager = createLoadingManager();

  if (extension === "glb" || extension === "gltf") {
    await loadGltf(entryFile, manager);
    return;
  }

  if (extension === "fbx") {
    await loadFbx(entryFile, manager);
    return;
  }

  if (extension === "obj") {
    await loadObj(entryFile, manager);
    return;
  }

  if (extension === "stl") {
    await loadStl(entryFile);
    return;
  }

  throw new Error(`当前不支持 .${extension} 格式预览`);
}

async function loadGltf(entryFile, manager) {
  const loader = new GLTFLoader(manager);
  const dracoLoader = new DRACOLoader(manager);
  dracoLoader.setDecoderPath("/vendor/three/examples/jsm/libs/draco/gltf/");
  loader.setDRACOLoader(dracoLoader);
  loader.setMeshoptDecoder(MeshoptDecoder);

  const url = createObjectUrl(entryFile);
  let gltf;

  try {
    gltf = await loader.loadAsync(url);
  } finally {
    safeRevokeObjectUrl(url);
    dracoLoader.dispose();
  }

  currentObject = gltf.scene;
  previewRoot.add(currentObject);
  normalizeObject(currentObject);
  frameObject(currentObject);
  playAnimations(gltf.animations || []);
  updateModelStats(entryFile.name, gltf.animations?.length || 0);
}

async function loadFbx(entryFile, manager) {
  const loader = new FBXLoader(manager);
  const url = createObjectUrl(entryFile);
  let fbx;

  try {
    fbx = await loader.loadAsync(url);
  } finally {
    safeRevokeObjectUrl(url);
  }

  currentObject = fbx;
  previewRoot.add(currentObject);
  normalizeObject(currentObject);
  frameObject(currentObject);
  playAnimations(fbx.animations || []);
  updateModelStats(entryFile.name, fbx.animations?.length || 0);
}

async function loadObj(entryFile, manager) {
  const objLoader = new OBJLoader(manager);
  const mtlFile = findSiblingFile(".mtl");

  if (mtlFile) {
    const mtlLoader = new MTLLoader(manager);
    const mtlUrl = createObjectUrl(mtlFile);

    try {
      const materials = await mtlLoader.loadAsync(mtlUrl);
      materials.preload();
      objLoader.setMaterials(materials);
    } finally {
      safeRevokeObjectUrl(mtlUrl);
    }
  }

  const objUrl = createObjectUrl(entryFile);
  let obj;

  try {
    obj = await objLoader.loadAsync(objUrl);
  } finally {
    safeRevokeObjectUrl(objUrl);
  }

  currentObject = obj;
  currentObject.traverse((child) => {
    if (child.isMesh && !child.material) {
      child.material = new THREE.MeshStandardMaterial({ color: 0xd8b18f });
    }
  });

  previewRoot.add(currentObject);
  normalizeObject(currentObject);
  frameObject(currentObject);
  playAnimations([]);
  updateModelStats(entryFile.name, 0);
}

async function loadStl(entryFile) {
  const loader = new STLLoader();
  const arrayBuffer = await entryFile.arrayBuffer();
  const geometry = loader.parse(arrayBuffer);
  geometry.computeVertexNormals();

  const material = new THREE.MeshStandardMaterial({
    color: 0xc58d67,
    metalness: 0.08,
    roughness: 0.76
  });

  currentObject = new THREE.Mesh(geometry, material);
  currentObject.castShadow = true;
  currentObject.receiveShadow = true;
  previewRoot.add(currentObject);
  normalizeObject(currentObject);
  frameObject(currentObject);
  playAnimations([]);
  updateModelStats(entryFile.name, 0);
}

function createLoadingManager() {
  const manager = new THREE.LoadingManager();
  const objectUrls = new Map();

  manager.setURLModifier((url) => {
    const cleanUrl = decodeURIComponent(url.split("?")[0]);
    const file = findResourceFileByUrl(cleanUrl);

    if (!file) {
      return url;
    }

    if (!objectUrls.has(file.name)) {
      objectUrls.set(file.name, createObjectUrl(file));
    }

    return objectUrls.get(file.name);
  });

  manager.onLoad = () => {
    for (const tempUrl of objectUrls.values()) {
      safeRevokeObjectUrl(tempUrl);
    }
  };

  return manager;
}

function playAnimations(animations) {
  animationMixer = null;

  if (!currentObject || !animations || animations.length === 0) {
    animationStat.textContent = "0";
    return;
  }

  animationMixer = new THREE.AnimationMixer(currentObject);
  for (const clip of animations) {
    animationMixer.clipAction(clip).play();
  }
  animationStat.textContent = String(animations.length);
}

function clearCurrentObject() {
  if (!currentObject) {
    animationMixer = null;
    return;
  }

  previewRoot.remove(currentObject);
  disposeObject(currentObject);
  currentObject = null;
  animationMixer = null;
  resetStereoSceneFit();
}

function disposeObject(root) {
  root.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }

    if (!child.material) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      for (const key of Object.keys(material)) {
        const value = material[key];
        if (value && typeof value === "object" && "minFilter" in value) {
          value.dispose?.();
        }
      }
      material.dispose?.();
    }
  });
}

function normalizeObject(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z) || 1;
  const scale = 2.8 / maxAxis;
  object.scale.multiplyScalar(scale);

  const scaledBox = new THREE.Box3().setFromObject(object);
  const scaledCenter = scaledBox.getCenter(new THREE.Vector3());
  object.position.sub(scaledCenter);

  const finalBox = new THREE.Box3().setFromObject(object);
  object.position.y -= finalBox.min.y;
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const distance = maxDim * 1.8;

  camera.position.set(center.x + distance, center.y + distance * 0.65, center.z + distance);
  camera.near = Math.max(0.1, distance / 100);
  camera.far = Math.max(100, distance * 10);
  camera.updateProjectionMatrix();

  controls.minDistance = Math.max(0.5, distance / 8);
  controls.maxDistance = Math.max(10, distance * 4);
  controls.target.copy(center);
  controls.update();
  syncStereoRuntimeParams();
  captureStereoReferenceCamera();
}

function updateFileList(files) {
  if (files.length === 0) {
    fileList.innerHTML = "<li>暂未选择文件</li>";
    return;
  }

  fileList.innerHTML = files
    .map((file) => `<li data-file="${escapeHtml(file.name)}">${escapeHtml(file.name)} <small>(${formatBytes(file.size)})</small></li>`)
    .join("");
}

function updateEntryOptions(files) {
  const modelFiles = files.filter((file) => isPreviewableModel(file.name));
  entryFileSelect.innerHTML = "";

  if (modelFiles.length === 0) {
    entryFileSelect.disabled = true;
    loadButton.disabled = true;
    entryFileSelect.innerHTML = '<option value="">未发现可预览模型文件</option>';
    return;
  }

  for (const file of modelFiles) {
    const option = document.createElement("option");
    option.value = file.name;
    option.textContent = file.name;
    entryFileSelect.appendChild(option);
  }

  entryFileSelect.value = modelFiles[0].name;
  entryFileSelect.disabled = false;
  loadButton.disabled = false;
}

function highlightSelectedEntry() {
  const selected = entryFileSelect.value;
  for (const item of fileList.querySelectorAll("li[data-file]")) {
    item.classList.toggle("selected", item.dataset.file === selected);
  }
}

function resetCameraView() {
  if (!currentObject) return;
  frameObject(currentObject);
  setStatus("视角已重置");
}

function isPreviewableModel(fileName) {
  return ["glb", "gltf", "fbx", "obj", "stl"].includes(getExtension(fileName));
}

function getExtension(fileName) {
  return String(fileName).split(".").pop().toLowerCase();
}

function findSiblingFile(extension) {
  for (const [name, file] of resourceMap.entries()) {
    if (name.toLowerCase().endsWith(extension)) {
      return file;
    }
  }
  return null;
}

function findResourceFileByUrl(url) {
  const fileName = url.split("/").pop();
  if (!fileName) {
    return null;
  }

  if (resourceMap.has(fileName)) {
    return resourceMap.get(fileName);
  }

  const normalizedName = fileName.toLowerCase();
  for (const [name, file] of resourceMap.entries()) {
    if (name.toLowerCase() === normalizedName) {
      return file;
    }
  }

  return null;
}

function createObjectUrl(file) {
  return URL.createObjectURL(file);
}

function safeRevokeObjectUrl(url) {
  try {
    URL.revokeObjectURL(url);
  } catch {}
}

function setStatus(text) {
  statusText.textContent = text;
}

function updateModelStats(fileName, animationCount) {
  const meshCount = countMeshes(currentObject);
  const { triangles, vertices } = countGeometryStats(currentObject);
  const size = getObjectSize(currentObject);

  meshStat.textContent = formatNumber(meshCount);
  triangleStat.textContent = formatNumber(triangles);
  vertexStat.textContent = formatNumber(vertices);
  animationStat.textContent = String(animationCount);
  sizeStat.textContent = `${size.x} × ${size.y} × ${size.z}`;

  saveRecentEntry({
    name: fileName,
    format: getExtension(fileName).toUpperCase(),
    triangles,
    vertices,
    openedAt: new Date().toLocaleString()
  });

  modelMeta.textContent = `文件：${fileName} | 网格：${formatNumber(meshCount)} | 三角面：${formatNumber(triangles)}`;
}

function resetStats() {
  formatStat.textContent = "-";
  meshStat.textContent = "-";
  triangleStat.textContent = "-";
  vertexStat.textContent = "-";
  animationStat.textContent = "0";
  sizeStat.textContent = "-";
}

function countMeshes(object) {
  let count = 0;
  object?.traverse((child) => {
    if (child.isMesh) {
      count += 1;
    }
  });
  return count;
}

function countGeometryStats(object) {
  let triangles = 0;
  let vertices = 0;

  object?.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    const geometry = child.geometry;
    const position = geometry.getAttribute("position");

    if (position) {
      vertices += position.count;
    }

    if (geometry.index) {
      triangles += geometry.index.count / 3;
    } else if (position) {
      triangles += position.count / 3;
    }
  });

  return {
    triangles: Math.round(triangles),
    vertices: Math.round(vertices)
  };
}

function getObjectSize(object) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  return {
    x: size.x.toFixed(2),
    y: size.y.toFixed(2),
    z: size.z.toFixed(2)
  };
}

function toggleAutoRotate() {
  controls.autoRotate = !controls.autoRotate;
  updateAutoRotateButton();
}

function updateAutoRotateButton() {
  autoRotateButton.classList.toggle("active", controls.autoRotate);
  autoRotateButton.textContent = `自动旋转：${controls.autoRotate ? "开" : "关"}`;
}

function toggleWireframe() {
  isWireframe = !isWireframe;
  updateWireframeButton();
  applyWireframeState();
}

function updateWireframeButton() {
  wireframeButton.classList.toggle("active", isWireframe);
  wireframeButton.textContent = `线框模式：${isWireframe ? "开" : "关"}`;
}

function applyWireframeState() {
  currentObject?.traverse((child) => {
    if (!child.isMesh || !child.material) {
      return;
    }

    const materials = Array.isArray(child.material) ? child.material : [child.material];
    for (const material of materials) {
      if ("wireframe" in material) {
        material.wireframe = isWireframe;
      }
    }
  });
}

function toggleGrid() {
  isGridVisible = !isGridVisible;
  grid.visible = isGridVisible;
  ground.visible = isGridVisible;
  updateGridButton();
}

function updateGridButton() {
  gridButton.classList.toggle("active", isGridVisible);
  gridButton.textContent = `地面网格：${isGridVisible ? "开" : "关"}`;
}

function toggleStereoMode() {
  isStereoEnabled = !isStereoEnabled;
  captureStereoReferenceCamera();

  if (isStereoEnabled) {
    if (document.fullscreenElement === viewerShell) {
      maybeActivateStereoDisplay();
    } else {
      setStatus("裸眼 3D 已开启，进入全屏后生效");
    }
  } else {
    deactivateStereoDisplay();
    setStatus("裸眼 3D 已关闭");
  }

  updateStereoButton();
}

function updateStereoButton() {
  const runtimeReady = Boolean(window.Module?.loaded);
  const trackerConnected = Boolean(stereoTracker?.ws && stereoTracker.ws.readyState === WebSocket.OPEN);
  const suffix = isStereoEnabled ? "开" : "关";
  const stereoActive = isStereoDisplayActive && document.fullscreenElement === viewerShell;

  stereoButton.classList.toggle("active", isStereoEnabled);
  stereoButton.classList.toggle("stereo-live", stereoActive);
  stereoButton.textContent = `裸眼 3D：${suffix}`;
  stereoButton.title = runtimeReady
    ? trackerConnected
      ? "设备服务已连接，进入全屏后可启用立体显示"
      : "立体渲染引擎已加载，未检测到设备追踪服务时将使用固定视角立体显示"
    : "立体渲染引擎正在初始化";

  if (stereoDeviceBadge) {
    stereoDeviceBadge.classList.remove("online", "ready", "offline");

    if (stereoActive) {
      stereoDeviceBadge.classList.add("ready");
      stereoDeviceBadge.textContent = trackerConnected ? "立体输出中" : "固定视角输出中";
    } else if (trackerConnected) {
      stereoDeviceBadge.classList.add("online");
      stereoDeviceBadge.textContent = "设备已连接";
    } else {
      stereoDeviceBadge.classList.add("offline");
      stereoDeviceBadge.textContent = runtimeReady ? "设备未连接" : "引擎初始化中";
    }
  }

  if (stereoStatusDetail) {
    if (stereoActive) {
      stereoStatusDetail.textContent = trackerConnected
        ? "当前已经进入裸眼 3D 全屏显示。模型固定在中心，头部追踪已做弱化和平滑处理，鼠标拖拽和按住笔键移动会旋转模型，笔射线会同步显示。"
        : "当前已经进入裸眼 3D 全屏显示，但未检测到设备追踪服务，正在使用固定中心的立体输出。鼠标拖拽仍可旋转模型。";
    } else if (isStereoEnabled) {
      stereoStatusDetail.textContent = runtimeReady
        ? "裸眼 3D 已开启。进入全屏后会切到示例同款的固定中心立体显示；如果检测到设备服务，会自动启用头部追踪和笔追旋转。"
        : "裸眼 3D 已开启，正在等待立体渲染引擎初始化完成。初始化完成后进入全屏即可切到立体显示。";
    } else {
      stereoStatusDetail.textContent = "当前为普通 3D 预览模式。开启裸眼 3D 后，进入全屏即可切到立体显示。";
    }
  }
}

async function toggleFullscreen() {
  if (!document.fullscreenElement) {
    await viewerShell.requestFullscreen?.();
  } else {
    await document.exitFullscreen?.();
  }
}

function handleFullscreenChange() {
  updateFullscreenButton();
  viewerShell.classList.toggle("fullscreen-active", document.fullscreenElement === viewerShell);

  if (document.fullscreenElement === viewerShell) {
    maybeActivateStereoDisplay();
  } else {
    deactivateStereoDisplay();
  }

  setTimeout(handleResize, 50);
}

function updateFullscreenButton() {
  const isFullscreen = document.fullscreenElement === viewerShell;
  fullscreenButton.classList.toggle("active", isFullscreen);
  fullscreenButton.textContent = isFullscreen ? "退出全屏" : "全屏查看";
}

function maybeActivateStereoDisplay() {
  if (!isStereoEnabled || !window.Module?.loaded) {
    updateStereoButton();
    return;
  }

  isStereoDisplayActive = true;
  controls.enabled = false;
  updateStereoSceneFit();
  syncStereoRuntimeParams();

  try {
    stereoTracker?.setDisplayMode?.(1, 1);
  } catch {}

  setStatus("裸眼 3D 全屏模式已启用");
  updateStereoButton();
}

function deactivateStereoDisplay() {
  if (!isStereoDisplayActive) {
    controls.enabled = true;
    resetStereoSceneFit();
    resetPenInteractionState();
    stylusRaycaster?.updatePose(null);
    if (stylusRaycaster) {
      stylusRaycaster.line.visible = false;
      stylusRaycaster.helper.visible = false;
    }
    smoothedEyeOffset.set(0, 0, 0);
    isPointerModelRotating = false;
    activePointerId = null;
    updateStereoButton();
    return;
  }

  isStereoDisplayActive = false;
  controls.enabled = true;

  try {
    stereoTracker?.setDisplayMode?.(0, 0);
  } catch {}

  resetStereoSceneFit();
  resetPenInteractionState();
  stylusRaycaster?.updatePose(null);
  if (stylusRaycaster) {
    stylusRaycaster.line.visible = false;
    stylusRaycaster.helper.visible = false;
  }
  smoothedEyeOffset.set(0, 0, 0);
  isPointerModelRotating = false;
  activePointerId = null;

  updateStereoButton();
}

function captureStereoReferenceCamera() {
  stereoBaseCameraPosition = camera.position.clone();
  stereoBaseTarget = controls.target.clone();
}

function updateStereoSceneFit() {
  if (!currentObject) {
    resetStereoSceneFit();
    return;
  }

  previewRoot.position.set(0, 0, 0);
  previewRoot.scale.setScalar(1);
  previewRoot.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(currentObject);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const stereoScale = stereoConfig.fitSize / maxDim;
  const stereoTarget = new THREE.Vector3(0, 0, stereoConfig.targetDepth);

  previewRoot.scale.setScalar(stereoScale);
  previewRoot.position.copy(stereoTarget).sub(center.multiplyScalar(stereoScale));
  previewRoot.updateMatrixWorld(true);

  stereoBaseTarget.copy(stereoTarget);
  stereoBaseCameraPosition = new THREE.Vector3(0, 0, stereoConfig.cameraDistance);
  smoothedEyeOffset.set(0, 0, 0);

  stereoCamera.position.copy(stereoBaseCameraPosition);
  stereoCamera.near = 0.01;
  stereoCamera.far = 10;
  stereoCamera.aspect = camera.aspect;
  stereoCamera.lookAt(stereoBaseTarget);
  stereoCamera.updateProjectionMatrix();
}

function resetStereoSceneFit() {
  previewRoot.position.set(0, 0, 0);
  previewRoot.scale.setScalar(1);
  previewRoot.updateMatrixWorld(true);
}

function isStereoInteractive() {
  return isStereoDisplayActive && document.fullscreenElement === viewerShell && Boolean(currentObject);
}

function handleViewerPointerDown(event) {
  if (!isStereoInteractive() || event.button !== 0) {
    return;
  }

  isPointerModelRotating = true;
  activePointerId = event.pointerId;
  pointerStart = { x: event.clientX, y: event.clientY };
  modelRotationOnPointerStart.copy(currentObject.rotation);
  renderer.domElement.setPointerCapture?.(event.pointerId);
  setStatus("裸眼 3D 交互中：拖拽可旋转模型");
}

function handleViewerPointerMove(event) {
  if (!isPointerModelRotating || activePointerId !== event.pointerId || !currentObject) {
    return;
  }

  const deltaX = event.clientX - pointerStart.x;
  const deltaY = event.clientY - pointerStart.y;
  const rotationSpeed = 0.008;

  currentObject.rotation.order = "YXZ";
  currentObject.rotation.y = modelRotationOnPointerStart.y + deltaX * rotationSpeed;
  currentObject.rotation.x = THREE.MathUtils.clamp(
    modelRotationOnPointerStart.x + deltaY * rotationSpeed,
    -Math.PI / 2,
    Math.PI / 2
  );
}

function handleViewerPointerUp(event) {
  if (activePointerId !== null && event.pointerId !== undefined && activePointerId !== event.pointerId) {
    return;
  }

  isPointerModelRotating = false;
  activePointerId = null;
}

function resetPenInteractionState() {
  lastPenPose = null;
  wasPenPressed = false;
  isPenGrabbingModel = false;
  penGrabStartPose = null;
  penGrabStartRotation = null;
  penGrabHitPointLocal = null;
}

function getCurrentModelMeshes() {
  const meshes = [];

  currentObject?.traverse((child) => {
    if (child.isMesh) {
      meshes.push(child);
    }
  });

  return meshes;
}

function updateStylusRay() {
  if (!stylusRaycaster) {
    return;
  }

  if (!isStereoInteractive()) {
    stylusRaycaster.line.visible = false;
    stylusRaycaster.helper.visible = false;
    stylusRaycaster.updatePose(null);
    lastStylusIntersections = [];
    return;
  }

  const pen = stereoTrackingData?.pen;
  if (!pen) {
    stylusRaycaster.line.visible = false;
    stylusRaycaster.helper.visible = false;
    stylusRaycaster.updatePose(null);
    lastStylusIntersections = [];
    return;
  }

  stylusRaycaster.line.visible = true;
  stylusRaycaster.helper.visible = true;
  stylusRaycaster.updatePose(pen);

  if (isPenGrabbingModel && currentObject && penGrabHitPointLocal) {
    const lockedHitPoint = currentObject.localToWorld(penGrabHitPointLocal.clone());
    stylusRaycaster.helper.position.copy(lockedHitPoint);
    lastStylusIntersections = [];
    return;
  }

  lastStylusIntersections = stylusRaycaster.intersectObjects(getCurrentModelMeshes());
}

function getStylusPoseInPreviewRoot() {
  if (!stylusRaycaster) {
    return null;
  }

  const localPosition = previewRoot.worldToLocal(stylusRaycaster.line.position.clone());
  const previewRootWorldQuaternion = previewRoot.getWorldQuaternion(new THREE.Quaternion());
  const lineWorldQuaternion = stylusRaycaster.line.getWorldQuaternion(new THREE.Quaternion());
  const localQuaternion = previewRootWorldQuaternion.invert().multiply(lineWorldQuaternion);

  return {
    position: localPosition,
    quaternion: localQuaternion
  };
}

function beginPenGrab(pen) {
  if (!currentObject || !lastStylusIntersections.length) {
    return false;
  }

  const stylusPose = getStylusPoseInPreviewRoot();
  if (!stylusPose) {
    return false;
  }

  penGrabStartPose = {
    x: pen.pos.x,
    y: pen.pos.y,
    z: pen.pos.z
  };
  penGrabHitPointLocal = currentObject.worldToLocal(lastStylusIntersections[0].point.clone());
  penGrabStartPosition.copy(currentObject.position);
  penGrabStartQuaternion.copy(currentObject.quaternion);
  penGrabStartScale.copy(currentObject.scale);
  penGrabStartRotation = {
    stylusQuaternion: stylusPose.quaternion.clone(),
    offset: currentObject.position.clone().sub(stylusPose.position).applyQuaternion(currentObject.quaternion.clone().invert()),
    rotationOffset: stylusPose.quaternion.clone().invert().multiply(currentObject.quaternion.clone())
  };
  isPenGrabbingModel = true;
  setStatus("笔已抓住模型：移动、旋转、前后推进都可控制模型");
  return true;
}

function updatePenGrab(pen) {
  if (!isPenGrabbingModel || !currentObject || !penGrabStartPose || !penGrabStartRotation) {
    return;
  }

  const stylusPose = getStylusPoseInPreviewRoot();
  if (!stylusPose) {
    return;
  }

  const nextQuaternion = stylusPose.quaternion.clone().multiply(penGrabStartRotation.rotationOffset);
  currentObject.quaternion.copy(nextQuaternion);

  const nextPosition = penGrabStartRotation.offset.clone().applyQuaternion(nextQuaternion).add(stylusPose.position);
  currentObject.position.copy(nextPosition);

  const depthDelta = penGrabStartPose.z - pen.pos.z;
  const scaleFactor = THREE.MathUtils.clamp(1 + depthDelta * stereoConfig.penScaleSpeed, 0.35, 3.5);
  currentObject.scale.copy(penGrabStartScale).multiplyScalar(scaleFactor);
}

function applyPenManipulation() {
  if (!isStereoInteractive() || !currentObject) {
    resetPenInteractionState();
    return;
  }

  const pen = stereoTrackingData?.pen;
  const penPressed = Number(stereoTrackingData?.penKey || 0) > 0;

  if (!pen || !pen.pos) {
    resetPenInteractionState();
    return;
  }

  if (!penPressed) {
    if (isPenGrabbingModel || wasPenPressed) {
      setStatus("裸眼 3D 笔追已松开");
    }
    resetPenInteractionState();
    return;
  }

  if (!wasPenPressed) {
    wasPenPressed = true;
    lastPenPose = {
      x: pen.pos.x,
      y: pen.pos.y,
      z: pen.pos.z
    };
    if (!beginPenGrab(pen)) {
      setStatus("笔已按下：请用射线命中模型后再抓取");
    }
  }

  if (isPenGrabbingModel) {
    updatePenGrab(pen);
  }

  lastPenPose = {
    x: pen.pos.x,
    y: pen.pos.y,
    z: pen.pos.z
  };
  wasPenPressed = true;
}

function updateStereoTrackedCamera() {
  if (!isStereoDisplayActive || !stereoBaseCameraPosition) {
    return;
  }

  const eyePos = stereoTrackingData?.eye?.pos;
  stereoCamera.position.copy(stereoBaseCameraPosition);

  if (eyePos) {
    const targetEyeOffset = new THREE.Vector3(
      eyePos.x * stereoConfig.trackingScaleX,
      eyePos.y * stereoConfig.trackingScaleY,
      -eyePos.z * stereoConfig.trackingScaleZ
    ).multiplyScalar(stereoConfig.trackingScale);

    smoothedEyeOffset.lerp(targetEyeOffset, stereoConfig.trackingSmoothing);
  }

  stereoCamera.position.add(smoothedEyeOffset);
  stereoCamera.lookAt(stereoBaseTarget);
}

function applyStereoCameraFrustum(targetCamera) {
  const runtimeModule = window.Module;
  if (!runtimeModule?.loaded || typeof runtimeModule.getFrustumValue !== "function") {
    return;
  }

  const position = {
    x: targetCamera.position.x,
    y: targetCamera.position.y,
    z: targetCamera.position.z
  };

  const matrix = runtimeModule.getFrustumValue(position);
  if (!matrix) {
    return;
  }

  targetCamera.projectionMatrix.set(
    matrix.m00, matrix.m01, matrix.m02, matrix.m03,
    matrix.m10, matrix.m11, matrix.m12, matrix.m13,
    matrix.m20, matrix.m21, matrix.m22, matrix.m23,
    matrix.m30, matrix.m31, matrix.m32, matrix.m33
  );
}

function syncStereoRuntimeParams() {
  const runtimeModule = window.Module;
  if (!runtimeModule?.loaded) {
    return;
  }

  const activeCamera = isStereoDisplayActive ? stereoCamera : camera;

  if (typeof runtimeModule._setScreenParams === "function") {
    runtimeModule._setScreenParams(
      stereoConfig.screenWidth,
      stereoConfig.screenHeight,
      stereoConfig.screenScale
    );
  }

  if (typeof runtimeModule._setCameraParams === "function") {
    runtimeModule._setCameraParams(activeCamera.near, activeCamera.far);
  }
}

function exportPng() {
  if (!currentObject) {
    setStatus("请先加载模型");
    return;
  }

  renderer.render(scene, camera);
  const link = document.createElement("a");
  link.href = renderer.domElement.toDataURL("image/png");
  link.download = `${stripExtension(modelName.textContent || "model")}-preview.png`;
  link.click();
  setStatus("PNG 已导出");
}

function applyTheme(theme) {
  viewerShell.classList.remove("theme-studio", "theme-dark");

  if (theme === "studio") {
    viewerShell.classList.add("theme-studio");
    scene.background = new THREE.Color(0xe8ecef);
    scene.fog = new THREE.Fog(0xe8ecef, 20, 50);
    groundMaterial.color.set(0xe7eaee);
    return;
  }

  if (theme === "dark") {
    viewerShell.classList.add("theme-dark");
    scene.background = new THREE.Color(0x20242b);
    scene.fog = new THREE.Fog(0x20242b, 20, 55);
    groundMaterial.color.set(0x323843);
    return;
  }

  scene.background = new THREE.Color(0xf7efe4);
  scene.fog = new THREE.Fog(0xf7efe4, 18, 44);
  groundMaterial.color.set(0xf4ece1);
}

function updateLightStrength(value) {
  lightValue.textContent = `${value.toFixed(1)}x`;
  hemiLight.intensity = value;
  keyLight.intensity = value * 1.15;
  fillLight.intensity = value * 0.7;
}

function saveRecentEntry(entry) {
  const current = JSON.parse(localStorage.getItem(recentStorageKey) || "[]");
  const next = [entry, ...current.filter((item) => item.name !== entry.name)].slice(0, 6);
  localStorage.setItem(recentStorageKey, JSON.stringify(next));
  renderRecentEntries(next);
}

function loadRecentEntries() {
  renderRecentEntries(JSON.parse(localStorage.getItem(recentStorageKey) || "[]"));
}

function renderRecentEntries(items) {
  if (!items || items.length === 0) {
    recentList.innerHTML = "<li>还没有历史记录</li>";
    return;
  }

  recentList.innerHTML = items
    .map((item) => `<li><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.format)} | ${formatNumber(item.triangles)} tris | ${escapeHtml(item.openedAt)}</small></li>`)
    .join("");
}

function handleResize() {
  const width = Math.max(viewerHost.clientWidth, 1);
  const height = Math.max(viewerHost.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  stereoCamera.aspect = width / height;
  stereoCamera.updateProjectionMatrix();
  renderer.setSize(width, height);
  stereoEffect?.setSize(width, height);
  syncStereoRuntimeParams();
}

function handleControlsChange() {
  if (isStereoDisplayActive) {
    return;
  }

  captureStereoReferenceCamera();
  syncStereoRuntimeParams();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = animationClock.getDelta();

  if (animationMixer) {
    animationMixer.update(delta);
  }

  if (isStereoDisplayActive) {
    updateStereoTrackedCamera();
    updateStylusRay();
    applyPenManipulation();
    syncStereoRuntimeParams();
  }

  if (controls.enabled) {
    controls.update();
  }

  if (isStereoDisplayActive && stereoEffect && document.fullscreenElement === viewerShell) {
    stereoEffect.render(scene, stereoCamera);
  } else {
    renderer.render(scene, camera);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function stripExtension(fileName) {
  const parts = String(fileName).split(".");
  if (parts.length <= 1) return fileName;
  parts.pop();
  return parts.join(".");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatPreviewError(error) {
  const message = error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "未知预览错误";

  if (message.includes("Unexpected token") || message.includes("JSON")) {
    return "模型文件无法解析，可能文件损坏，或者并不是有效的 3D 模型文件。";
  }

  if (message.includes("KHR_draco_mesh_compression") || message.includes("Draco")) {
    return "该模型使用了 Draco 压缩，但浏览器解码失败。";
  }

  if (message.includes("EXT_meshopt_compression") || message.includes("Meshopt")) {
    return "该模型使用了 Meshopt 压缩，但浏览器解码失败。";
  }

  if (message.includes("Failed to fetch") || message.includes("404")) {
    return "模型依赖的贴图或二进制文件缺失，请将 .gltf 与对应的 .bin 和贴图文件一起上传。";
  }

  return message;
}
