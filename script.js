import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

const FACE_COLORS = ["#7fc0ff", "#ffc66d", "#66ffd9", "#fff07d", "#ff9bc6", "#b8a6ff"];
const UNFOLD_DAMPING = 3.7;
const IDLE_AUTOROTATE_DELAY = 3200;
const IDLE_AUTOROTATE_SPEED = 0.45;

const ui = {
  shapeSelect: document.getElementById("shape-select"),
  openButton: document.getElementById("open-button"),
  closeButton: document.getElementById("close-button"),
  resetButton: document.getElementById("reset-button"),
  toolbarOpenButton: document.getElementById("toolbar-open-button"),
  toolbarCloseButton: document.getElementById("toolbar-close-button"),
  toggleLabelsButton: document.getElementById("toggle-labels-button"),
  fullscreenButton: document.getElementById("fullscreen-button"),
  fullscreenShapeButton: document.getElementById("fullscreen-shape-button"),
  fullscreenOpenButton: document.getElementById("fullscreen-open-button"),
  fullscreenCloseButton: document.getElementById("fullscreen-close-button"),
  fullscreenExitButton: document.getElementById("fullscreen-exit-button"),
  shapeName: document.getElementById("shape-name"),
  shapeDescription: document.getElementById("shape-description"),
  facesCount: document.getElementById("faces-count"),
  edgesCount: document.getElementById("edges-count"),
  verticesCount: document.getElementById("vertices-count"),
  modeBadge: document.getElementById("mode-badge"),
  toolbarTitle: document.getElementById("toolbar-title"),
  hoverReadout: document.getElementById("hover-readout"),
  canvasWrap: document.getElementById("canvas-wrap"),
  canvas: document.getElementById("scene-canvas")
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d1730);
scene.fog = new THREE.Fog(0x0d1730, 18, 34);

const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
camera.up.set(0, 0, 1);
camera.position.set(6, 4.6, 6.8);

const renderer = new THREE.WebGLRenderer({
  canvas: ui.canvas,
  antialias: true,
  alpha: true
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

const controls = new OrbitControls(camera, ui.canvas);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 4;
controls.maxDistance = 18;
controls.rotateSpeed = 0.9;
controls.zoomSpeed = 0.9;
controls.autoRotate = false;
controls.autoRotateSpeed = IDLE_AUTOROTATE_SPEED;
controls.minPolarAngle = 0.05;
controls.maxPolarAngle = Math.PI - 0.05;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xa9c2ff, 1.35));

const keyLight = new THREE.DirectionalLight(0xe5efff, 2.05);
keyLight.position.set(6, 8, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x6288d9, 1.25);
fillLight.position.set(-8, -3, 4);
scene.add(fillLight);

const modelGroup = new THREE.Group();
const modelPivot = new THREE.Group();
modelPivot.add(modelGroup);
scene.add(modelPivot);

const gridHelper = new THREE.GridHelper(18, 18, 0x2f467c, 0x21345f);
gridHelper.rotation.x = Math.PI / 2;
gridHelper.position.z = -1.2;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.82;
scene.add(gridHelper);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(2, 2);
const clock = new THREE.Clock();

let currentShapeKey = "sphere";
let currentShape = null;
let unfoldTarget = 0;
let unfoldProgress = 0;
let hoveredFace = null;
let autoCamera = 0;
let selectedFaceId = null;
let labelsVisible = false;
let faceOpacity = 1;
let lastInteractionAt = performance.now();
let isUserOrbiting = false;
let touchTapCandidate = null;

function registerInteraction() {
  lastInteractionAt = performance.now();
  controls.autoRotate = false;
}

function showRuntimeMessage(message, isError = false) {
  if (ui.hoverReadout) {
    ui.hoverReadout.textContent = message;
    ui.hoverReadout.style.color = isError ? "#c62828" : "";
  }
  if (isError) {
    ui.toolbarTitle.textContent = "Có lỗi khi tải mô hình";
  }
}

function v2(x, y) {
  return new THREE.Vector2(x, y);
}

function rectanglePoints(width, height) {
  return [
    v2(-width / 2, -height / 2),
    v2(width / 2, -height / 2),
    v2(width / 2, height / 2),
    v2(-width / 2, height / 2)
  ];
}

function isoTrianglePoints(base, height) {
  return [v2(-base / 2, -height / 3), v2(base / 2, -height / 3), v2(0, (2 * height) / 3)];
}

function equilateralTrianglePoints(side) {
  return isoTrianglePoints(side, (Math.sqrt(3) / 2) * side);
}

function circlePoints(radius, segments = 72) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return v2(Math.cos(angle) * radius, Math.sin(angle) * radius);
  });
}

function centroid(points) {
  const total = points.reduce((sum, point) => sum.add(point), new THREE.Vector2(0, 0));
  return total.multiplyScalar(1 / points.length);
}

function createPolygonGeometry(points) {
  return new THREE.ShapeGeometry(new THREE.Shape(points));
}

function createLineGeometry(points) {
  const loop = [...points, points[0]].map((point) => new THREE.Vector3(point.x, point.y, 0.01));
  return new THREE.BufferGeometry().setFromPoints(loop);
}

function drawRoundedRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + width - r, y);
  context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r);
  context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

function createLabelSprite(text) {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 256;
  labelCanvas.height = 128;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.font = "700 30px Segoe UI";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineWidth = 8;
  context.strokeStyle = "rgba(255,255,255,0.88)";
  context.fillStyle = "#173154";
  context.strokeText(text, labelCanvas.width / 2, labelCanvas.height / 2);
  context.fillText(text, labelCanvas.width / 2, labelCanvas.height / 2);

  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    depthTest: false
  });

  const sprite = new THREE.Sprite(material);
  sprite.scale.set(1.2, 0.6, 1);
  sprite.renderOrder = 10;
  return sprite;
}

function translationMatrix(x, y, z = 0) {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}

function rotationFromVector(source, target) {
  const angle = Math.atan2(source.x * target.y - source.y * target.x, source.dot(target));
  return new THREE.Matrix4().makeRotationZ(angle);
}

function matrixFromEdgeMatch(parentPoints, childPoints, parentEdgeIndices, childEdgeIndices) {
  const [p0Index, p1Index] = parentEdgeIndices;
  const [c0Index, c1Index] = childEdgeIndices;
  const p0 = parentPoints[p0Index];
  const p1 = parentPoints[p1Index];
  const c0 = childPoints[c0Index];
  const c1 = childPoints[c1Index];

  const childDirection = c1.clone().sub(c0);
  const desiredDirection = p0.clone().sub(p1);
  const rotation = rotationFromVector(childDirection, desiredDirection);
  const rotatedC0 = new THREE.Vector3(c0.x, c0.y, 0).applyMatrix4(rotation);
  const shift = p1.clone().sub(new THREE.Vector2(rotatedC0.x, rotatedC0.y));
  return translationMatrix(shift.x, shift.y).multiply(rotation);
}

