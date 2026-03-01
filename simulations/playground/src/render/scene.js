import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const CHESSBOARD_SIZE = 8;
const CHESSBOARD_CELL_SIZE = 0.84;
const CHESSBOARD_SURFACE_Y = -0.09;
const CHESS_ASSET_BASE = '/data/chess/shaiksaahir';
const CHESS_MODEL_URLS = {
  pawn: `${CHESS_ASSET_BASE}/Pawn.glb`,
  rook: `${CHESS_ASSET_BASE}/Rook.glb`,
  knight: `${CHESS_ASSET_BASE}/Knight.glb`,
  bishop: `${CHESS_ASSET_BASE}/Bishop.glb`,
  queen: `${CHESS_ASSET_BASE}/Queen.glb`,
  king: `${CHESS_ASSET_BASE}/King.glb`,
};

export class PlaygroundRenderer {
  constructor() {
    this.container = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.clock = null;
    this.resizeObserver = null;
    this.rafId = null;
    this.running = false;

    this.groundMesh = null;
    this.chessboardMesh = null;
    this.gridHelper = null;
    this.fallingMesh = null;
    this.dominoGeometry = null;
    this.chessDominoGeometry = null;
    this.dominoMeshes = [];
    this.ballGeometry = null;
    this.chessBallGeometry = null;
    this.ballMeshes = [];
    this.plankMesh = null;
    this.leverMesh = null;
    this.gateMesh = null;
    this.rampMesh = null;
    this.rollingMesh = null;

    this.effectsEnabled = true;
    this.lowPowerMode = false;
    this.sparkParticles = [];
    this.shockwaves = [];
    this.celebrationGlow = null;
    this.celebrationGlowMaterial = null;
    this.celebrationGlowTimer = 0;
    this.prevDominoSpeed = 0;
    this.prevImpactForce = 0;
    this.prevPuzzleStatus = 'idle';

    this.cameraTarget = null;
    this.cameraYaw = 0;
    this.cameraPitch = 0;
    this.cameraDistance = 0;
    this.chaosCameraPose = {
      position: new THREE.Vector3(3.6, 3.0, 5.8),
      target: new THREE.Vector3(0, 0.6, 0),
    };
    this.chessboardCameraPose = {
      position: new THREE.Vector3(0, 18.5, 17.5),
      target: new THREE.Vector3(0, 4.8, 0),
    };
    this.defaultCameraPose = this.chaosCameraPose;
    this.basicGameMode = 'chaos';
    this.chessPieceGeometries = new Map();
    this.chessAssetsLoadState = 'idle';
  }

  init(container) {
    this.container = container;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1220);

