/**
 * Three.js 3D Rubik's Cube Engine
 * Implements hardware-accelerated 3D rendering, exact raycasting, and physical circular layer rotation.
 */

const COLOR_MAP = {
  'U': 0xf5f5f7, // White
  'D': 0xf6d32d, // Yellow
  'F': 0x22c55e, // Green
  'B': 0x1d78f2, // Blue
  'L': 0xff9a1f, // Orange
  'R': 0xe63946  // Red
};

const FACE_ORDER = ['U', 'D', 'L', 'R', 'F', 'B'];

// 3D normals and positions for facelets
function getSlotGeometry(face, row, col) {
  if (face === 'U') return { pos: [col - 1, 1, row - 1], norm: [0, 1, 0] };
  if (face === 'D') return { pos: [col - 1, -1, 1 - row], norm: [0, -1, 0] };
  if (face === 'F') return { pos: [col - 1, 1 - row, 1], norm: [0, 0, 1] };
  if (face === 'B') return { pos: [1 - col, 1 - row, -1], norm: [0, 0, -1] };
  if (face === 'R') return { pos: [1, 1 - row, 1 - col], norm: [1, 0, 0] };
  if (face === 'L') return { pos: [-1, 1 - row, col - 1], norm: [-1, 0, 0] };
  throw new Error('Unknown face: ' + face);
}

class Cube3D {
  constructor(containerElement, onStickerClick) {
    this.container = containerElement;
    this.onStickerClick = onStickerClick;

    this.cubies = [];
    this.stickers = [];
    this.stickerMap = new Map(); // slotIdx -> sticker mesh
    this.isAnimating = false;
    this.animationQueue = [];
    this.animDuration = 160; // ms
    this.stickerStyle = 'circles'; // 'circles' or 'tiles'

    this.hoveredSticker = null;

    this.initThree();
    this.buildCube();
    this.setupEvents();
    this.animate();
  }

  initThree() {
    let w = this.container.clientWidth;
    let h = this.container.clientHeight;
    if (!w || w <= 0) w = window.innerWidth;
    if (!h || h <= 0) h = Math.max(450, window.innerHeight - 180);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x090a0f);

    this.camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    const defPos = this.getDefaultCameraPos();
    this.camera.position.set(defPos[0], defPos[1], defPos[2]);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = false;
    this.renderer.domElement.style.touchAction = 'none';
    this.container.style.touchAction = 'none';
    this.container.appendChild(this.renderer.domElement);

    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 6.0;
    this.controls.maxDistance = 45.0;
    this.controls.enablePan = false; // Prevent panning off center
    this.controls.minPolarAngle = 0.08; // Prevent gimbal lock at top pole (White face)
    this.controls.maxPolarAngle = Math.PI - 0.08; // Prevent gimbal lock at bottom pole (Yellow face)