function axisRotationMatrix(pointA, pointB, angle) {
  const axis = new THREE.Vector3(pointB.x - pointA.x, pointB.y - pointA.y, 0).normalize();
  return translationMatrix(pointA.x, pointA.y)
    .multiply(new THREE.Matrix4().makeRotationAxis(axis, angle))
    .multiply(translationMatrix(-pointA.x, -pointA.y));
}

function transformedVertices(face, matrix) {
  if (face.renderType === "sphere") {
    const radius = face.radius ?? 1;
    return [
      new THREE.Vector3(-radius, 0, 0),
      new THREE.Vector3(radius, 0, 0),
      new THREE.Vector3(0, -radius, 0),
      new THREE.Vector3(0, radius, 0),
      new THREE.Vector3(0, 0, -radius),
      new THREE.Vector3(0, 0, radius)
    ].map((point) => point.applyMatrix4(matrix));
  }

  if (face.renderType === "cylinder") {
    const radius = face.radius ?? 1;
    const height = face.height ?? 2;
    const halfNetWidth = Math.PI * radius;
    const halfNetHeight = height / 2 + radius * 2;
    const halfDepth = (height / 2) * (1 - unfoldProgress);
    return [
      new THREE.Vector3(-halfNetWidth, -halfNetHeight, -halfDepth),
      new THREE.Vector3(halfNetWidth, -halfNetHeight, -halfDepth),
      new THREE.Vector3(-halfNetWidth, halfNetHeight, -halfDepth),
      new THREE.Vector3(halfNetWidth, halfNetHeight, -halfDepth),
      new THREE.Vector3(-halfNetWidth, -halfNetHeight, halfDepth),
      new THREE.Vector3(halfNetWidth, -halfNetHeight, halfDepth),
      new THREE.Vector3(-halfNetWidth, halfNetHeight, halfDepth),
      new THREE.Vector3(halfNetWidth, halfNetHeight, halfDepth)
    ].map((point) => point.applyMatrix4(matrix));
  }

  return face.points.map((point) => new THREE.Vector3(point.x, point.y, 0).applyMatrix4(matrix));
}

function faceNormal(vertices) {
  const edge1 = vertices[1].clone().sub(vertices[0]);
  const edge2 = vertices[2].clone().sub(vertices[0]);
  return edge1.cross(edge2).normalize();
}

function angleBetweenNormals(a, b) {
  return Math.acos(THREE.MathUtils.clamp(a.dot(b), -1, 1));
}

function createFaceMesh(face) {
  if (face.renderType === "sphere") {
    return createSphereMesh(face);
  }

  if (face.renderType === "cylinder") {
    return createCylinderMesh(face);
  }

  const mesh = new THREE.Mesh(
    createPolygonGeometry(face.points),
    new THREE.MeshStandardMaterial({
      color: face.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.95,
      roughness: 0.38,
      metalness: 0.05,
      emissive: new THREE.Color(face.color).multiplyScalar(0)
    })
  );

  const border = new THREE.Line(
    createLineGeometry(face.points),
    new THREE.LineBasicMaterial({ color: 0x16304f, transparent: true, opacity: 0.44 })
  );

  const label = createLabelSprite(face.label ?? face.name);
  const center = centroid(face.points);
  label.position.set(center.x, center.y, 0.06);

  const object = new THREE.Group();
  object.add(mesh, border, label);
  object.userData.mesh = mesh;
  object.userData.label = label;
  object.userData.faceId = face.id;
  object.userData.faceName = face.name;
  object.userData.defaultColor = new THREE.Color(face.color);
  object.matrixAutoUpdate = false;
  return object;
}

