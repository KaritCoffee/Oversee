const MODEL_CACHE = new Map();

const PALETTE = [
  [1.0, 0.48, 0.08, 1.0],
  [0.16, 0.24, 0.3, 1.0],
  [0.08, 0.78, 0.95, 1.0],
  [0.88, 0.94, 0.98, 1.0],
];

export function aircraftModelDataUri(kind = "light") {
  const modelKind = ["jet", "turboprop", "helicopter", "light"].includes(kind) ? kind : "light";
  if (!MODEL_CACHE.has(modelKind)) MODEL_CACHE.set(modelKind, buildModelDataUri(modelKind));
  return MODEL_CACHE.get(modelKind);
}

function buildModelDataUri(kind) {
  const parts = modelParts(kind);
  const binaryChunks = [];
  const bufferViews = [];
  const accessors = [];
  const primitives = [];
  let byteLength = 0;

  for (const part of parts) {
    const geometry = boxGeometry(part.center, part.size);
    const positionView = appendTypedArray(new Float32Array(geometry.positions));
    const indexView = appendTypedArray(new Uint16Array(geometry.indices), 34963);
    const positionAccessor = accessors.push({
      bufferView: positionView,
      componentType: 5126,
      count: geometry.positions.length / 3,
      type: "VEC3",
      min: geometry.min,
      max: geometry.max,
    }) - 1;
    const indexAccessor = accessors.push({
      bufferView: indexView,
      componentType: 5123,
      count: geometry.indices.length,
      type: "SCALAR",
      min: [0],
      max: [7],
    }) - 1;
    primitives.push({ attributes: { POSITION: positionAccessor }, indices: indexAccessor, material: part.material, mode: 4 });
  }

  const binary = new Uint8Array(byteLength);
  let cursor = 0;
  for (const chunk of binaryChunks) {
    cursor = align4(cursor);
    binary.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  const gltf = {
    asset: { version: "2.0", generator: "Oversee low-poly aircraft library" },
    extensionsUsed: ["KHR_materials_unlit"],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    meshes: [{ name: `Oversee ${kind}`, primitives }],
    materials: PALETTE.map((color, index) => ({
      name: ["Signal orange", "Airframe dark", "Cockpit glass", "Rotor light"][index],
      pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0, roughnessFactor: 0.82 },
      extensions: { KHR_materials_unlit: {} },
      doubleSided: true,
    })),
    buffers: [{ byteLength, uri: `data:application/octet-stream;base64,${bytesToBase64(binary)}` }],
    bufferViews,
    accessors,
  };
  return `data:model/gltf+json;base64,${textToBase64(JSON.stringify(gltf))}`;

  function appendTypedArray(typed, target) {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const offset = align4(byteLength);
    const index = bufferViews.push({
      buffer: 0,
      byteOffset: offset,
      byteLength: bytes.byteLength,
      ...(target ? { target } : { target: 34962 }),
    }) - 1;
    binaryChunks.push(bytes);
    byteLength = offset + bytes.byteLength;
    return index;
  }
}

function modelParts(kind) {
  if (kind === "helicopter") {
    return [
      part([0, 0, 2], [5.2, 4.2, 8.5], 0),
      part([0, 0, -6], [1.4, 1.4, 9], 1),
      part([0, 0.2, -11], [4.2, 0.45, 2.2], 1),
      part([0, 2.4, 2], [0.5, 1.8, 0.5], 3),
      part([0, 3.25, 2], [17, 0.18, 0.42], 3),
      part([0, 3.28, 2], [0.42, 0.18, 17], 3),
      part([0, 1.15, 5.5], [4.3, 1.6, 2.2], 2),
      part([-2.1, -2.7, 1], [0.25, 0.3, 8], 3),
      part([2.1, -2.7, 1], [0.25, 0.3, 8], 3),
    ];
  }
  if (kind === "jet") {
    return fixedWingParts({ length: 43, span: 36, bodyWidth: 4.2, wingDepth: 8, tailSpan: 13 });
  }
  if (kind === "turboprop") {
    return [
      ...fixedWingParts({ length: 27, span: 29, bodyWidth: 3.2, wingDepth: 5.5, tailSpan: 10 }),
      part([-6.2, 0, 4.2], [2.2, 2.3, 4.2], 1),
      part([6.2, 0, 4.2], [2.2, 2.3, 4.2], 1),
      part([-6.2, 0, 6.6], [0.22, 8, 0.35], 3),
      part([6.2, 0, 6.6], [0.22, 8, 0.35], 3),
    ];
  }
  return fixedWingParts({ length: 15, span: 12, bodyWidth: 2.2, wingDepth: 3.5, tailSpan: 5.2 });
}

function fixedWingParts({ length, span, bodyWidth, wingDepth, tailSpan }) {
  return [
    part([0, 0, 0], [bodyWidth, bodyWidth, length], 0),
    part([0, -0.25, length * 0.08], [span, 0.55, wingDepth], 1),
    part([0, 0, -length * 0.38], [tailSpan, 0.42, wingDepth * 0.55], 1),
    part([0, bodyWidth * 0.72, -length * 0.4], [0.55, bodyWidth * 1.7, wingDepth * 0.55], 1),
    part([0, bodyWidth * 0.52, length * 0.3], [bodyWidth * 0.76, bodyWidth * 0.62, length * 0.16], 2),
    part([0, 0, length * 0.53], [bodyWidth * 0.7, bodyWidth * 0.7, length * 0.08], 3),
  ];
}

function part(center, size, material) {
  return { center, size, material };
}

function boxGeometry(center, size) {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map((value) => value / 2);
  const positions = [
    cx - sx, cy - sy, cz - sz,
    cx + sx, cy - sy, cz - sz,
    cx + sx, cy + sy, cz - sz,
    cx - sx, cy + sy, cz - sz,
    cx - sx, cy - sy, cz + sz,
    cx + sx, cy - sy, cz + sz,
    cx + sx, cy + sy, cz + sz,
    cx - sx, cy + sy, cz + sz,
  ];
  return {
    positions,
    indices: [
      0, 2, 1, 0, 3, 2,
      4, 5, 6, 4, 6, 7,
      0, 1, 5, 0, 5, 4,
      3, 7, 6, 3, 6, 2,
      0, 4, 7, 0, 7, 3,
      1, 2, 6, 1, 6, 5,
    ],
    min: [cx - sx, cy - sy, cz - sz],
    max: [cx + sx, cy + sy, cz + sz],
  };
}

function align4(value) {
  return Math.ceil(value / 4) * 4;
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 8192;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return encodeBase64(binary);
}

function textToBase64(value) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function encodeBase64(value) {
  if (typeof globalThis.btoa === "function") return globalThis.btoa(value);
  if (globalThis.Buffer) return globalThis.Buffer.from(value, "binary").toString("base64");
  throw new Error("Base64 encoding is unavailable");
}
