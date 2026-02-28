import * as THREE from 'three';

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
    this.fallingMesh = null;
    this.dominoGeometry = null;
    this.dominoMeshes = [];
    this.ballGeometry = null;
    this.ballMeshes = [];
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

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    container.appendChild(this.renderer.domElement);

    this.clock = new THREE.Clock();

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

    const cubeGeometry = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const cubeMaterial = new THREE.MeshStandardMaterial({ color: 0x6fc7ff });
    this.fallingMesh = new THREE.Mesh(cubeGeometry, cubeMaterial);
    this.fallingMesh.position.set(0, 2.5, 0);
    this.scene.add(this.fallingMesh);

    this.dominoGeometry = new THREE.BoxGeometry(0.08, 0.5, 0.24);
    this.ballGeometry = new THREE.SphereGeometry(0.18, 18, 14);

    const grid = new THREE.GridHelper(8, 16, 0x3d5f92, 0x253b5c);
    grid.position.y = -0.09;
    this.scene.add(grid);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderOnce();
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

  reset() {
    if (!this.fallingMesh) {
      return;
    }
    this.fallingMesh.position.set(0, 2.5, 0);
    this.fallingMesh.quaternion.set(0, 0, 0, 1);
    this.renderOnce();
  }

  applySnapshot(snapshot) {
    if (!this.fallingMesh || !snapshot) {
      return;
    }
    this.fallingMesh.position.set(snapshot.cubeX, snapshot.cubeY, snapshot.cubeZ);
    this.fallingMesh.quaternion.set(snapshot.cubeQx, snapshot.cubeQy, snapshot.cubeQz, snapshot.cubeQw);
    this.syncBallMeshes(snapshot.ballTransforms ?? [], snapshot.ballMaterialPreset ?? 'wood');
    this.syncDominoMeshes(snapshot.dominoTransforms ?? [], snapshot.dominoMaterialPreset ?? 'wood');
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
    this.ballGeometry?.dispose();
    this.dominoGeometry = null;
    this.ballGeometry = null;
  }

  tick() {
    if (!this.running || !this.renderer) {
      return;
    }
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

  syncDominoMeshes(dominoTransforms, materialPreset) {
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
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
      mesh.material.color.setHex(this.colorForMaterial(materialPreset));
    }
  }

  syncBallMeshes(ballTransforms, materialPreset) {
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
      mesh.position.set(transform.x, transform.y, transform.z);
      mesh.quaternion.set(transform.qx, transform.qy, transform.qz, transform.qw);
      mesh.material.color.setHex(this.colorForBallMaterial(materialPreset));
    }
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
}