function createCylinderMesh(face) {
  const radius = face.radius ?? 1.1;
  const height = face.height ?? 2.4;
  const sideWidth = Math.PI * 2 * radius;
  const sideGeometry = new THREE.CylinderGeometry(radius, radius, height, 48, 1, true);
  sideGeometry.rotateX(Math.PI / 2);
  const topGeometry = new THREE.CircleGeometry(radius, 48);
  const bottomGeometry = new THREE.CircleGeometry(radius, 48);
  const sideNetPoints = rectanglePoints(sideWidth, height);
  const capNetPoints = circlePoints(radius, 72);
  const sideMesh = new THREE.Mesh(
    sideGeometry,
    new THREE.MeshStandardMaterial({
      color: face.color,
      transparent: true,
      opacity: 1,
      roughness: 0.3,
      metalness: 0.04,
      emissive: new THREE.Color(face.color).multiplyScalar(0)
    })
  );
  const topMesh = new THREE.Mesh(
    topGeometry,
    new THREE.MeshStandardMaterial({
        color: "#ffe45c",
      transparent: true,
      opacity: 1,
      roughness: 0.28,
      metalness: 0.04
    })
  );
  topMesh.position.z = height / 2;

  const bottomMesh = new THREE.Mesh(
    bottomGeometry,
    new THREE.MeshStandardMaterial({
        color: "#ff7db5",
      transparent: true,
      opacity: 1,
      roughness: 0.28,
      metalness: 0.04
    })
  );
  bottomMesh.rotation.x = Math.PI;
  bottomMesh.position.z = -height / 2;

  const edges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.CylinderGeometry(radius, radius, height, 48)),
    new THREE.LineBasicMaterial({
      color: 0x16304f,
      transparent: true,
      opacity: 0.5
    })
  );
  edges.rotation.x = Math.PI / 2;

  const axis = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, -height / 2),
      new THREE.Vector3(0, 0, height / 2)
    ]),
    new THREE.LineBasicMaterial({
      color: 0x4c8dff,
      transparent: true,
      opacity: 0.72
    })
  );

  const label = createLabelSprite(face.label ?? face.name);
  label.position.set(0, 0, height / 2 + 0.32);

  const sideNetMesh = new THREE.Mesh(
    createPolygonGeometry(sideNetPoints),
    new THREE.MeshStandardMaterial({
      color: face.color,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      roughness: 0.34,
      metalness: 0.03
    })
  );
  sideNetMesh.position.z = 0.012;

  const sideNetBorder = new THREE.Line(
    createLineGeometry(sideNetPoints),
    new THREE.LineBasicMaterial({
      color: 0x16304f,
      transparent: true,
      opacity: 0
    })
  );
  sideNetBorder.position.z = 0.016;

  const topNetMesh = new THREE.Mesh(
    createPolygonGeometry(capNetPoints),
    new THREE.MeshStandardMaterial({
        color: "#ffe45c",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      roughness: 0.3,
      metalness: 0.03
    })
  );
  topNetMesh.position.set(0, height / 2 + radius, 0.012);

  const topNetBorder = new THREE.Line(
    createLineGeometry(capNetPoints),
    new THREE.LineBasicMaterial({
      color: 0x16304f,
      transparent: true,
      opacity: 0
    })
  );
  topNetBorder.position.set(0, height / 2 + radius, 0.016);

  const bottomNetMesh = new THREE.Mesh(
    createPolygonGeometry(capNetPoints),
    new THREE.MeshStandardMaterial({
        color: "#ff7db5",
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      roughness: 0.3,
      metalness: 0.03
    })
  );
  bottomNetMesh.position.set(0, -(height / 2 + radius), 0.012);

  const bottomNetBorder = new THREE.Line(
    createLineGeometry(capNetPoints),
    new THREE.LineBasicMaterial({
      color: 0x16304f,
      transparent: true,
      opacity: 0
    })
  );
  bottomNetBorder.position.set(0, -(height / 2 + radius), 0.016);

  const topNetLabel = createLabelSprite("Đáy trên");
  topNetLabel.position.set(0, height / 2 + radius, 0.18);

  const sideNetLabel = createLabelSprite("Mặt xung quanh");
  sideNetLabel.position.set(0, 0, 0.18);

  const bottomNetLabel = createLabelSprite("Đáy dưới");
  bottomNetLabel.position.set(0, -(height / 2 + radius), 0.18);

  const netGroup = new THREE.Group();
  netGroup.add(
    sideNetMesh,
    sideNetBorder,
    topNetMesh,
    topNetBorder,
    bottomNetMesh,
    bottomNetBorder,
    topNetLabel,
    sideNetLabel,
    bottomNetLabel
  );

  const object = new THREE.Group();
  object.add(sideMesh, topMesh, bottomMesh, edges, axis, label, netGroup);
  object.userData.mesh = sideMesh;
  object.userData.hitMeshes = [sideMesh, topMesh, bottomMesh, sideNetMesh, topNetMesh, bottomNetMesh];
  object.userData.secondaryMeshes = [topMesh, bottomMesh];
  object.userData.netMeshes = [sideNetMesh, topNetMesh, bottomNetMesh];
  object.userData.netBorders = [sideNetBorder, topNetBorder, bottomNetBorder];
  object.userData.netLabels = [topNetLabel, sideNetLabel, bottomNetLabel];
  object.userData.closedGroup = [sideMesh, topMesh, bottomMesh, edges, axis, label];
  object.userData.cylinderLayout = {
    capOffset: height / 2 + radius
  };
  object.userData.label = label;
  object.userData.faceId = face.id;
  object.userData.faceName = face.name;
  object.userData.defaultColor = new THREE.Color(face.color);
  object.userData.isCylinder = true;
  object.matrixAutoUpdate = false;
  return object;
}

function createSphereMesh(face) {
  const radius = face.radius ?? 1.45;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 56, 56),
    new THREE.MeshStandardMaterial({
      color: face.color,
      transparent: true,
      opacity: 0.34,
      roughness: 0.26,
      metalness: 0.06,
      emissive: new THREE.Color(face.color).multiplyScalar(0)
    })
  );

  const ringGroup = new THREE.Group();
  [0, Math.PI / 2].forEach((rotationY) => {
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        circlePoints(radius, 96).map((point) => new THREE.Vector3(point.x, point.y, 0))
      ),
      new THREE.LineBasicMaterial({
          color: 0x9ed1ff,
        transparent: true,
        opacity: 0.62
      })
    );
    ring.rotation.y = rotationY;
    ringGroup.add(ring);
  });

  [-0.52, 0, 0.52].forEach((latitude, index) => {
    const ringRadius = radius * Math.cos(latitude);
    const y = radius * Math.sin(latitude);
    const ring = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints(
        circlePoints(ringRadius, 96).map((point) => new THREE.Vector3(point.x, y, point.y))
      ),
      new THREE.LineBasicMaterial({
          color: index === 1 ? 0xff7aa7 : 0x9ed1ff,
        transparent: true,
        opacity: index === 1 ? 0.72 : 0.48
      })
    );
    ringGroup.add(ring);
  });

  const label = createLabelSprite(face.label ?? face.name);
  label.position.set(0, radius + 0.38, 0);

  const axisLength = radius * 1.45;
  const axisGroup = new THREE.Group();
  [
    { points: [new THREE.Vector3(-axisLength, 0, 0), new THREE.Vector3(axisLength, 0, 0)], color: 0xff6b6b },
    { points: [new THREE.Vector3(0, -axisLength, 0), new THREE.Vector3(0, axisLength, 0)], color: 0x41d39b },
    { points: [new THREE.Vector3(0, 0, -axisLength), new THREE.Vector3(0, 0, axisLength)], color: 0x4c8dff }
  ].forEach((axis) => {
    axisGroup.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(axis.points),
        new THREE.LineBasicMaterial({
          color: axis.color,
          transparent: true,
          opacity: 0.78
        })
      )
    );
  });

  const centerPoint = new THREE.Mesh(
    new THREE.SphereGeometry(0.055, 20, 20),
    new THREE.MeshBasicMaterial({ color: 0xffffff })
  );

  const centerLabel = createLabelSprite("Tâm");
  centerLabel.scale.set(0.7, 0.34, 1);
  centerLabel.position.set(0, -0.24, 0);

  const object = new THREE.Group();
  object.add(mesh, ringGroup, axisGroup, centerPoint, centerLabel, label);
  object.userData.mesh = mesh;
  object.userData.ringGroup = ringGroup;
  object.userData.axisGroup = axisGroup;
  object.userData.centerPoint = centerPoint;
  object.userData.centerLabel = centerLabel;
  object.userData.label = label;
  object.userData.faceId = face.id;
  object.userData.faceName = face.name;
  object.userData.defaultColor = new THREE.Color(face.color);
  object.userData.isSphere = true;
  object.matrixAutoUpdate = false;
  return object;
}

function syncLabelToggleText() {
  ui.toggleLabelsButton.textContent = labelsVisible ? "Ẩn tên mặt" : "Hiện tên mặt";
}

