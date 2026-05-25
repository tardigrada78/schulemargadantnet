// MindMap3D — einbettbare 3D-Baumkarte (extrahiert aus mindmap3d.html)
// Benötigt Three.js r128 als globale Variable (window.THREE)

const DEPTH_COLORS   = ['#8B5E3C','#a0784a','#6db35a','#7dc962','#a8e06a','#cdf08a'];
const DEPTH_EMISSIVE = ['#3a1f08','#4a2e0a','#1a4010','#1e5012','#2a5a10','#3a6a18'];
const DEPTH_SIZES    = [2.0, 1.3, 0.9, 0.68, 0.52, 0.4];
const BRANCH_RADII   = [0.38, 0.22, 0.13, 0.08, 0.055, 0.038];

class MindMap3D {
  constructor(container) {
    this.container = container;
    this._animFrameId = null;
    this._mouse = { x: 0, y: 0, btn: 0, down: false, moved: false };
    this._touches = [];
    this._touchMode = 'none';

    this._INIT_SPH = { theta: 0.4, phi: 1.25, radius: 30 };
    this._spherical       = { ...this._INIT_SPH };
    this._targetSpherical = { ...this._INIT_SPH };
    this._INIT_PIVOT = new THREE.Vector3(0, 3, 0);
    this._pivot       = new THREE.Vector3(0, 3, 0);
    this._targetPivot = new THREE.Vector3(0, 3, 0);

    this._nodeMeshes = [];
    this._nodeDataMap = {};
    this._selectedId = null;
    this._allFadeables = [];
    this._branchByNode = {};

    this._initScene();
    this._initUI();
    this._initEvents();
    this._clock = new THREE.Clock();
    this._animate();
  }

  // ─── PUBLIC API ─────────────────────────────────────────────────────────────

  render(mermaidCode) {
    const nodes = this._parseMermaid(mermaidCode);
    this._buildGraph(nodes);
    this._resetView();
  }

  destroy() {
    if (this._animFrameId) cancelAnimationFrame(this._animFrameId);
    if (this._resizeObserver) this._resizeObserver.disconnect();
    if (this._renderer) this._renderer.dispose();
    this.container.innerHTML = '';
    document.removeEventListener('fullscreenchange', this._onFullscreenChange);
  }

  toggleFullscreen() {
    if (document.fullscreenElement === this.container) {
      document.exitFullscreen();
    } else {
      this.container.requestFullscreen();
    }
  }

  // ─── SCENE SETUP ────────────────────────────────────────────────────────────

  _initScene() {
    const W = this.container.clientWidth  || 800;
    const H = this.container.clientHeight || 520;

    this._scene = new THREE.Scene();
    this._scene.fog = new THREE.FogExp2(0x0a0a14, 0.012);

    this._camera = new THREE.PerspectiveCamera(55, W / H, 0.1, 800);
    this._camera.position.set(0, 4, 30);

    this._renderer = new THREE.WebGLRenderer({ antialias: true });
    this._renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this._renderer.setSize(W, H);
    this._renderer.setClearColor(0x0a0a14, 1);
    this._renderer.shadowMap.enabled = true;
    this._renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this._renderer.domElement);