    const width = Math.max(container.clientWidth || 1, 1);
    const height = Math.max(container.clientHeight || 1, 1);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    this.camera.position.set(3.6, 3.0, 5.8);
    this.camera.lookAt(0, 0.6, 0);
    this.configureCameraStateFromPose();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();
    this.lowPowerMode = (navigator.hardwareConcurrency || 4) <= 4;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(0xffffff, 1.1);
    keyLight.position.set(4, 7, 3);
    this.scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0x99bbff, 0.35);
    fillLight.position.set(-4, 3, -2);
    this.scene.add(fillLight);

    const groundGeometry = new THREE.BoxGeometry(10, 1, 10);
    const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2a43 });
    this.groundMesh = new THREE.Mesh(groundGeometry, groundMaterial);
    this.groundMesh.position.set(0, -0.6, 0);
    this.scene.add(this.groundMesh);

    const chessboardTexture = this.createChessboardTexture(CHESSBOARD_SIZE, 56);
    const chessboardMaterial = new THREE.MeshStandardMaterial({
      map: chessboardTexture,
      color: 0xffffff,
      roughness: 0.8,
      metalness: 0.05,
    });
    const chessboardSpan = CHESSBOARD_SIZE * CHESSBOARD_CELL_SIZE;
    this.chessboardMesh = new THREE.Mesh(new THREE.PlaneGeometry(chessboardSpan, chessboardSpan), chessboardMaterial);
    this.chessboardMesh.rotation.x = -Math.PI / 2;
    this.chessboardMesh.position.set(0, CHESSBOARD_SURFACE_Y, 0);
    this.chessboardMesh.visible = false;
    this.scene.add(this.chessboardMesh);

    const cubeGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x6fc7ff });
    this.fallingMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
    this.fallingMesh.position.set(0, 2.5, 0);
    this.scene.add(this.fallingMesh);

    this.dominoGeometry = new THREE.BoxGeometry(0.08, 0.5, 0.24);
    this.chessDominoGeometry = new THREE.CylinderGeometry(0.09, 0.13, 0.48, 18);
    this.ballGeometry = new THREE.SphereGeometry(0.18, 18, 14);
    this.chessBallGeometry = new THREE.CylinderGeometry(0.08, 0.18, 0.34, 16);

    const plankGeometry = new THREE.BoxGeometry(1.0, 0.16, 0.5);
    const plankMaterial = new THREE.MeshStandardMaterial({ color: 0x7f95bd });
    this.plankMesh = new THREE.Mesh(plankGeometry, plankMaterial);
    this.plankMesh.position.set(1.55, 0.55, 0);
    this.scene.add(this.plankMesh);

    const leverGeometry = new THREE.BoxGeometry(1.4, 0.12, 0.4);
    const leverMaterial = new THREE.MeshStandardMaterial({ color: 0x5f84a8 });
    this.leverMesh = new THREE.Mesh(leverGeometry, leverMaterial);
    this.leverMesh.position.set(4.7, 0.4, 0);
    this.scene.add(this.leverMesh);

    const gateGeometry = new THREE.BoxGeometry(0.16, 0.7, 0.8);
    const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x8aa3ca });
    this.gateMesh = new THREE.Mesh(gateGeometry, gateMaterial);
    this.gateMesh.position.set(5.9, 0.35, 0);
    this.scene.add(this.gateMesh);

    const rampGeometry = new THREE.BoxGeometry(2.4, 0.16, 1.1);
    const rampMaterial = new THREE.MeshStandardMaterial({ color: 0x607898 });
    this.rampMesh = new THREE.Mesh(rampGeometry, rampMaterial);
    this.rampMesh.position.set(-1.9, 0.18, 2.0);
    this.scene.add(this.rampMesh);

    const rollingGeometry = new THREE.SphereGeometry(0.22, 22, 16);
    const rollingMaterial = new THREE.MeshStandardMaterial({ color: 0xd0e1f7 });
    this.rollingMesh = new THREE.Mesh(rollingGeometry, rollingMaterial);
    this.rollingMesh.position.set(-0.6, 0.8, 2.0);
    this.scene.add(this.rollingMesh);

    this.gridHelper = new THREE.GridHelper(8, 16, 0x3d5f92, 0x253b5c);
    this.gridHelper.position.y = -0.09;
    this.scene.add(this.gridHelper);

    const glowGeometry = new THREE.SphereGeometry(2.9, 24, 16);
    this.celebrationGlowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd46f,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.celebrationGlow = new THREE.Mesh(glowGeometry, this.celebrationGlowMaterial);
    this.celebrationGlow.position.set(2.5, 1.1, 0);
    this.celebrationGlow.visible = false;
    this.scene.add(this.celebrationGlow);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.setBasicGameMode(this.basicGameMode);
    this.preloadChessPieceGeometries();
    this.renderOnce();
  }

  setBasicGameMode(mode = 'chaos') {
    const nextMode = mode === 'chessboard' ? 'chessboard' : 'chaos';
    this.basicGameMode = nextMode;

    if (!this.groundMesh) {
      return;
    }

    this.groundMesh.material.color.setHex(nextMode === 'chessboard' ? 0x101010 : 0x1a2a43);

    if (this.gridHelper) {
      this.gridHelper.visible = nextMode !== 'chessboard';
    }
    if (this.chessboardMesh) {
      this.chessboardMesh.visible = nextMode === 'chessboard';
    }

    const showLegacyMechanisms = nextMode !== 'chessboard';
    this.setLegacyMechanismVisibility(showLegacyMechanisms);

    this.defaultCameraPose = nextMode === 'chessboard' ? this.chessboardCameraPose : this.chaosCameraPose;
    this.resetCameraView();

    this.renderOnce();
  }

  setLegacyMechanismVisibility(visible) {
    const show = Boolean(visible);
    if (this.fallingMesh) {
      this.fallingMesh.visible = show;
    }
    if (this.plankMesh) {
      this.plankMesh.visible = show;
    }
    if (this.leverMesh) {
      this.leverMesh.visible = show;
    }
    if (this.gateMesh) {
      this.gateMesh.visible = show;
    }
    if (this.rampMesh) {
      this.rampMesh.visible = show;
    }
    if (this.rollingMesh) {
      this.rollingMesh.visible = show;
    }
  }

  start() {
    if (this.running || !this.renderer) {
      return;
    }
    this.running = true;
    this.clock.start();
    this.tick();
  }

  pause() {
    if (!this.running) {
      return;
    }
    this.running = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.clock.stop();
    this.renderOnce();
  }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = Boolean(enabled);
    if (!this.effectsEnabled) {
      this.clearEffects();
      this.renderOnce();
    }
  }

  panCamera(deltaX = 0, deltaZ = 0) {
    if (!this.cameraTarget) {
      return;
    }
    this.cameraTarget.x += Number(deltaX) || 0;
    this.cameraTarget.z += Number(deltaZ) || 0;
    this.updateCameraTransform();
  }

  tiltCamera(deltaRadians = 0) {
    const delta = Number(deltaRadians) || 0;
    this.cameraPitch = Math.max(-0.25, Math.min(1.2, this.cameraPitch + delta));
    this.updateCameraTransform();
  }

  zoomCamera(deltaDistance = 0) {
    const delta = Number(deltaDistance) || 0;
    this.cameraDistance = Math.max(2.2, Math.min(18, this.cameraDistance + delta));
    this.updateCameraTransform();
  }

  resetCameraView() {
    this.camera.position.copy(this.defaultCameraPose.position);
    this.cameraTarget.copy(this.defaultCameraPose.target);
    this.configureCameraStateFromPose();
    this.updateCameraTransform();
  }

  getCameraDebugState() {
    if (!this.camera || !this.cameraTarget) {
      return null;
    }

    return {
      pan: {
        x: Number(this.cameraTarget.x.toFixed(4)),
        z: Number(this.cameraTarget.z.toFixed(4)),
      },
      zoom: {
        distance: Number(this.cameraDistance.toFixed(4)),
      },
      tilt: {
        radians: Number(this.cameraPitch.toFixed(6)),
        degrees: Number((this.cameraPitch * (180 / Math.PI)).toFixed(3)),
      },
      yaw: {
        radians: Number(this.cameraYaw.toFixed(6)),
        degrees: Number((this.cameraYaw * (180 / Math.PI)).toFixed(3)),
      },
      target: {
        x: Number(this.cameraTarget.x.toFixed(4)),
        y: Number(this.cameraTarget.y.toFixed(4)),
        z: Number(this.cameraTarget.z.toFixed(4)),
      },
      position: {
        x: Number(this.camera.position.x.toFixed(4)),
        y: Number(this.camera.position.y.toFixed(4)),
        z: Number(this.camera.position.z.toFixed(4)),
      },
    };
  }

  reset() {
    if (!this.fallingMesh) {
      return;
    }
    this.fallingMesh.position.set(0, 2.5, 0);
    this.fallingMesh.quaternion.set(0, 0, 0, 1);
    this.clearEffects();
    this.renderOnce();
  }

  applySnapshot(snapshot) {
    if (!this.fallingMesh || !snapshot) {
      return;
    }
    this.fallingMesh.position.set(snapshot.cubeX, snapshot.cubeY, snapshot.cubeZ);
    this.fallingMesh.quaternion.set(snapshot.cubeQx, snapshot.cubeQy, snapshot.cubeQz, snapshot.cubeQw);
    this.syncBallMeshes(
      snapshot.ballTransforms ?? [],
      snapshot.ballMaterialPreset ?? 'wood',
      snapshot.ballPieceVariants ?? [],
      snapshot.basicGameMode ?? this.basicGameMode
    );
    this.syncDominoMeshes(
      snapshot.dominoTransforms ?? [],
      snapshot.dominoMaterialPreset ?? 'wood',
      snapshot.dominoPieceVariants ?? [],
      snapshot.basicGameMode ?? this.basicGameMode
    );
    this.syncTriggerMechanism(snapshot.triggerMechanismTransforms);
    this.syncRollingMechanism(snapshot.rollingTransforms);
    this.processEffectTriggers(snapshot);
    if (!this.running) {
      this.renderOnce();
    }
  }

  dispose() {
    this.pause();
    if (this.resizeObserver && this.container) {
      this.resizeObserver.unobserve(this.container);
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    if (this.scene) {
      this.scene.traverse((object) => {
        if (!object.isMesh) {
          return;
        }
        object.geometry?.dispose?.();
        if (Array.isArray(object.material)) {
          for (const material of object.material) {
            material.dispose?.();
          }
        } else {
          object.material?.dispose?.();
        }
      });
    }

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
      this.renderer = null;
    }

    this.dominoMeshes = [];
    this.ballMeshes = [];
    this.dominoGeometry?.dispose();
    this.chessDominoGeometry?.dispose();
    this.ballGeometry?.dispose();
    this.chessBallGeometry?.dispose();
    for (const geometry of this.chessPieceGeometries.values()) {
      geometry?.dispose?.();
    }
    this.chessPieceGeometries.clear();
    this.dominoGeometry = null;
    this.chessDominoGeometry = null;
    this.ballGeometry = null;
    this.chessBallGeometry = null;
    this.clearEffects();
    this.plankMesh = null;
    this.leverMesh = null;
    this.gateMesh = null;
    this.rampMesh = null;
    this.rollingMesh = null;
  }

  tick() {
    if (!this.running || !this.renderer) {
      return;
    }
    const deltaSeconds = Math.min(this.clock.getDelta(), 0.05);
    this.updateEffects(deltaSeconds);
    this.renderOnce();
    this.rafId = requestAnimationFrame(() => this.tick());
  }

  renderOnce() {
    if (!this.renderer || !this.scene || !this.camera) {
      return;
    }
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) {
      return;
    }
    const width = Math.max(this.container.clientWidth || 1, 1);
    const height = Math.max(this.container.clientHeight || 1, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    this.renderOnce();
  }

  configureCameraStateFromPose() {
    this.cameraTarget = this.defaultCameraPose.target.clone();
    const offset = new THREE.Vector3().subVectors(this.camera.position, this.cameraTarget);
    const distance = Math.max(offset.length(), 0.0001);
    this.cameraDistance = distance;
    this.cameraYaw = Math.atan2(offset.x, offset.z);
    this.cameraPitch = Math.asin(offset.y / distance);
  }

  createChessboardTexture(size = 8, tilePixels = 56) {
    const boardSize = Math.max(4, Math.min(16, Math.round(size)));
    const tileSize = Math.max(16, Math.min(128, Math.round(tilePixels)));
    const canvas = document.createElement('canvas');
    const pixels = boardSize * tileSize;
    canvas.width = pixels;
    canvas.height = pixels;
    const ctx = canvas.getContext('2d');
    for (let row = 0; row < boardSize; row += 1) {
      for (let col = 0; col < boardSize; col += 1) {
        const darkSquare = (row + col) % 2 === 1;
        ctx.fillStyle = darkSquare ? '#1f1f22' : '#d8d8dc';
        ctx.fillRect(col * tileSize, row * tileSize, tileSize, tileSize);
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }

  updateCameraTransform() {
    if (!this.camera || !this.cameraTarget) {
      return;
    }
    const cosPitch = Math.cos(this.cameraPitch);
    const sinPitch = Math.sin(this.cameraPitch);
    const sinYaw = Math.sin(this.cameraYaw);
    const cosYaw = Math.cos(this.cameraYaw);

    this.camera.position.set(
      this.cameraTarget.x + this.cameraDistance * cosPitch * sinYaw,
      this.cameraTarget.y + this.cameraDistance * sinPitch,
      this.cameraTarget.z + this.cameraDistance * cosPitch * cosYaw
    );
    this.camera.lookAt(this.cameraTarget);
    this.renderOnce();
  }

  syncDominoMeshes(dominoTransforms, materialPreset, pieceVariants = [], gameMode = 'chaos') {
    const isChessboardMode = gameMode === 'chessboard';
    while (this.dominoMeshes.length < dominoTransforms.length) {
      const material = new THREE.MeshStandardMaterial({ color: this.colorForMaterial(materialPreset) });
      const mesh = new THREE.Mesh(this.dominoGeometry, material);
      this.dominoMeshes.push(mesh);
      this.scene.add(mesh);
    }

    while (this.dominoMeshes.length > dominoTransforms.length) {
      const mesh = this.dominoMeshes.pop();
      this.scene.remove(mesh);
      mesh.material?.dispose?.();
    }

    for (let index = 0; index < dominoTransforms.length; index += 1) {
      const transform = dominoTransforms[index];
      const mesh = this.dominoMeshes[index];
      const variant = pieceVariants[index] ?? null;
      const fallbackGeometry = this.chessDominoGeometry;
      const expectedGeometry = isChessboardMode
        ? this.geometryForChessVariant(variant, fallbackGeometry)
        : this.dominoGeometry;
      if (expectedGeometry && mesh.geometry !== expectedGeometry) {
        mesh.geometry = expectedGeometry;
      }
      const usingModelGeometry = isChessboardMode && expectedGeometry && expectedGeometry !== fallbackGeometry;
      mesh.scale.setScalar(usingModelGeometry ? 0.48 : 1);
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
      mesh.material.color.setHex(
        isChessboardMode ? this.colorForChessPieceVariant(variant) : this.colorForMaterial(materialPreset)
      );
      mesh.castShadow = isChessboardMode;
    }
  }

  syncBallMeshes(ballTransforms, materialPreset, pieceVariants = [], gameMode = 'chaos') {
    const isChessboardMode = gameMode === 'chessboard';
    while (this.ballMeshes.length < ballTransforms.length) {
      const material = new THREE.MeshStandardMaterial({ color: this.colorForBallMaterial(materialPreset) });
      const mesh = new THREE.Mesh(this.ballGeometry, material);
      this.ballMeshes.push(mesh);
      this.scene.add(mesh);
    }

    while (this.ballMeshes.length > ballTransforms.length) {
      const mesh = this.ballMeshes.pop();
      this.scene.remove(mesh);
      mesh.material?.dispose?.();
    }

    for (let index = 0; index < ballTransforms.length; index += 1) {
      const transform = ballTransforms[index];
      const mesh = this.ballMeshes[index];
      const variant = pieceVariants[index] ?? null;
      const fallbackGeometry = this.chessBallGeometry;
      const expectedGeometry = isChessboardMode
        ? this.geometryForChessVariant(variant, fallbackGeometry)
        : this.ballGeometry;
      if (expectedGeometry && mesh.geometry !== expectedGeometry) {
        mesh.geometry = expectedGeometry;
      }
      const usingModelGeometry = isChessboardMode && expectedGeometry && expectedGeometry !== fallbackGeometry;
      mesh.scale.setScalar(usingModelGeometry ? 0.34 : 1);
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
      mesh.material.color.setHex(
        isChessboardMode ? this.colorForChessPieceVariant(variant) : this.colorForBallMaterial(materialPreset)
      );
      mesh.castShadow = isChessboardMode;
    }
  }

  colorForChessPieceVariant(variant) {
    if (variant?.color === 'black') {
      return 0x1d1d22;
    }
    return 0xe8e8ee;
  }

  geometryForChessVariant(variant, fallbackGeometry) {
    const key = String(variant?.kind ?? '').toLowerCase();
    const geometry = this.chessPieceGeometries.get(key);
    return geometry ?? fallbackGeometry;
  }

  preloadChessPieceGeometries() {
    if (this.chessAssetsLoadState === 'loading' || this.chessAssetsLoadState === 'ready') {
      return;
    }

    this.chessAssetsLoadState = 'loading';
    const loader = new GLTFLoader();
    const jobs = Object.entries(CHESS_MODEL_URLS).map(([key, url]) =>
      new Promise((resolve) => {
        loader.load(
          url,
          (gltf) => {
            const geometry = this.extractNormalizedGeometry(gltf.scene);
            if (geometry) {
              this.chessPieceGeometries.set(key, geometry);
            }
            resolve();
          },
          undefined,
          () => resolve()
        );
      })
    );

    Promise.all(jobs)
      .then(() => {
        this.chessAssetsLoadState = 'ready';
        this.renderOnce();
      })
      .catch(() => {
        this.chessAssetsLoadState = 'error';
      });
  }

  extractNormalizedGeometry(rootObject) {
    let selected = null;
    rootObject.traverse((node) => {
      if (!selected && node.isMesh && node.geometry) {
        selected = node.geometry.clone();
      }
    });

    if (!selected) {
      return null;
    }

    selected.computeBoundingBox();
    const bounds = selected.boundingBox;
    if (!bounds) {
      return selected;
    }

    const center = new THREE.Vector3();
    const size = new THREE.Vector3();
    bounds.getCenter(center);
    bounds.getSize(size);

    const height = Math.max(size.y, 0.0001);
    const normalizeScale = 1 / height;
    selected.translate(-center.x, -center.y, -center.z);
    selected.scale(normalizeScale, normalizeScale, normalizeScale);
    selected.computeVertexNormals();
    selected.computeBoundingBox();
    return selected;
  }

  colorForMaterial(materialPreset) {
    switch (materialPreset) {
      case 'metal':
        return 0xc2cad4;
      case 'rubber':
        return 0x4fbf88;
      case 'wood':
      default:
        return 0xc08b52;
    }
  }

  colorForBallMaterial(materialPreset) {
    switch (materialPreset) {
      case 'metal':
        return 0xb8c8e0;
      case 'rubber':
        return 0x4fd481;
      case 'wood':
      default:
        return 0xcd9b63;
    }
  }

  syncTriggerMechanism(transforms) {
    if (!transforms) {
      return;
    }

    if (this.plankMesh && transforms.plank) {
      this.plankMesh.position.set(transforms.plank.x, transforms.plank.y, transforms.plank.z);
      this.plankMesh.quaternion.set(transforms.plank.qx, transforms.plank.qy, transforms.plank.qz, transforms.plank.qw);
    }

    if (this.leverMesh && transforms.lever) {
      this.leverMesh.position.set(transforms.lever.x, transforms.lever.y, transforms.lever.z);
      this.leverMesh.quaternion.set(transforms.lever.qx, transforms.lever.qy, transforms.lever.qz, transforms.lever.qw);
    }

    if (this.gateMesh && transforms.gate) {
      this.gateMesh.position.set(transforms.gate.x, transforms.gate.y, transforms.gate.z);
      this.gateMesh.quaternion.set(transforms.gate.qx, transforms.gate.qy, transforms.gate.qz, transforms.gate.qw);
    }
  }

  syncRollingMechanism(transforms) {
    if (!transforms) {
      return;
    }

    if (this.rampMesh && transforms.ramp) {
      this.rampMesh.position.set(transforms.ramp.x, transforms.ramp.y, transforms.ramp.z);
      this.rampMesh.quaternion.set(transforms.ramp.qx, transforms.ramp.qy, transforms.ramp.qz, transforms.ramp.qw);
    }

    if (this.rollingMesh && transforms.roller) {
      this.rollingMesh.position.set(transforms.roller.x, transforms.roller.y, transforms.roller.z);
      this.rollingMesh.quaternion.set(
        transforms.roller.qx,
        transforms.roller.qy,
        transforms.roller.qz,
        transforms.roller.qw
      );
    }
  }

  processEffectTriggers(snapshot) {
    if (!snapshot || !this.effectsEnabled) {
      return;
    }

    const dominoSpeed = Number(snapshot.domino?.chainSpeedPerSecond ?? 0);
    if (dominoSpeed >= 26 && dominoSpeed - this.prevDominoSpeed >= 2.5) {
      const anchor = snapshot.dominoTransforms?.[0] ?? { x: 1.2, y: 0.45, z: 0 };
      this.spawnSparkTrail(anchor.x, anchor.y + 0.08, anchor.z);
    }
    this.prevDominoSpeed = dominoSpeed;

    const impactForce = Number(snapshot.ball?.impactForceMax ?? 0);
    if (impactForce >= 6 && impactForce - this.prevImpactForce >= 0.8) {
      const impactPoint = snapshot.ballTransforms?.[0] ?? snapshot.rollingTransforms?.roller ?? snapshot;
      this.spawnShockwave(impactPoint.x ?? 0, Math.max((impactPoint.y ?? 0) - 0.18, -0.08), impactPoint.z ?? 0);
    }
    this.prevImpactForce = impactForce;

    const puzzleStatus = snapshot.puzzle?.status ?? 'idle';
    if (
      puzzleStatus === 'success' &&
      this.prevPuzzleStatus !== 'success' &&
      Number(snapshot.puzzle?.lastCompletionSeconds ?? 999) <= 3
    ) {
      this.triggerCelebrationGlow();
    }
    this.prevPuzzleStatus = puzzleStatus;
  }

  spawnSparkTrail(x, y, z) {
    if (!this.scene || !this.effectsEnabled) {
      return;
    }
    const count = this.lowPowerMode ? 8 : 18;
    for (let index = 0; index < count; index += 1) {
      const size = 0.018 + Math.random() * 0.025;
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(size, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xffcf7d, transparent: true, opacity: 0.95 })
      );
      mesh.position.set(x + (Math.random() - 0.5) * 0.15, y + Math.random() * 0.06, z + (Math.random() - 0.5) * 0.1);
      this.scene.add(mesh);
      this.sparkParticles.push({
        mesh,
        life: 0.34 + Math.random() * 0.35,
        maxLife: 0.68,
        velocity: new THREE.Vector3(0.6 + Math.random() * 1.2, 0.2 + Math.random() * 0.7, (Math.random() - 0.5) * 0.5),
      });
    }
  }

  spawnShockwave(x, y, z) {
    if (!this.scene || !this.effectsEnabled) {
      return;
    }
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.12, 0.2, 30),
      new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.set(x, y, z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.shockwaves.push({ ring, life: 0.55, maxLife: 0.55, growth: this.lowPowerMode ? 1.8 : 2.6 });
  }

  triggerCelebrationGlow() {
    if (!this.effectsEnabled) {
      return;
    }
    this.celebrationGlowTimer = this.lowPowerMode ? 1.1 : 1.8;
    if (this.celebrationGlow) {
      this.celebrationGlow.visible = true;
    }
  }

  updateEffects(deltaSeconds) {
    if (!this.effectsEnabled || !this.scene) {
      return;
    }

    for (let index = this.sparkParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.sparkParticles[index];
      particle.life -= deltaSeconds;
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry?.dispose?.();
        particle.mesh.material?.dispose?.();
        this.sparkParticles.splice(index, 1);
        continue;
      }
      particle.velocity.y -= 1.6 * deltaSeconds;
      particle.mesh.position.addScaledVector(particle.velocity, deltaSeconds);
      const opacity = Math.max(0, Math.min(1, particle.life / particle.maxLife));
      particle.mesh.material.opacity = opacity;
    }

    for (let index = this.shockwaves.length - 1; index >= 0; index -= 1) {
      const shockwave = this.shockwaves[index];
      shockwave.life -= deltaSeconds;
      if (shockwave.life <= 0) {
        this.scene.remove(shockwave.ring);
        shockwave.ring.geometry?.dispose?.();
        shockwave.ring.material?.dispose?.();
        this.shockwaves.splice(index, 1);
        continue;
      }
      const progress = 1 - shockwave.life / shockwave.maxLife;
      const scale = 1 + progress * shockwave.growth;
      shockwave.ring.scale.set(scale, scale, 1);
      shockwave.ring.material.opacity = Math.max(0, 1 - progress * 1.2);
    }

    if (this.celebrationGlow && this.celebrationGlowMaterial) {
      if (this.celebrationGlowTimer > 0) {
        this.celebrationGlowTimer -= deltaSeconds;
        const pulse = 0.35 + 0.25 * Math.sin(performance.now() * 0.012);
        this.celebrationGlow.visible = true;
        this.celebrationGlowMaterial.opacity = Math.max(0, pulse * (this.celebrationGlowTimer / 1.8));
      } else {
        this.celebrationGlow.visible = false;
        this.celebrationGlowMaterial.opacity = 0;
      }
    }
  }

  clearEffects() {
    if (this.scene) {
      for (const particle of this.sparkParticles) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry?.dispose?.();
        particle.mesh.material?.dispose?.();
      }
      for (const shockwave of this.shockwaves) {
        this.scene.remove(shockwave.ring);
        shockwave.ring.geometry?.dispose?.();
        shockwave.ring.material?.dispose?.();
      }
    }
    this.sparkParticles = [];
    this.shockwaves = [];
    this.celebrationGlowTimer = 0;
    if (this.celebrationGlow) {
      this.celebrationGlow.visible = false;
    }
    if (this.celebrationGlowMaterial) {
      this.celebrationGlowMaterial.opacity = 0;
    }
    this.prevDominoSpeed = 0;
    this.prevImpactForce = 0;
    this.prevPuzzleStatus = 'idle';
  }
}