function normalizeShape(shape) {
  const faceMap = Object.fromEntries(shape.faces.map((face) => [face.id, face]));
  shape.faces.forEach((face, index) => {
    face.color = face.color ?? FACE_COLORS[index % FACE_COLORS.length];
    face.points = face.points.map((point) => point.clone());
    face.edgeIndex = {};
    face.points.forEach((_, pointIndex) => {
      face.edgeIndex[`e${pointIndex}`] = [pointIndex, (pointIndex + 1) % face.points.length];
    });
  });

  shape.faces.forEach((face) => {
    face.parent = face.parentId ? faceMap[face.parentId] : null;
    if (face.parent) {
      face.parentEdgeIndices = face.parent.edgeIndex[face.parentEdge];
      face.childEdgeIndices = face.edgeIndex[face.childEdge];
    }
  });

  shape.initialRootId = shape.faces.find((face) => !face.parentId)?.id ?? shape.faces[0].id;
  shape.faceMap = faceMap;
  shape.adjacency = Object.fromEntries(shape.faces.map((face) => [face.id, []]));

  shape.faces.forEach((face) => {
    if (!face.parent) {
      return;
    }

    shape.adjacency[face.parent.id].push({
      neighborId: face.id,
      sourceEdge: face.parentEdge,
      targetEdge: face.childEdge,
      foldAngle: face.foldAngle
    });

    shape.adjacency[face.id].push({
      neighborId: face.parent.id,
      sourceEdge: face.childEdge,
      targetEdge: face.parentEdge,
      foldAngle: face.foldAngle
    });
  });

  applyRootFace(shape, shape.initialRootId);
  return shape;
}

function applyRootFace(shape, rootId) {
  const visited = new Set([rootId]);
  const queue = [{ faceId: rootId, parentId: null, depth: 0 }];
  shape.rootFace = shape.faceMap[rootId];

  while (queue.length > 0) {
    const current = queue.shift();
    const face = shape.faceMap[current.faceId];

    face.parentId = current.parentId;
    face.parent = current.parentId ? shape.faceMap[current.parentId] : null;
    face.depth = current.depth;

    if (face.parent) {
      const relation = shape.adjacency[current.parentId].find(
        (item) => item.neighborId === face.id
      );
      face.parentEdge = relation.sourceEdge;
      face.childEdge = relation.targetEdge;
      face.parentEdgeIndices = face.parent.edgeIndex[face.parentEdge];
      face.childEdgeIndices = face.edgeIndex[face.childEdge];
      face.foldAngle = relation.foldAngle;
    }

    shape.adjacency[face.id].forEach((relation) => {
      if (visited.has(relation.neighborId)) {
        return;
      }

      visited.add(relation.neighborId);
      queue.push({
        faceId: relation.neighborId,
        parentId: face.id,
        depth: current.depth + 1
      });
    });
  }
}

