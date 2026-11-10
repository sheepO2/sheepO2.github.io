import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin } from '@pixiv/three-vrm';

document.querySelectorAll('[data-vrm-gallery]').forEach((gallery) => {
  const canvas = gallery.querySelector('[data-vrm-canvas]');
  if (!canvas) return;

  const viewer = gallery.querySelector('[data-vrm-viewer]');
  const status = gallery.querySelector('[data-vrm-status]');
  const hint = viewer.querySelector('.vrm-viewer__hint');
  const title = gallery.querySelector('[data-vrm-title]');
  const description = gallery.querySelector('[data-vrm-description]');
  const author = gallery.querySelector('[data-vrm-author]');
  const version = gallery.querySelector('[data-vrm-version]');
  const current = gallery.querySelector('[data-vrm-current]');
  const works = [...gallery.querySelectorAll('[data-vrm-work]')];

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  camera.position.set(0, 1.35, 3.1);
  const controls = new OrbitControls(camera, canvas);
  controls.target.set(0, 1.05, 0);
  controls.enableDamping = true;
  // 不限制上下观察角度；放大后可绕模型完整查看。
  controls.minPolarAngle = 0;
  controls.maxPolarAngle = Math.PI;
  controls.enablePan = true;
  controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

  scene.add(new THREE.HemisphereLight(0xffffff, 0x34425b, 2.2));
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(2, 4, 3);
  scene.add(keyLight);
  const rimLight = new THREE.DirectionalLight(0x8cb9ff, 1.6);
  rimLight.position.set(-3, 2, -2);
  scene.add(rimLight);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(2.15, 64), new THREE.MeshBasicMaterial({ color: 0x8ca6cb, transparent: true, opacity: 0.18 }));
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  const loader = new GLTFLoader();
  loader.register((parser) => new VRMLoaderPlugin(parser));
  let activeVrm = null;
  let requestId = 0;
  let autoRotate = true;
  let lastFrameTime = performance.now();

  function resize() {
    const { width, height } = viewer.getBoundingClientRect();
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - lastFrameTime) / 1000, 0.05);
    lastFrameTime = now;
    if (activeVrm) {
      activeVrm.update(delta);
      if (autoRotate) activeVrm.scene.rotation.y += delta * 0.12;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  // 每次进入页面自动展示；用户点击或拖拽画布后，保持当前角度不再自动旋转。
  canvas.addEventListener('pointerdown', () => {
    if (!autoRotate) return;
    autoRotate = false;
    if (hint) hint.textContent = '已暂停自动旋转 · 拖拽旋转 · 滚轮缩放 · Shift+拖拽平移';
  });

  function disposeModel() {
    if (!activeVrm) return;
    scene.remove(activeVrm.scene);
    activeVrm.scene.traverse((node) => {
      if (node.isMesh) {
        node.geometry?.dispose();
        (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => material?.dispose());
      }
    });
    activeVrm = null;
  }

  function select(work, index) {
    const id = ++requestId;
    autoRotate = true;
    if (hint) hint.textContent = '拖拽旋转 · 滚轮缩放 · Shift+拖拽平移';
    works.forEach((item) => item.classList.toggle('is-active', item === work));
    title.textContent = work.dataset.title;
    description.textContent = work.dataset.description;
    author.textContent = work.dataset.author || '—';
    version.textContent = work.dataset.version || 'VRM';
    current.textContent = String(index + 1).padStart(2, '0');
    status.hidden = false;
    status.textContent = '正在载入作品…';

    loader.load(work.dataset.model, (gltf) => {
      if (id !== requestId) return;
      const vrm = gltf.userData.vrm;
      if (!vrm) throw new Error('此文件不是有效的 VRM 模型。');
      disposeModel();
      activeVrm = vrm;
      activeVrm.scene.rotation.y = Math.PI;
      scene.add(activeVrm.scene);
      status.hidden = true;
    }, undefined, (error) => {
      if (id !== requestId) return;
      console.error('VRM 加载失败：', error);
      status.textContent = '模型载入失败，请检查文件路径与 VRM 格式。';
    });
  }

  works.forEach((work, index) => work.addEventListener('click', () => select(work, index)));
  new ResizeObserver(resize).observe(viewer);
  resize();
  frame();
  select(works[0], 0);
});