    this._scene.add(new THREE.AmbientLight(0x0a0a1a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff4d0, 1.8);
    sun.position.set(15, 40, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    this._scene.add(sun);
    this._scene.add(new THREE.HemisphereLight(0x3020aa, 0x050510, 0.9));
    const groundGlow = new THREE.PointLight(0x4010aa, 2.0, 60);
    groundGlow.position.set(0, -8, 0);
    this._scene.add(groundGlow);

    // Dust particles
    const geo = new THREE.BufferGeometry();
    const pos = [];
    for (let i = 0; i < 600; i++)
      pos.push((Math.random() - .5) * 120, Math.random() * 60 - 5, (Math.random() - .5) * 120);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this._scene.add(new THREE.Points(geo, new THREE.PointsMaterial({
      color: 0x8866ff, size: 0.18, transparent: true, opacity: 0.35
    })));

    // Ground
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(55, 64),
      new THREE.MeshStandardMaterial({ color: 0x1a1020, roughness: 0.95, metalness: 0.0, transparent: true, opacity: 0.6 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -10;
    ground.receiveShadow = true;
    this._scene.add(ground);

    this._graphGroup = new THREE.Group();
    this._scene.add(this._graphGroup);

    this._raycaster = new THREE.Raycaster();
    this._mouseNDC  = new THREE.Vector2();
  }

  // ─── UI OVERLAYS ────────────────────────────────────────────────────────────

  _initUI() {
    this._tooltip = this._makeDiv('mm3d-tooltip');
    this._legend  = this._makeDiv('mm3d-legend');
    this._breadcrumb = this._makeDiv('mm3d-breadcrumb');

    const controls = this._makeDiv('mm3d-controls');
    controls.innerHTML = 'LINKS-DRAG — Rotieren<br>RECHTS-DRAG — Verschieben<br>SCROLL — Zoomen<br>KLICK — Zentrieren';

    this._resetBtn = this._makeDiv('mm3d-reset-btn');
    this._resetBtn.textContent = '↺  RESET';
    this._resetBtn.style.cursor = 'pointer';
    this._resetBtn.addEventListener('click', () => this._resetView());

    this._fsBtn = this._makeDiv('mm3d-fullscreen-btn');
    this._fsBtn.textContent = '⛶  FULLSCREEN';
    this._fsBtn.style.cursor = 'pointer';
    this._fsBtn.addEventListener('click', () => this.toggleFullscreen());
  }

  _makeDiv(cls) {
    const el = document.createElement('div');
    el.className = cls;
    this.container.appendChild(el);
    return el;
  }

  // ─── EVENTS ─────────────────────────────────────────────────────────────────

  _initEvents() {
    const el = this._renderer.domElement;

    el.addEventListener('contextmenu', e => e.preventDefault());

    el.addEventListener('mousedown', e => {
      this._mouse.down = true;
      this._mouse.btn  = e.button;
      this._mouse.x    = e.clientX;
      this._mouse.y    = e.clientY;
      this._mouse.moved = false;
    });

    el.addEventListener('mousemove', e => {
      if (!this._mouse.down) {
        this._updateTooltip(e);
        return;
      }
      const dx = e.clientX - this._mouse.x;
      const dy = e.clientY - this._mouse.y;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._mouse.moved = true;
      this._mouse.x = e.clientX;
      this._mouse.y = e.clientY;
      if (this._mouse.btn === 0) {
        this._targetSpherical.theta -= dx * 0.007;
        this._targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this._targetSpherical.phi + dy * 0.007));
      } else {
        this._panPivot(dx, dy);
      }
    });

    el.addEventListener('mouseup', () => { this._mouse.down = false; });
    el.addEventListener('mouseleave', () => { this._tooltip.style.display = 'none'; });

    el.addEventListener('wheel', e => {
      this._targetSpherical.radius = Math.max(4, Math.min(100, this._targetSpherical.radius + e.deltaY * 0.04));
    }, { passive: true });

    el.addEventListener('touchstart', e => {
      this._touches = [...e.touches];
      this._mouse.moved = false;
      this._touchMode = e.touches.length === 1 ? 'rotate' : 'pan-zoom';
    });

    el.addEventListener('touchmove', e => {
      e.preventDefault();
      const t = e.touches;
      if (t.length === 1 && this._touchMode === 'rotate') {
        const dx = t[0].clientX - this._touches[0].clientX;
        const dy = t[0].clientY - this._touches[0].clientY;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) this._mouse.moved = true;
        this._targetSpherical.theta -= dx * 0.007;
        this._targetSpherical.phi = Math.max(0.1, Math.min(Math.PI - 0.1, this._targetSpherical.phi + dy * 0.007));
      } else if (t.length === 2 && this._touches.length >= 2) {
        const pm = { x: (this._touches[0].clientX + this._touches[1].clientX) * 0.5, y: (this._touches[0].clientY + this._touches[1].clientY) * 0.5 };
        const cm = { x: (t[0].clientX + t[1].clientX) * 0.5, y: (t[0].clientY + t[1].clientY) * 0.5 };
        const pd = Math.hypot(this._touches[0].clientX - this._touches[1].clientX, this._touches[0].clientY - this._touches[1].clientY);
        const cd = Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
        this._targetSpherical.radius = Math.max(4, Math.min(100, this._targetSpherical.radius - (cd - pd) * 0.05));
        const mdx = cm.x - pm.x, mdy = cm.y - pm.y;
        if (Math.abs(mdx) > 0.5 || Math.abs(mdy) > 0.5) { this._mouse.moved = true; this._panPivot(mdx, mdy); }
      }
      this._touches = [...t];
    }, { passive: false });

    el.addEventListener('touchend', e => {
      this._touches = [...e.touches];
      this._touchMode = this._touches.length === 0 ? 'none' : this._touches.length === 1 ? 'rotate' : 'pan-zoom';
    });

    el.addEventListener('click', e => {
      if (this._mouse.moved) return;
      const rect = el.getBoundingClientRect();
      this._mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
      this._mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
      this._raycaster.setFromCamera(this._mouseNDC, this._camera);
      const hits = this._raycaster.intersectObjects(this._nodeMeshes.map(n => n.mesh));
      if (hits.length) this._centreOn(hits[0].object.userData.nodeId);
    });

    this._onFullscreenChange = () => {
      const W = this.container.clientWidth;
      const H = this.container.clientHeight;
      this._camera.aspect = W / H;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(W, H);
    };
    document.addEventListener('fullscreenchange', this._onFullscreenChange);

    this._resizeObserver = new ResizeObserver(() => {
      if (document.fullscreenElement === this.container) return;
      const W = this.container.clientWidth;
      const H = this.container.clientHeight;
      this._camera.aspect = W / H;
      this._camera.updateProjectionMatrix();
      this._renderer.setSize(W, H);
    });
    this._resizeObserver.observe(this.container);
  }