function buildShapeLibrary() {
  const cubeSize = 2.2;
  const rectWidth = 2.8;
  const rectHeight = 1.8;
  const rectDepth = 1.5;
  const prismLength = 3.2;
  const prismSide = 1.75;
  const pyramidBase = 2.4;
  const pyramidHeight = 1.9;
  const pyramidSlant = Math.sqrt(pyramidHeight ** 2 + (pyramidBase / 2) ** 2);
  const tetraSide = 2.5;

  const squarePyramidAngle = (() => {
    const a = new THREE.Vector3(-pyramidBase / 2, -pyramidBase / 2, 0);
    const b = new THREE.Vector3(pyramidBase / 2, -pyramidBase / 2, 0);
    const c = new THREE.Vector3(pyramidBase / 2, pyramidBase / 2, 0);
    const apex = new THREE.Vector3(0, 0, pyramidHeight);
    return angleBetweenNormals(faceNormal([a, b, c]), faceNormal([b, a, apex]));
  })();

  const tetraAngle = Math.acos(-1 / 3);

  return {
    sphere: normalizeShape({
      name: "Hình cầu",
      description: "Mặt cầu trong suốt với các đường line kinh tuyến và vĩ tuyến để quan sát rõ khối tròn xoay.",
      counts: { faces: 1, edges: 0, vertices: 0 },
      faces: [
        {
          id: "sphereFace",
          name: "Mặt cầu",
          points: circlePoints(1.45),
          label: "Mặt cầu",
          renderType: "sphere",
          radius: 1.45,
            color: "#4aa2ff"
        }
      ]
    }),
    cylinder: normalizeShape({
      name: "Hình trụ",
      description: "Khối tròn xoay có hai đáy tròn song song và một mặt xung quanh cong, phù hợp để học hình trụ cơ bản.",
      counts: { faces: 3, edges: 2, vertices: 0 },
      faces: [
        {
          id: "cylinderFace",
          name: "Mặt trụ",
          points: circlePoints(1.1),
          label: "Hình trụ",
          renderType: "cylinder",
          radius: 1.1,
          height: 2.4,
            color: "#3b96ff"
        }
      ]
    }),
    circle: normalizeShape({
      name: "Hình tròn",
      description: "Mặt tròn phẳng để quan sát biên cong và phần ghi nhãn. Hình này chỉ có một mặt nên không bung thêm như các khối khác.",
      counts: { faces: 1, edges: 1, vertices: 0 },
      faces: [
        { id: "circleFace", name: "Mặt tròn", points: circlePoints(1.45), label: "Hình tròn" }
      ]
    }),
    cube: normalizeShape({
      name: "Hình lập phương",
      description: "Sáu mặt vuông bằng nhau, các cạnh bằng nhau và rất phù hợp để quan sát cách một khối 3D bung thành lưới phẳng.",
      counts: { faces: 6, edges: 12, vertices: 8 },
      faces: [
        { id: "front", name: "Mặt trước", points: rectanglePoints(cubeSize, cubeSize), label: "Trước" },
        { id: "top", name: "Mặt trên", points: rectanglePoints(cubeSize, cubeSize), parentId: "front", parentEdge: "e2", childEdge: "e0", foldAngle: Math.PI / 2, label: "Trên" },
        { id: "right", name: "Mặt phải", points: rectanglePoints(cubeSize, cubeSize), parentId: "front", parentEdge: "e1", childEdge: "e3", foldAngle: Math.PI / 2, label: "Phải" },
        { id: "bottom", name: "Mặt dưới", points: rectanglePoints(cubeSize, cubeSize), parentId: "front", parentEdge: "e0", childEdge: "e2", foldAngle: Math.PI / 2, label: "Dưới" },
        { id: "left", name: "Mặt trái", points: rectanglePoints(cubeSize, cubeSize), parentId: "front", parentEdge: "e3", childEdge: "e1", foldAngle: Math.PI / 2, label: "Trái" },
        { id: "back", name: "Mặt sau", points: rectanglePoints(cubeSize, cubeSize), parentId: "top", parentEdge: "e2", childEdge: "e0", foldAngle: Math.PI / 2, label: "Sau" }
      ]
    }),
    rectangularPrism: normalizeShape({
      name: "Hình hộp chữ nhật",
      description: "Khối gồm ba cặp mặt chữ nhật song song. Việc mở hình cho thấy rõ cách các mặt bên ghép với đáy và nắp.",
      counts: { faces: 6, edges: 12, vertices: 8 },
      faces: [
        { id: "front", name: "Mặt trước", points: rectanglePoints(rectWidth, rectHeight), label: "Trước" },
        { id: "top", name: "Mặt trên", points: rectanglePoints(rectWidth, rectDepth), parentId: "front", parentEdge: "e2", childEdge: "e0", foldAngle: Math.PI / 2, label: "Trên" },
        { id: "right", name: "Mặt phải", points: rectanglePoints(rectDepth, rectHeight), parentId: "front", parentEdge: "e1", childEdge: "e3", foldAngle: Math.PI / 2, label: "Phải" },
        { id: "bottom", name: "Mặt dưới", points: rectanglePoints(rectWidth, rectDepth), parentId: "front", parentEdge: "e0", childEdge: "e2", foldAngle: Math.PI / 2, label: "Dưới" },
        { id: "left", name: "Mặt trái", points: rectanglePoints(rectDepth, rectHeight), parentId: "front", parentEdge: "e3", childEdge: "e1", foldAngle: Math.PI / 2, label: "Trái" },
        { id: "back", name: "Mặt sau", points: rectanglePoints(rectWidth, rectHeight), parentId: "top", parentEdge: "e2", childEdge: "e0", foldAngle: Math.PI / 2, label: "Sau" }
      ]
    }),
    triangularPrism: normalizeShape({
      name: "Hình lăng trụ tam giác",
      description: "Hai đáy là tam giác bằng nhau và ba mặt bên là hình chữ nhật. Lưới phẳng giúp nhìn thấy dải mặt bên quấn quanh hai tam giác đáy.",
      counts: { faces: 5, edges: 9, vertices: 6 },
      faces: [
        { id: "middle", name: "Mặt bên giữa", points: rectanglePoints(prismLength, prismSide), label: "Giữa" },
        { id: "upper", name: "Mặt bên trên", points: rectanglePoints(prismLength, prismSide), parentId: "middle", parentEdge: "e2", childEdge: "e0", foldAngle: (2 * Math.PI) / 3, label: "Bên 1" },
        { id: "lower", name: "Mặt bên dưới", points: rectanglePoints(prismLength, prismSide), parentId: "middle", parentEdge: "e0", childEdge: "e2", foldAngle: (2 * Math.PI) / 3, label: "Bên 2" },
        { id: "leftTriangle", name: "Đáy tam giác trái", points: equilateralTrianglePoints(prismSide), parentId: "middle", parentEdge: "e3", childEdge: "e1", foldAngle: Math.PI / 2, label: "Đáy trái" },
        { id: "rightTriangle", name: "Đáy tam giác phải", points: equilateralTrianglePoints(prismSide), parentId: "middle", parentEdge: "e1", childEdge: "e2", foldAngle: Math.PI / 2, label: "Đáy phải" }
      ]
    }),
    squarePyramid: normalizeShape({
      name: "Hình chóp tứ giác",
      description: "Đáy là hình vuông, bốn mặt bên là tam giác cùng gặp nhau tại một đỉnh. Khi mở ra, các tam giác xòe quanh đáy rất trực quan.",
      counts: { faces: 5, edges: 8, vertices: 5 },
      faces: [
        { id: "base", name: "Đáy vuông", points: rectanglePoints(pyramidBase, pyramidBase), label: "Đáy" },
        { id: "frontTri", name: "Tam giác trước", points: isoTrianglePoints(pyramidBase, pyramidSlant), parentId: "base", parentEdge: "e0", childEdge: "e0", foldAngle: squarePyramidAngle, label: "Trước" },
        { id: "rightTri", name: "Tam giác phải", points: isoTrianglePoints(pyramidBase, pyramidSlant), parentId: "base", parentEdge: "e1", childEdge: "e0", foldAngle: squarePyramidAngle, label: "Phải" },
        { id: "backTri", name: "Tam giác sau", points: isoTrianglePoints(pyramidBase, pyramidSlant), parentId: "base", parentEdge: "e2", childEdge: "e0", foldAngle: squarePyramidAngle, label: "Sau" },
        { id: "leftTri", name: "Tam giác trái", points: isoTrianglePoints(pyramidBase, pyramidSlant), parentId: "base", parentEdge: "e3", childEdge: "e0", foldAngle: squarePyramidAngle, label: "Trái" }
      ]
    }),
    triangularPyramid: normalizeShape({
      name: "Hình chóp tam giác",
      description: "Còn gọi là tứ diện đều trong mô hình này. Cả bốn mặt đều là tam giác, rất thích hợp để học số mặt, cạnh, đỉnh và cách bung lưới.",
      counts: { faces: 4, edges: 6, vertices: 4 },
      faces: [
        { id: "base", name: "Tam giác đáy", points: equilateralTrianglePoints(tetraSide), label: "Đáy" },
        { id: "sideA", name: "Mặt bên A", points: equilateralTrianglePoints(tetraSide), parentId: "base", parentEdge: "e0", childEdge: "e0", foldAngle: tetraAngle, label: "A" },
        { id: "sideB", name: "Mặt bên B", points: equilateralTrianglePoints(tetraSide), parentId: "base", parentEdge: "e1", childEdge: "e0", foldAngle: tetraAngle, label: "B" },
        { id: "sideC", name: "Mặt bên C", points: equilateralTrianglePoints(tetraSide), parentId: "base", parentEdge: "e2", childEdge: "e0", foldAngle: tetraAngle, label: "C" }
      ]
    })
  };
}

const SHAPES = buildShapeLibrary();

SHAPES.sphere.displayRotation = { x: 0, y: 0, z: 0 };
SHAPES.cylinder.displayRotation = { x: 0, y: 0, z: 0 };
SHAPES.cube.displayRotation = { x: 0, y: 0, z: 0 };
SHAPES.rectangularPrism.displayRotation = { x: 0, y: 0, z: 0 };
SHAPES.sphere.baseLift = 0;
SHAPES.cylinder.baseLift = 0;

function faceOpenProgress(face, openness) {
  if (!face.parent) {
    return openness;
  }

  const delay = Math.min(face.depth * 0.16, 0.42);
  const local = THREE.MathUtils.clamp((openness - delay) / (1 - delay), 0, 1);
  return local * local * (3 - 2 * local);
}