    // Studio Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.72);
    this.scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.55);
    dirLight1.position.set(10, 15, 10);
    this.scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.35);
    dirLight2.position.set(-10, -10, -10);
    this.scene.add(dirLight2);

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2(-999, -999);
  }

  stopAnimations() {
    clearTimeout(this._animWatchdog);
    this._animWatchdog = null;
    this.animationQueue = [];
    this.isAnimating = false;
  }

  buildCube() {
    this.stopAnimations();
    // Clear existing
    this.cubies.forEach(c => this.scene.remove(c));
    this.cubies = [];
    this.stickers = [];
    this.stickerMap.clear();

    const cubieGeo = new THREE.BoxGeometry(0.96, 0.96, 0.96);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x121418,
      roughness: 0.45,
      metalness: 0.1
    });

    // 27 Cubie base meshes
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          const cubie = new THREE.Mesh(cubieGeo, bodyMat.clone());
          cubie.position.set(x, y, z);
          cubie.userData = { origX: x, origY: y, origZ: z };
          this.scene.add(cubie);
          this.cubies.push(cubie);
        }
      }
    }

    // 54 Outer Stickers
    let slotIdx = 0;
    FACE_ORDER.forEach(face => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const geom = getSlotGeometry(face, r, c);
          const cubie = this.getCubieAt(geom.pos[0], geom.pos[1], geom.pos[2]);

          const sticker = this.createStickerMesh(face, geom.norm, r, c, slotIdx);
          cubie.add(sticker);

          this.stickers.push(sticker);
          this.stickerMap.set(slotIdx, sticker);
          slotIdx++;
        }
      }
    });
  }

  createStickerMesh(face, norm, row, col, slotIdx) {
    let geo;
    if (this.stickerStyle === 'circles') {
      geo = new THREE.CircleGeometry(0.38, 32);
    } else {
      geo = new THREE.PlaneGeometry(0.80, 0.80);
    }

    const colHex = COLOR_MAP[face];
    const mat = new THREE.MeshStandardMaterial({
      color: colHex,
      roughness: 0.25,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geo, mat);

    // Position on cubie face slightly offset (0.485 = half width 0.48 + 0.005)
    const offset = 0.485;
    mesh.position.set(norm[0] * offset, norm[1] * offset, norm[2] * offset);

    // Rotate plane to face normal
    if (norm[0] === 1) mesh.rotation.y = Math.PI / 2;
    else if (norm[0] === -1) mesh.rotation.y = -Math.PI / 2;
    else if (norm[1] === 1) mesh.rotation.x = -Math.PI / 2;
    else if (norm[1] === -1) mesh.rotation.x = Math.PI / 2;
    else if (norm[2] === -1) mesh.rotation.y = Math.PI;

    mesh.userData = {
      slotIdx,
      face,
      row,
      col,
      isCenter: (row === 1 && col === 1),
      colorLetter: face,
      baseColor: colHex
    };

    return mesh;
  }

  getCubieAt(x, y, z) {
    return this.cubies.find(c =>
      Math.round(c.position.x) === x &&
      Math.round(c.position.y) === y &&
      Math.round(c.position.z) === z
    );
  }

  setStickerStyle(style) {
    if (this.stickerStyle === style) return;
    this.stickerStyle = style;
    this.stickers.forEach(stk => {
      stk.geometry.dispose();
      stk.geometry = (style === 'circles')
        ? new THREE.CircleGeometry(0.38, 32)
        : new THREE.PlaneGeometry(0.80, 0.80);
    });
  }

  setAnimDuration(durationMs) {
    if (durationMs < 500) {
      this.animDuration = Math.max(35, Math.round(durationMs * 0.75));
    } else if (durationMs < 2000) {
      this.animDuration = Math.round(350 + (durationMs - 500) * 0.4);
    } else {
      this.animDuration = Math.min(2500, Math.round(950 + (durationMs - 2000) * 0.18));
    }
  }

  setState(stateArray) {
    if (!stateArray || stateArray.length !== 54) return;
    this.buildCube();
    for (let idx = 0; idx < 54; idx++) {
      const letter = stateArray[idx];
      const stk = this.stickerMap.get(idx);
      if (stk) {
        stk.userData.colorLetter = letter;
        const hex = COLOR_MAP[letter] || 0xffffff;
        stk.material.color.setHex(hex);
        stk.userData.baseColor = hex;
      }
    }
  }

  /**
   * Apply a Kociemba-format string (URFDLB order, 54 chars) back to the 3D stickers.
   * Used to restore original scrambled state after solving.
   * Kociemba order: U(0-8) R(9-17) F(18-26) D(27-35) L(36-44) B(45-53)
   * Internal FACE_ORDER: U D L R F B -> slots 0..8, 9..17, 18..26, 27..35, 36..44, 45..53
   */
  applyKociembaState(kStr) {
    if (!kStr || kStr.length !== 54) return;
    // Kociemba face index order: U=0, R=1, F=2, D=3, L=4, B=5
    // Internal slot order:       U=0, D=1, L=2, R=3, F=4, B=5
    const kFaces = ['U', 'R', 'F', 'D', 'L', 'B'];
    // Build mapping: kociemba_char_position -> letter
    // kStr[i] already IS a letter (U/R/F/D/L/B), so we just need to apply
    // each letter to the matching slot on the 3D cube via setStickerColor.

    this.buildCube();

    kFaces.forEach((face, fi) => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const kIdx   = fi * 9 + r * 3 + c;
          const letter = kStr[kIdx];
          this.setStickerColor(face, r, c, letter);
        }
      }
    });
  }

  getStickerColor(face, r, c) {
    const geom = getSlotGeometry(face, r, c);
    const cubie = this.getCubieAt(geom.pos[0], geom.pos[1], geom.pos[2]);
    if (!cubie) return face;

    const cubiePos = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    cubie.getWorldPosition(cubiePos);

    for (const child of cubie.children) {
      if (child.userData && child.userData.colorLetter) {
        child.getWorldPosition(worldPos);
        const dirX = worldPos.x - cubiePos.x;
        const dirY = worldPos.y - cubiePos.y;
        const dirZ = worldPos.z - cubiePos.z;
        const len = Math.hypot(dirX, dirY, dirZ);
        const dot = (dirX * geom.norm[0] + dirY * geom.norm[1] + dirZ * geom.norm[2]) / (len || 1);

        if (dot > 0.85) {
          return child.userData.colorLetter || face;
        }
      }
    }
    return face;
  }

  setStickerColor(face, r, c, colorLetter) {
    const geom = getSlotGeometry(face, r, c);
    const cubie = this.getCubieAt(geom.pos[0], geom.pos[1], geom.pos[2]);
    if (!cubie) return;

    const cubiePos = new THREE.Vector3();
    const worldPos = new THREE.Vector3();
    cubie.getWorldPosition(cubiePos);

    for (const child of cubie.children) {
      if (child.userData && child.userData.colorLetter) {
        child.getWorldPosition(worldPos);
        const dirX = worldPos.x - cubiePos.x;
        const dirY = worldPos.y - cubiePos.y;
        const dirZ = worldPos.z - cubiePos.z;
        const len = Math.hypot(dirX, dirY, dirZ);
        const dot = (dirX * geom.norm[0] + dirY * geom.norm[1] + dirZ * geom.norm[2]) / (len || 1);

        if (dot > 0.85) {
          if (child.userData.isCenter) return; // Locked center
          child.userData.colorLetter = colorLetter;
          const hex = COLOR_MAP[colorLetter] || 0xffffff;
          child.userData.baseColor = hex;
          child.material.color.setHex(hex);
          break;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Circular Layer Rotation Physics Animation (Uses Three.js attach/detach)
  // ---------------------------------------------------------------------------
  performMove(moveStr, onComplete) {
    if (this.isAnimating) {
      this.animationQueue.push({ moveStr, onComplete });
      return;
    }

    const face = moveStr[0];
    const suffix = moveStr.slice(1);
    let quarterTurns = 1;
    if (suffix === "'") quarterTurns = -1;
    else if (suffix === "2") quarterTurns = 2;

    this.isAnimating = true;

    // Find axis and rotating cubies
    const axisCoord = { 'R': 'x', 'L': 'x', 'U': 'y', 'D': 'y', 'F': 'z', 'B': 'z' }[face];
    const layerVal = { 'R': 1, 'L': -1, 'U': 1, 'D': -1, 'F': 1, 'B': -1 }[face];

    const rotAxis = {
      'x': new THREE.Vector3(1, 0, 0),
      'y': new THREE.Vector3(0, 1, 0),
      'z': new THREE.Vector3(0, 0, 1)
    }[axisCoord];

    // Angle based on face normal & quarter turns
    const totalAngle = -layerVal * quarterTurns * (Math.PI / 2);

    const layerCubies = this.cubies.filter(c => Math.round(c.position[axisCoord]) === layerVal);

    // Group for rotation
    const pivotGroup = new THREE.Group();
    this.scene.add(pivotGroup);

    // Attach cubies to pivot group preserving world space positions
    layerCubies.forEach(c => {
      pivotGroup.attach(c);
    });

    const startTime = performance.now();
    const duration = this.animDuration || 160; // ms

    const finishMove = () => {
      clearTimeout(this._animWatchdog);
      this._animWatchdog = null;

      if (pivotGroup.parent) {
        pivotGroup.setRotationFromAxisAngle(rotAxis, totalAngle);
        pivotGroup.updateMatrixWorld(true);

        // Re-attach cubies back to scene preserving world transforms
        layerCubies.forEach(c => {
          this.scene.attach(c);

          // Clean snap coordinates to exact integers
          c.position.x = Math.round(c.position.x);
          c.position.y = Math.round(c.position.y);
          c.position.z = Math.round(c.position.z);

          // Snap Euler rotations to clean multiples of 90 degrees
          const snap = (rad) => Math.round(rad / (Math.PI / 2)) * (Math.PI / 2);
          c.rotation.x = snap(c.rotation.x);
          c.rotation.y = snap(c.rotation.y);
          c.rotation.z = snap(c.rotation.z);
          c.updateMatrixWorld(true);
        });

        this.scene.remove(pivotGroup);
      }

      this.isAnimating = false;

      if (onComplete) {
        try { onComplete(); } catch (err) { console.error(err); }
      }

      // Process next queued move if any
      if (this.animationQueue.length > 0) {
        const next = this.animationQueue.shift();
        this.performMove(next.moveStr, next.onComplete);
      }
    };

    // Watchdog fallback: prevents cube from ever getting stuck if tab throttles or frame drops
    clearTimeout(this._animWatchdog);
    this._animWatchdog = setTimeout(() => {
      if (this.isAnimating) {
        finishMove();
      }
    }, Math.max(1200, duration * 3));

    const step = (now) => {
      if (!this.isAnimating) return;
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1.0);
      // Smooth easeInOutCubic
      const ease = progress < 0.5
        ? 4 * progress * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      pivotGroup.setRotationFromAxisAngle(rotAxis, totalAngle * ease);

      if (progress < 1.0) {
        requestAnimationFrame(step);
      } else {
        finishMove();
      }
    };

    requestAnimationFrame(step);
  }

  // ---------------------------------------------------------------------------
  // State Reading directly from 3D World Space
  // ---------------------------------------------------------------------------
  getState() {
    const state = [];
    const worldPos = new THREE.Vector3();
    const cubiePos = new THREE.Vector3();

    FACE_ORDER.forEach(face => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const geom = getSlotGeometry(face, r, c);
          const cubie = this.getCubieAt(geom.pos[0], geom.pos[1], geom.pos[2]);
          let letter = face;

          if (cubie) {
            cubie.getWorldPosition(cubiePos);
            for (const child of cubie.children) {
              if (child.userData && child.userData.colorLetter) {
                child.getWorldPosition(worldPos);
                const dirX = worldPos.x - cubiePos.x;
                const dirY = worldPos.y - cubiePos.y;
                const dirZ = worldPos.z - cubiePos.z;
                const len = Math.hypot(dirX, dirY, dirZ);
                const dot = (dirX * geom.norm[0] + dirY * geom.norm[1] + dirZ * geom.norm[2]) / (len || 1);

                if (dot > 0.85) {
                  letter = child.userData.colorLetter;
                  break;
                }
              }
            }
          }
          state.push(letter);
        }
      }
    });

    return state;
  }

  getKociembaString() {
    let kStr = '';
    const worldPos = new THREE.Vector3();
    const cubiePos = new THREE.Vector3();
    const KOCIEMBA_FACES = ['U', 'R', 'F', 'D', 'L', 'B'];

    KOCIEMBA_FACES.forEach(face => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const geom = getSlotGeometry(face, r, c);
          const cubie = this.getCubieAt(geom.pos[0], geom.pos[1], geom.pos[2]);
          let letter = face;

          if (cubie) {
            cubie.getWorldPosition(cubiePos);
            for (const child of cubie.children) {
              if (child.userData && child.userData.colorLetter) {
                child.getWorldPosition(worldPos);
                const dirX = worldPos.x - cubiePos.x;
                const dirY = worldPos.y - cubiePos.y;
                const dirZ = worldPos.z - cubiePos.z;
                const len = Math.hypot(dirX, dirY, dirZ);
                const dot = (dirX * geom.norm[0] + dirY * geom.norm[1] + dirZ * geom.norm[2]) / (len || 1);

                if (dot > 0.85) {
                  letter = child.userData.colorLetter;
                  break;
                }
              }
            }
          }
          kStr += letter;
        }
      }
    });

    return kStr;
  }

  // ---------------------------------------------------------------------------
  // Raycasting & Mouse Interaction
  // ---------------------------------------------------------------------------
  setupEvents() {
    let downX = 0, downY = 0;

    this.container.addEventListener('pointerdown', (e) => {
      downX = e.clientX;
      downY = e.clientY;
    });

    this.container.addEventListener('pointerup', (e) => {
      const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
      if (dist < 8) {
        this.handleClick(e);
      }
    });

    this.container.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'touch') return; // Don't run hover raycasting during finger drag on mobile
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.checkHover();
    });

    // Double-click or double-tap empty canvas space to smoothly recenter
    this.container.addEventListener('dblclick', (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.stickers);
      if (intersects.length === 0) {
        this.resetView();
        if (this.app && this.app.notify) {
          this.app.notify('🎥 3D Camera view reset to center.', 'info');
        }
      }
    });

    window.addEventListener('resize', () => this.onResize());

    // Observe container size directly for instantaneous responsive updates
    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => this.onResize());
      ro.observe(this.container);
    }

    setTimeout(() => this.onResize(), 80);
  }

  checkHover() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.stickers);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.hoveredSticker !== hit) {
        if (this.hoveredSticker) {
          this.hoveredSticker.material.emissive.setHex(0x000000);
        }
        this.hoveredSticker = hit;
        this.hoveredSticker.material.emissive.setHex(0x333333);
        this.container.style.cursor = 'pointer';
      }
    } else {
      if (this.hoveredSticker) {
        this.hoveredSticker.material.emissive.setHex(0x000000);
        this.hoveredSticker = null;
        this.container.style.cursor = 'grab';
      }
    }
  }

  handleClick(e) {
    const rect = this.container.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.stickers);

    if (intersects.length > 0) {
      const hit = intersects[0].object;
      if (this.onStickerClick) {
        this.onStickerClick(hit);
      }
    }
  }

  getDefaultCameraPos() {
    const isMobilePortrait = window.innerWidth <= 768 && (window.innerWidth < window.innerHeight);
    return isMobilePortrait ? [10.2, 7.8, 12.2] : [8.5, 6.5, 10.0];
  }

  resetView() {
    const defPos = this.getDefaultCameraPos();
    this.camera.position.set(defPos[0], defPos[1], defPos[2]);
    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  onResize() {
    let w = this.container.clientWidth;
    let h = this.container.clientHeight;
    if (!w || w <= 0) w = window.innerWidth;
    if (!h || h <= 0) h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}