  // ─── PARSER ─────────────────────────────────────────────────────────────────

  _parseMermaid(text) {
    const lines = text.split('\n');
    let inMindmap = false;
    const nodes = [], stack = [];
    let idCounter = 0;
    for (let raw of lines) {
      const line = raw.replace(/\t/g, '  '), trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.toLowerCase().startsWith('mindmap')) { inMindmap = true; continue; }
      if (!inMindmap) continue;
      const indent = line.search(/\S/);
      let label = trimmed
        .replace(/^::[^\s]+\s*/, '')
        .replace(/^\(\((.+)\)\)$/, '$1')
        .replace(/^\[(.+)\]$/, '$1')
        .replace(/^\{(.+)\}$/, '$1')
        .replace(/^\((.+)\)$/, '$1')
        .replace(/^>(.+)\]$/, '$1')
        .trim();
      const id = idCounter++;
      while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
      const parentId = stack.length ? stack[stack.length - 1].id : null;
      const depth = stack.length;
      nodes.push({ id, label, parentId, depth, children: [] });
      stack.push({ indent, id });
    }
    const map = {};
    nodes.forEach(n => map[n.id] = n);
    nodes.forEach(n => { if (n.parentId !== null && map[n.parentId]) map[n.parentId].children.push(n.id); });
    return nodes;
  }

  // ─── LABEL SPRITE ───────────────────────────────────────────────────────────

  _makeLabel(text, color) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = '26px Courier New';
    const tw = ctx.measureText(text).width;
    canvas.width = tw + 24; canvas.height = 42;
    ctx.font = '26px Courier New';
    ctx.fillStyle = color; ctx.globalAlpha = 0.92;
    ctx.fillText(text, 12, 30);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
    const sp = new THREE.Sprite(mat);
    sp.scale.set((canvas.width / canvas.height) * 0.95, 0.95, 1);
    return sp;
  }

  // ─── BRANCH ─────────────────────────────────────────────────────────────────

  _makeBranch(from, to, depth) {
    const d = Math.min(depth, BRANCH_RADII.length - 1);
    const mid = from.clone().add(to).multiplyScalar(0.5);
    const horizontal = to.clone().sub(from); horizontal.y = 0; horizontal.normalize();
    mid.y += Math.max(0.5, (to.y - from.y) * 0.35 + 1.2 - depth * 0.15);
    mid.addScaledVector(horizontal, 0.4);
    const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
    const roughness = d === 0 ? 0.92 : d <= 2 ? 0.80 : 0.65;
    const geo = new THREE.TubeGeometry(curve, 20, BRANCH_RADII[d], 7, false);
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(DEPTH_COLORS[d]),
      emissive: new THREE.Color(DEPTH_EMISSIVE[d]),
      emissiveIntensity: 0.25,
      roughness, metalness: d === 0 ? 0.0 : 0.05,
      transparent: d >= 3, opacity: d >= 3 ? 0.88 : 1.0,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    return mesh;
  }

  // ─── LEAF CLUSTER ───────────────────────────────────────────────────────────

  _makeLeafCluster(pos, color) {
    const group = new THREE.Group();
    const col = new THREE.Color(color);
    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const r = 0.55 + Math.random() * 0.35;
      const geo = new THREE.SphereGeometry(0.28 + Math.random() * 0.18, 8, 6);
      geo.applyMatrix4(new THREE.Matrix4().makeScale(1.1, 0.6, 1.1));
      const mat = new THREE.MeshStandardMaterial({
        color: col, emissive: new THREE.Color(DEPTH_EMISSIVE[5]),
        emissiveIntensity: 0.5, roughness: 0.7, metalness: 0.0,
        transparent: true, opacity: 0.85, side: THREE.DoubleSide,
      });
      const m = new THREE.Mesh(geo, mat);
      m.position.set(Math.cos(angle) * r * 0.7, Math.random() * 0.4, Math.sin(angle) * r * 0.7);
      m.castShadow = true;
      group.add(m);
    }
    group.position.copy(pos);
    return group;
  }

  // ─── BUILD GRAPH ────────────────────────────────────────────────────────────

  _buildGraph(nodes) {
    this._graphGroup.clear();
    this._nodeMeshes = []; this._nodeDataMap = {}; this._selectedId = null;
    this._allFadeables = []; this._branchByNode = {};
    if (!nodes.length) return;

    const map = {};
    nodes.forEach(n => map[n.id] = n);
    const root = nodes.find(n => n.parentId === null) || nodes[0];

    const LEVEL_HEIGHT = [0, 7, 5, 3.5, 2.5, 1.8];
    const SPREAD       = [0, 1.0, 0.85, 0.7, 0.6, 0.5];

    const fibUpperHemi = (n, radius, spreadFactor) => {
      if (n === 1) return [new THREE.Vector3(0, radius, 0)];
      const pts = [], golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = 0.05 + (i / (n - 1 > 0 ? n - 1 : 1)) * 0.95;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        pts.push(new THREE.Vector3(Math.cos(theta) * r * radius * spreadFactor, y * radius, Math.sin(theta) * r * radius * spreadFactor));
      }
      return pts;
    };

    const positions = {};
    const queue = [{ node: root, pos: new THREE.Vector3(0, 0, 0) }];
    while (queue.length) {
      const { node, pos } = queue.shift();
      positions[node.id] = pos.clone();
      const children = node.children.map(cid => map[cid]).filter(Boolean);
      if (!children.length) continue;
      const lvl    = Math.min(node.depth + 1, LEVEL_HEIGHT.length - 1);
      const radius = LEVEL_HEIGHT[lvl];
      const spread = SPREAD[lvl];
      const pts    = fibUpperHemi(children.length, radius, spread);
      const parentUp = pos.clone().normalize();
      if (parentUp.length() < 0.001) parentUp.set(0, 1, 0);
      const quat = new THREE.Quaternion().setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        parentUp.clone().lerp(new THREE.Vector3(0, 1, 0), 0.55).normalize()
      );
      children.forEach((child, i) => {
        const childPos = pos.clone().add(pts[i].clone().applyQuaternion(quat));
        if (childPos.y < pos.y + 0.6) childPos.y = pos.y + 0.6 + Math.random() * 0.4;
        queue.push({ node: child, pos: childPos });
      });
    }

    // Trunk
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.55, 0.85, 2.2, 12),
      new THREE.MeshStandardMaterial({ color: 0x5c3318, emissive: 0x1a0a04, emissiveIntensity: 0.2, roughness: 0.95, metalness: 0.0 })
    );
    trunk.position.set(0, -1.1, 0);
    trunk.castShadow = true; trunk.receiveShadow = true;
    this._graphGroup.add(trunk);
    this._allFadeables.push({ mesh: trunk, origColor: new THREE.Color(0x5c3318), origOpacity: 1.0, origEI: 0.2 });

    // Nodes
    nodes.forEach(node => {
      const pos   = positions[node.id] || new THREE.Vector3();
      const depth = Math.min(node.depth, DEPTH_COLORS.length - 1);
      const col   = new THREE.Color(DEPTH_COLORS[depth]);
      const size  = DEPTH_SIZES[depth];
      const isLeaf = !node.children.length || depth >= 4;

      let mesh;
      if (depth === 0) {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 18, 14),
          new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(DEPTH_EMISSIVE[0]), emissiveIntensity: 0.3, roughness: 0.88, metalness: 0.0 })
        );
      } else if (isLeaf) {
        const cluster = this._makeLeafCluster(pos, DEPTH_COLORS[depth]);
        cluster.children.forEach(m => {
          this._allFadeables.push({ mesh: m, origColor: col.clone(), origOpacity: 0.85, origEI: 0.5, nodeId: node.id });
        });
        this._graphGroup.add(cluster);
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(0.55, 8, 6),
          new THREE.MeshStandardMaterial({ color: col, transparent: true, opacity: 0.0 })
        );
      } else {
        mesh = new THREE.Mesh(
          new THREE.SphereGeometry(size, 16, 12),
          new THREE.MeshStandardMaterial({ color: col, emissive: new THREE.Color(DEPTH_EMISSIVE[depth]), emissiveIntensity: 0.3, roughness: 0.75, metalness: 0.05 })
        );
      }

      mesh.position.copy(pos);
      mesh.castShadow = true;
      mesh.userData = { nodeId: node.id, depth };
      this._graphGroup.add(mesh);

      if (!(isLeaf && depth !== 0)) {
        this._allFadeables.push({ mesh, origColor: col.clone(), origOpacity: 1.0, origEI: mesh.material.emissiveIntensity || 0.3, nodeId: node.id });
      }

      const label = this._makeLabel(node.label, DEPTH_COLORS[depth]);
      label.position.copy(pos);
      label.position.y += size + 0.65;
      this._graphGroup.add(label);

      this._nodeDataMap[node.id] = { mesh, label, node, pos: pos.clone() };
      this._nodeMeshes.push({ mesh, label, node });
    });

    // Branches
    nodes.forEach(node => {
      if (node.parentId === null) return;
      const fromData = this._nodeDataMap[node.parentId];
      const toData   = this._nodeDataMap[node.id];
      if (!fromData || !toData) return;
      const branch = this._makeBranch(fromData.pos, toData.pos, node.depth);
      branch.userData.branchNodeId = node.id;
      this._graphGroup.add(branch);
      this._branchByNode[node.id] = branch;
      const d = Math.min(node.depth, DEPTH_COLORS.length - 1);
      this._allFadeables.push({ mesh: branch, origColor: new THREE.Color(DEPTH_COLORS[d]), origOpacity: branch.material.opacity || 1.0, origEI: 0.25, nodeId: node.id, isBranch: true, parentId: node.parentId });
    });

    this._buildLegend(nodes);
  }

  // ─── LEGEND ─────────────────────────────────────────────────────────────────

  _buildLegend(nodes) {
    const maxDepth = Math.max(...nodes.map(n => n.depth));
    const labels   = ['Stamm', 'Ast 1', 'Ast 2', 'Zweig', 'Blatt', 'Knospe'];
    this._legend.innerHTML = '';
    for (let d = 0; d <= Math.min(maxDepth, 5); d++) {
      this._legend.innerHTML += `<div class="mm3d-legend-item">
        <div class="mm3d-legend-dot" style="background:${DEPTH_COLORS[d]}"></div>
        <span>${labels[d]}</span>
      </div>`;
    }
  }

  // ─── HIGHLIGHT ──────────────────────────────────────────────────────────────

  _getAncestors(nodeId) {
    const ancestors = new Set();
    let cur = this._nodeDataMap[nodeId];
    while (cur) {
      ancestors.add(cur.node.id);
      cur = cur.node.parentId !== null ? this._nodeDataMap[cur.node.parentId] : null;
    }
    return ancestors;
  }

  _getDescendants(nodeId) {
    const desc = new Set();
    const q = [nodeId];
    while (q.length) {
      const id = q.shift();
      desc.add(id);
      const nd = this._nodeDataMap[id];
      if (nd) nd.node.children.forEach(cid => q.push(cid));
    }
    return desc;
  }

  _highlightNode(nodeId) {
    if (nodeId === null) {
      this._allFadeables.forEach(({ mesh, origColor, origOpacity, origEI }) => {
        mesh.material.color.copy(origColor);
        mesh.material.opacity = origOpacity;
        mesh.material.emissiveIntensity = origEI;
        mesh.material.needsUpdate = true;
      });
      this._nodeMeshes.forEach(({ mesh, label }) => {
        mesh.scale.setScalar(1);
        label.material.opacity = 1.0;
      });
      return;
    }
    const litNodes = new Set([...this._getAncestors(nodeId), ...this._getDescendants(nodeId)]);
    this._allFadeables.forEach(({ mesh, origColor, origOpacity, origEI, nodeId: nid, isBranch, parentId }) => {
      const isLit = isBranch ? (litNodes.has(nid) && litNodes.has(parentId)) : (nid === undefined || litNodes.has(nid));
      if (isLit) {
        mesh.material.color.copy(origColor);
        mesh.material.opacity = origOpacity;
        mesh.material.emissiveIntensity = origEI;
      } else {
        mesh.material.color.copy(origColor.clone().multiplyScalar(0.18));
        mesh.material.emissiveIntensity = 0.0;
        mesh.material.transparent = true;
        mesh.material.opacity = 0.13;
      }
      mesh.material.needsUpdate = true;
    });
    this._nodeMeshes.forEach(({ mesh, label, node }) => {
      mesh.scale.setScalar(1);
      label.material.opacity = litNodes.has(node.id) ? 1.0 : 0.07;
    });
    const sel = this._nodeDataMap[nodeId];
    if (sel && sel.mesh.material.opacity !== 0) {
      sel.mesh.material.emissiveIntensity = 1.5;
      sel.mesh.scale.setScalar(1.45);
    }
  }

  // ─── CENTRE ON ──────────────────────────────────────────────────────────────

  _centreOn(nodeId) {
    const data = this._nodeDataMap[nodeId];
    if (!data) return;
    this._selectedId = nodeId;
    this._highlightNode(nodeId);
    this._targetPivot.copy(data.pos);
    this._targetSpherical.radius = Math.min(this._targetSpherical.radius, Math.max(5, 22 - data.node.depth * 2.8));
    const labels = ['Stamm', 'Ast 1', 'Ast 2', 'Zweig', 'Blatt', 'Knospe'];
    this._breadcrumb.textContent = '● ' + data.node.label.toUpperCase() + '  [' + labels[Math.min(data.node.depth, 5)] + ']';
  }

  // ─── RESET VIEW ─────────────────────────────────────────────────────────────

  _resetView() {
    this._targetSpherical = { ...this._INIT_SPH };
    this._targetPivot.copy(this._INIT_PIVOT);
    this._selectedId = null;
    this._highlightNode(null);
    this._breadcrumb.textContent = '';
  }

  // ─── CAMERA ─────────────────────────────────────────────────────────────────

  _applyCameraFromSpherical() {
    this._camera.position.set(
      this._pivot.x + this._spherical.radius * Math.sin(this._spherical.phi) * Math.sin(this._spherical.theta),
      this._pivot.y + this._spherical.radius * Math.cos(this._spherical.phi),
      this._pivot.z + this._spherical.radius * Math.sin(this._spherical.phi) * Math.cos(this._spherical.theta)
    );
    this._camera.lookAt(this._pivot);
  }

  _panPivot(dx, dy) {
    const speed = this._spherical.radius * 0.0012;
    const right = new THREE.Vector3();
    right.crossVectors(this._camera.getWorldDirection(new THREE.Vector3()), this._camera.up).negate().normalize();
    const up = this._camera.up.clone().normalize();
    this._targetPivot.addScaledVector(right, -dx * speed);
    this._targetPivot.addScaledVector(up, dy * speed);
  }

  // ─── TOOLTIP ────────────────────────────────────────────────────────────────

  _updateTooltip(e) {
    const el = this._renderer.domElement;
    const rect = el.getBoundingClientRect();
    this._mouseNDC.x =  ((e.clientX - rect.left) / rect.width)  * 2 - 1;
    this._mouseNDC.y = -((e.clientY - rect.top)  / rect.height) * 2 + 1;
    this._raycaster.setFromCamera(this._mouseNDC, this._camera);
    const hits = this._raycaster.intersectObjects(this._nodeMeshes.map(n => n.mesh));
    if (hits.length) {
      const nd = this._nodeDataMap[hits[0].object.userData.nodeId];
      const labels = ['Stamm', 'Ast 1', 'Ast 2', 'Zweig', 'Blatt', 'Knospe'];
      this._tooltip.style.display = 'block';
      this._tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
      this._tooltip.style.top  = (e.clientY - rect.top  - 10) + 'px';
      this._tooltip.textContent = nd.node.label + '  [' + labels[Math.min(nd.node.depth, 5)] + ']';
      el.style.cursor = 'pointer';
    } else {
      this._tooltip.style.display = 'none';
      el.style.cursor = 'default';
    }
  }

  // ─── ANIMATE ────────────────────────────────────────────────────────────────

  _animate() {
    this._animFrameId = requestAnimationFrame(() => this._animate());
    const t = this._clock.getElapsedTime();

    this._spherical.theta  += (this._targetSpherical.theta  - this._spherical.theta)  * 0.08;
    this._spherical.phi    += (this._targetSpherical.phi    - this._spherical.phi)    * 0.08;
    this._spherical.radius += (this._targetSpherical.radius - this._spherical.radius) * 0.08;
    this._pivot.lerp(this._targetPivot, 0.07);
    this._applyCameraFromSpherical();

    this._graphGroup.rotation.z = Math.sin(t * 0.18) * 0.018;
    this._graphGroup.rotation.x = Math.sin(t * 0.13) * 0.010;

    const rd = this._nodeDataMap[0];
    if (rd && this._selectedId !== 0) rd.mesh.scale.setScalar(1 + 0.04 * Math.sin(t * 1.3));

    this._nodeMeshes.forEach(({ label }) => label.quaternion.copy(this._camera.quaternion));

    this._renderer.render(this._scene, this._camera);
  }
}