function computeMatrices(shape, openness) {
  const matrices = {};
  const childrenMap = Object.fromEntries(shape.faces.map((face) => [face.id, []]));
  shape.faces.forEach((face) => {
    if (face.parentId) {
      childrenMap[face.parentId].push(face);
    }
  });

  function walk(face, parentMatrix) {
    const localOpen = faceOpenProgress(face, openness);
    const localMatrix = face.parent
      ? parentMatrix
          .clone()
          .multiply(
            axisRotationMatrix(
              face.parent.points[face.parentEdgeIndices[0]],
              face.parent.points[face.parentEdgeIndices[1]],
              face.foldAngle * (1 - localOpen)
            )
          )
          .multiply(face.flatMatrix)
      : parentMatrix.clone();

    matrices[face.id] = localMatrix;
    childrenMap[face.id].forEach((child) => walk(child, localMatrix));
  }

  walk(shape.rootFace, new THREE.Matrix4().identity());
  return matrices;
}

function computeShapeBounds(shape, openness) {
  const mainFace = shape.faces[0];
  if (mainFace?.renderType === "cylinder") {
    const radius = mainFace.radius ?? 1;
    const height = mainFace.height ?? 2;
    const sideWidth = Math.PI * 2 * radius;
    const openHeight = height + radius * 4;
    const width = THREE.MathUtils.lerp(radius * 2, sideWidth, openness);
    const depth = THREE.MathUtils.lerp(height, 0.02, openness);
    return {
      center: new THREE.Vector3(0, 0, 0),
      radius: new THREE.Vector3(width, openHeight, depth).length() * 0.5
    };
  }

  const matrices = computeMatrices(shape, openness);
  const box = new THREE.Box3();
  shape.faces.forEach((face) => {
    transformedVertices(face, matrices[face.id]).forEach((vertex) => box.expandByPoint(vertex));
  });
  return {
    center: box.getCenter(new THREE.Vector3()),
    radius: box.getSize(new THREE.Vector3()).length() * 0.5
  };
}

function prepareShape(shape) {
  modelGroup.clear();

  shape.instances = shape.faces.map((face) => {
    const object = createFaceMesh(face);
    modelGroup.add(object);
    return { face, object };
  });

  shape.faces.forEach((face) => {
    face.flatMatrix = face.parent
      ? matrixFromEdgeMatch(face.parent.points, face.points, face.parentEdgeIndices, face.childEdgeIndices)
      : new THREE.Matrix4().identity();
  });

  const openState = computeShapeBounds(shape, 1);
  const closedState = computeShapeBounds(shape, 0);
  shape.openCenter = openState.center;
  shape.closedCenter = closedState.center;
  shape.openRadius = openState.radius;
  shape.closedRadius = closedState.radius;
}

function rebuildShapeFromFace(faceId) {
  if (!currentShape || !faceId || selectedFaceId === faceId) {
    return;
  }

  selectedFaceId = faceId;
  applyRootFace(currentShape, faceId);
  prepareShape(currentShape);
  autoCamera = 1;
}

function updateInfoPanel() {
  ui.shapeName.textContent = currentShape.name;
  ui.shapeDescription.textContent = currentShape.description;
  ui.facesCount.textContent = currentShape.counts.faces;
  ui.edgesCount.textContent = currentShape.counts.edges;
  ui.verticesCount.textContent = currentShape.counts.vertices;
}

function syncOpacityReadout() {
  if (ui.opacityValue) {
    ui.opacityValue.textContent = `${Math.round(faceOpacity * 100)}%`;
  }
}

function syncActionButtons() {
  const isOpen = unfoldTarget > 0.5;
  ui.toolbarOpenButton.classList.toggle("is-active", isOpen);
  ui.toolbarCloseButton.classList.toggle("is-active", !isOpen);
  ui.toggleLabelsButton.classList.toggle("is-active", labelsVisible);
  ui.openButton.classList.toggle("is-active", isOpen);
  ui.closeButton.classList.toggle("is-active", !isOpen);
  ui.fullscreenOpenButton?.classList.toggle("is-active", isOpen);
  ui.fullscreenCloseButton?.classList.toggle("is-active", !isOpen);
  ui.fullscreenButton?.classList.toggle("is-active", document.fullscreenElement === ui.canvasWrap);
}

syncLabelToggleText = function syncLabelToggleTextOverride() {
  ui.toggleLabelsButton.textContent = labelsVisible ? "Ẩn tên mặt" : "Hiện tên mặt";
};

function syncFullscreenButton() {
  if (!ui.fullscreenButton) {
    return;
  }

  const isFullscreen = document.fullscreenElement === ui.canvasWrap;
  ui.fullscreenButton.textContent = isFullscreen ? "Thu nhỏ" : "Toàn màn hình";
  ui.fullscreenButton.classList.toggle("is-active", isFullscreen);
}

function cycleShape() {
  const options = Array.from(ui.shapeSelect.options);
  const currentIndex = Math.max(
    0,
    options.findIndex((option) => option.value === currentShapeKey)
  );
  const nextIndex = (currentIndex + 1) % options.length;
  const nextShape = options[nextIndex].value;
  ui.shapeSelect.value = nextShape;
  setShape(nextShape);
}

function updateModeText() {
  const isOpen = unfoldProgress > 0.96;
  ui.modeBadge.textContent = isOpen ? "Lưới phẳng" : "Khối 3D";
  ui.toolbarTitle.textContent = isOpen ? "Lưới phẳng đang mở" : "Khối 3D có thể xoay";
}

function setShape(shapeKey) {
  currentShapeKey = shapeKey;
  currentShape = SHAPES[shapeKey];
  selectedFaceId = currentShape.initialRootId;
  hoveredFace = null;
  unfoldTarget = 0;
  unfoldProgress = 0;
  prepareShape(currentShape);
  updateInfoPanel();
  syncOpacityReadout();
  showRuntimeMessage("Mô hình đã tải. Bấm vào một mặt để mở từ mặt đó.");
  syncLabelToggleText();
  syncActionButtons();
  const rotation = currentShape.displayRotation ?? { x: 0, y: 0, z: 0 };
  modelPivot.rotation.set(rotation.x, rotation.y, rotation.z);
  resetCamera(true);
}

