// Gör om avatarens delar (ringar och ellipsoider) till three.js-geometri.

import * as THREE from "three";
import { superellipsePoint } from "../body/superellipse";
import type { BodyModel, Ring } from "./model";
import type { Part, Rgb } from "./parts";

const SEGMENTS = 48;

/** Spänner en yta över en följd av tvärsnitt. */
export function loftGeometry(
  rings: Ring[],
  capStart: boolean,
  capEnd: boolean,
  mirror = false,
  ringColors?: Rgb[],
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const sx = mirror ? -1 : 1;

  rings.forEach((r, i) => {
    for (let j = 0; j < SEGMENTS; j++) {
      const [dx, dz] = superellipsePoint(r.a, r.b, r.n, (j / SEGMENTS) * Math.PI * 2);
      positions.push(sx * r.x + dx, r.y, r.z + dz);
      if (ringColors) colors.push(...ringColors[i]);
    }
  });

  // Vänd trianglarna om ringarna går nedåt, så att normalerna alltid pekar utåt.
  const ascending = rings[rings.length - 1].y >= rings[0].y;
  const tri = (a: number, b: number, c: number) => (ascending ? indices.push(a, b, c) : indices.push(a, c, b));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < SEGMENTS; j++) {
      const j2 = (j + 1) % SEGMENTS;
      const p0 = i * SEGMENTS + j;
      const p1 = i * SEGMENTS + j2;
      const p2 = (i + 1) * SEGMENTS + j;
      const p3 = (i + 1) * SEGMENTS + j2;
      tri(p0, p2, p1);
      tri(p1, p2, p3);
    }
  }

  const cap = (ringIndex: number, start: boolean) => {
    const r = rings[ringIndex];
    const center = positions.length / 3;
    positions.push(sx * r.x, r.y, r.z);
    if (ringColors) colors.push(...ringColors[ringIndex]);
    for (let j = 0; j < SEGMENTS; j++) {
      const a = ringIndex * SEGMENTS + j;
      const b = ringIndex * SEGMENTS + ((j + 1) % SEGMENTS);
      if (start) tri(center, a, b);
      else tri(center, b, a);
    }
  };
  if (capStart) cap(0, true);
  if (capEnd) cap(rings.length - 1, false);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (ringColors) geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const unitSphere = new THREE.SphereGeometry(1, 32, 20);

/** Bygger hela avataren. Enheten är meter (modellen räknar i centimeter). */
export function buildAvatarGroup(model: BodyModel, parts: Part[]): THREE.Group {
  const root = new THREE.Group();
  root.scale.setScalar(0.01);

  const [px, py, pz] = model.armPivot;
  const armL = new THREE.Group();
  armL.position.set(px, py, pz);
  armL.rotation.z = model.armAngle;
  const armR = new THREE.Group();
  armR.position.set(-px, py, pz);
  armR.rotation.z = -model.armAngle;
  root.add(armL, armR);
  const frames = { world: root, armL, armR } as const;

  const materials = new Map<string, THREE.Material>();
  const materialFor = (part: Part, vertexColors: boolean) => {
    const key = `${part.role}:${vertexColors ? "fit" : part.color}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: vertexColors ? "#ffffff" : part.color,
        vertexColors,
        roughness: part.role === "body" ? 0.7 : 0.92,
        metalness: 0,
        side: part.role === "body" ? THREE.FrontSide : THREE.DoubleSide,
      });
      materials.set(key, material);
    }
    return material;
  };

  for (const part of parts) {
    let mesh: THREE.Mesh;
    if (part.type === "loft") {
      const geometry = loftGeometry(part.rings, part.capStart, part.capEnd, part.mirror && part.frame === "world", part.ringColors);
      mesh = new THREE.Mesh(geometry, materialFor(part, Boolean(part.ringColors)));
    } else {
      mesh = new THREE.Mesh(unitSphere, materialFor(part, false));
      const flip = part.mirror && part.frame === "world" ? -1 : 1;
      mesh.position.set(flip * part.center[0], part.center[1], part.center[2]);
      mesh.scale.set(part.radii[0], part.radii[1], part.radii[2]);
    }
    frames[part.frame].add(mesh);
  }
  return root;
}

/** Frigör GPU-minne för en avatar som inte längre visas. */
export function disposeAvatarGroup(group: THREE.Group) {
  const materials = new Set<THREE.Material>();
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry !== unitSphere) obj.geometry.dispose();
      materials.add(obj.material as THREE.Material);
    }
  });
  materials.forEach((m) => m.dispose());
}