function resetCamera(immediate = false, delta = 1 / 60) {
  if (!currentShape) {
    return;
  }

  const radius = THREE.MathUtils.lerp(currentShape.closedRadius, currentShape.openRadius, unfoldProgress);
  const distance = Math.max(radius * 2.4, 5.6);
  const closedDirection = new THREE.Vector3(1.45, -1.2, 0.95).normalize();
  const openDirection = currentShapeKey === "cylinder"
    ? new THREE.Vector3(0.02, -0.18, 1).normalize()
    : new THREE.Vector3(0.2, -0.12, 1).normalize();
  const direction = closedDirection.clone().lerp(openDirection, unfoldProgress).normalize();
  const desiredPosition = direction.multiplyScalar(distance);

  controls.minDistance = Math.max(radius * 1.1, 3.6);
  controls.maxDistance = Math.max(radius * 3.7, 10);

  if (immediate) {
    camera.position.copy(desiredPosition);
    controls.target.set(0, 0, 0);
    autoCamera = 0;
    return;
  }

  if (autoCamera <= 0.001) {
    return;
  }

  camera.position.lerp(desiredPosition, 0.15);
  controls.target.lerp(new THREE.Vector3(0, 0, 0), 0.15);
  autoCamera = THREE.MathUtils.damp(autoCamera, 0, 4.2, delta);
}

function applyFaceMatrices() {
  if (!currentShape) {
    return;
  }

  const matrices = computeMatrices(currentShape, unfoldProgress);
  const boundsBox = new THREE.Box3();
  const displayRotation = currentShape.displayRotation ?? { x: 0, y: 0, z: 0 };
  const offset = currentShape.closedCenter
    .clone()
    .lerp(currentShape.openCenter, unfoldProgress)
    .multiplyScalar(-1);

  offset.z += currentShape.baseLift ?? 0;
  modelGroup.position.copy(offset);
  modelPivot.rotation.set(
    displayRotation.x * (1 - unfoldProgress),
    displayRotation.y * (1 - unfoldProgress),
    displayRotation.z * (1 - unfoldProgress)
  );

  currentShape.instances.forEach(({ face, object }) => {
    transformedVertices(face, matrices[face.id]).forEach((vertex) => {
      boundsBox.expandByPoint(vertex.clone().add(offset));
    });
    object.matrix.copy(matrices[face.id]);
    object.matrix.decompose(object.position, object.quaternion, object.scale);
    object.matrixWorldNeedsUpdate = true;
  });

  if (!boundsBox.isEmpty()) {
    gridHelper.position.z = boundsBox.min.z - 0.02;
  }

  gridHelper.material.opacity =
    currentShapeKey === "cylinder"
      ? THREE.MathUtils.lerp(0.82, 0.16, unfoldProgress)
      : 0.82;
}

function updateHover() {
  if (!currentShape) {
    return;
  }

  raycaster.setFromCamera(pointer, camera);
  const targets = currentShape.instances.flatMap(
    (instance) => instance.object.userData.hitMeshes ?? [instance.object.userData.mesh]
  );
  const hits = raycaster.intersectObjects(targets);

  if (hits.length === 0) {
    hoveredFace = null;
    showRuntimeMessage(
      unfoldProgress > 0.96
        ? "Lưới phẳng đang mở. Bấm mặt khác để đổi tâm mở."
        : "Mô hình đã tải. Bấm vào một mặt để mở từ mặt đó."
    );
    return;
  }

  const hitObject = currentShape.instances.find((instance) =>
    (instance.object.userData.hitMeshes ?? [instance.object.userData.mesh]).includes(hits[0].object)
  )?.object;
  hoveredFace = hitObject?.userData.faceId ?? null;
  if (hitObject) {
    showRuntimeMessage(`Đang chọn: ${hitObject.userData.faceName}. Bấm để mở từ mặt này.`);
  }
}

function getHitFaceId() {
  if (!currentShape) {
    return null;
  }

  raycaster.setFromCamera(pointer, camera);
  const targets = currentShape.instances.flatMap(
    (instance) => instance.object.userData.hitMeshes ?? [instance.object.userData.mesh]
  );
  const hits = raycaster.intersectObjects(targets);
  if (hits.length === 0) {
    return null;
  }

  return currentShape.instances.find((instance) =>
    (instance.object.userData.hitMeshes ?? [instance.object.userData.mesh]).includes(hits[0].object)
  )?.face.id ?? null;
}

function activateFace(faceId) {
  if (!faceId) {
    return;
  }

  rebuildShapeFromFace(faceId);
  unfoldTarget = unfoldTarget > 0.5 ? 0 : 1;
  autoCamera = 1;
  syncActionButtons();
}

function updateMaterials() {
  currentShape.instances.forEach(({ face, object }) => {
    const mesh = object.userData.mesh;
    const label = object.userData.label;
    const centerLabel = object.userData.centerLabel;
    const isHovered = hoveredFace === face.id;
    const isSelected = selectedFaceId === face.id;
    const baseOpacity = object.userData.isSphere
      ? 0.34
      : object.userData.isCylinder
        ? THREE.MathUtils.lerp(1, 0.24, unfoldProgress)
        : 1;
    mesh.material.emissive
      .copy(object.userData.defaultColor)
      .multiplyScalar(isHovered ? 0.18 : isSelected ? 0.1 : 0);
    mesh.material.opacity = isHovered || isSelected ? Math.min(1, baseOpacity + 0.12) : baseOpacity;

    if (object.userData.secondaryMeshes) {
      object.userData.secondaryMeshes.forEach((part) => {
        part.material.opacity = object.userData.isCylinder
          ? THREE.MathUtils.lerp(1, 0.4, unfoldProgress)
          : 1;
        part.material.emissive?.setScalar?.(0);
      });
    }

    if (object.userData.isCylinder) {
      const closedOpacity = THREE.MathUtils.smoothstep(1 - unfoldProgress, 0.18, 0.82);
      const openOpacity = THREE.MathUtils.smoothstep(unfoldProgress, 0.18, 0.88);
      const capOffset = object.userData.cylinderLayout.capOffset;
      const animatedCapOffset = THREE.MathUtils.lerp(0, capOffset, openOpacity);

      object.userData.closedGroup.forEach((part) => {
        part.visible = closedOpacity > 0.08;
        if (part.material?.opacity !== undefined) {
          part.material.opacity = part === label ? 0 : closedOpacity;
        }
      });

      object.userData.netMeshes.forEach((part, index) => {
        const boost = isHovered || isSelected ? 0.12 : 0;
        const targetOpacity = index === 0 ? 0.9 : 0.96;
        part.visible = openOpacity > 0.03;
        part.material.opacity = Math.min(0.98, openOpacity * targetOpacity + boost);
      });

      object.userData.netBorders.forEach((part) => {
        part.visible = openOpacity > 0.03;
        part.material.opacity = openOpacity * 0.82;
      });

      object.userData.netMeshes[0].scale.set(1, 1, 1);
      object.userData.netBorders[0].scale.set(1, 1, 1);
      object.userData.netMeshes[1].position.y = animatedCapOffset;
      object.userData.netBorders[1].position.y = animatedCapOffset;
      object.userData.netLabels[0].position.y = animatedCapOffset;
      object.userData.netMeshes[2].position.y = -animatedCapOffset;
      object.userData.netBorders[2].position.y = -animatedCapOffset;
      object.userData.netLabels[2].position.y = -animatedCapOffset;

      object.userData.netLabels.forEach((part) => {
        part.visible = labelsVisible && unfoldProgress > 0.42;
        part.material.opacity = labelsVisible ? openOpacity : 0;
      });
    }

    label.visible = labelsVisible;
    label.material.opacity = !labelsVisible ? 0 : isHovered || isSelected ? 1 : 0.9;
    label.scale.setScalar(isHovered ? 1.28 : isSelected ? 1.22 : 1.15);
    label.scale.y *= 0.5;

    if (object.userData.ringGroup) {
      object.userData.ringGroup.children.forEach((ring) => {
        ring.material.opacity = 0.62;
      });
    }

    if (centerLabel) {
      centerLabel.visible = true;
      centerLabel.material.opacity = 1;
    }
  });
}

function setPointer(event) {
  const rect = ui.canvas.getBoundingClientRect();
  const source = event.touches ? event.touches[0] : event;
  pointer.x = ((source.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((source.clientY - rect.top) / rect.height) * 2 + 1;
}

function onResize() {
  const isCompactLayout = window.innerWidth <= 900 || window.innerHeight <= 720;
  const scale = isCompactLayout ? 1 : Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
  document.documentElement.style.setProperty("--app-scale", `${scale}`);
  const width = ui.canvasWrap.clientWidth;
  const height = ui.canvasWrap.clientHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 1 / 30);

  unfoldProgress = THREE.MathUtils.damp(unfoldProgress, unfoldTarget, UNFOLD_DAMPING, delta);
  applyFaceMatrices();
  updateHover();
  updateMaterials();
  updateModeText();
  resetCamera(false, delta);
  const shouldAutoRotate =
    !isUserOrbiting &&
    autoCamera <= 0.001 &&
    performance.now() - lastInteractionAt > IDLE_AUTOROTATE_DELAY;
  controls.autoRotate = shouldAutoRotate;
  controls.update();
  renderer.render(scene, camera);
}

ui.openButton.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 1;
  autoCamera = 1;
  syncActionButtons();
});

ui.toolbarOpenButton.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 1;
  autoCamera = 1;
  syncActionButtons();
});

ui.fullscreenOpenButton?.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 1;
  autoCamera = 1;
  syncActionButtons();
});

ui.fullscreenShapeButton?.addEventListener("click", () => {
  registerInteraction();
  cycleShape();
});

ui.closeButton.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 0;
  autoCamera = 1;
  syncActionButtons();
});

ui.toolbarCloseButton.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 0;
  autoCamera = 1;
  syncActionButtons();
});

ui.fullscreenCloseButton?.addEventListener("click", () => {
  registerInteraction();
  unfoldTarget = 0;
  autoCamera = 1;
  syncActionButtons();
});

ui.resetButton.addEventListener("click", () => {
  registerInteraction();
  resetCamera(true);
  autoCamera = 1;
});

ui.toggleLabelsButton.addEventListener("click", () => {
  registerInteraction();
  labelsVisible = !labelsVisible;
  syncLabelToggleText();
  syncActionButtons();
});

ui.fullscreenButton?.addEventListener("click", async () => {
  try {
    registerInteraction();
    if (document.fullscreenElement === ui.canvasWrap) {
      await document.exitFullscreen();
    } else {
      await ui.canvasWrap.requestFullscreen();
    }
  } catch (error) {
    showRuntimeMessage(`Không thể mở toàn màn hình: ${error.message}`, true);
  }
});

ui.fullscreenExitButton?.addEventListener("click", async () => {
  try {
    registerInteraction();
    if (document.fullscreenElement === ui.canvasWrap) {
      await document.exitFullscreen();
    }
  } catch (error) {
    showRuntimeMessage(`Không thể thoát toàn màn hình: ${error.message}`, true);
  }
});

document.addEventListener("fullscreenchange", () => {
  syncFullscreenButton();
  syncActionButtons();
  onResize();
});

ui.shapeSelect.addEventListener("change", (event) => {
  registerInteraction();
  setShape(event.target.value);
});

ui.canvas.addEventListener("pointermove", setPointer);
ui.canvas.addEventListener("pointerdown", (event) => {
  registerInteraction();
  touchTapCandidate = { x: event.clientX, y: event.clientY, pointerType: event.pointerType };
});
ui.canvas.addEventListener("pointerup", (event) => {
  if (event.pointerType !== "touch" || !touchTapCandidate) {
    return;
  }

  const moved =
    Math.abs(event.clientX - touchTapCandidate.x) > 14 ||
    Math.abs(event.clientY - touchTapCandidate.y) > 14;
  touchTapCandidate = null;
  if (moved) {
    return;
  }

  setPointer(event);
  activateFace(getHitFaceId());
});
ui.canvas.addEventListener("wheel", registerInteraction, { passive: true });
ui.canvas.addEventListener("touchstart", setPointer, { passive: true });
ui.canvas.addEventListener("touchmove", setPointer, { passive: true });
ui.canvas.addEventListener("touchstart", registerInteraction, { passive: true });
ui.canvas.addEventListener("pointerleave", () => {
  hoveredFace = null;
  pointer.set(2, 2);
  showRuntimeMessage(
    unfoldProgress > 0.96
      ? "Lưới phẳng đang mở. Bấm mặt khác để đổi tâm mở."
      : "Mô hình đã tải. Bấm vào một mặt để mở từ mặt đó."
  );
});

ui.canvas.addEventListener("click", () => {
  registerInteraction();
  activateFace(getHitFaceId() ?? hoveredFace);
});

controls.addEventListener("start", () => {
  isUserOrbiting = true;
  registerInteraction();
});

controls.addEventListener("end", () => {
  isUserOrbiting = false;
  registerInteraction();
});

window.addEventListener("resize", onResize);
window.addEventListener("error", (event) => {
  showRuntimeMessage(`Lỗi JavaScript: ${event.message}`, true);
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = event.reason?.message ?? String(event.reason);
  showRuntimeMessage(`Lỗi tải mô hình: ${reason}`, true);
});

try {
  setShape(currentShapeKey);
  onResize();
  syncFullscreenButton();
  animate();
} catch (error) {
  showRuntimeMessage(`Lỗi khởi tạo: ${error.message}`, true);
  throw error;
}
