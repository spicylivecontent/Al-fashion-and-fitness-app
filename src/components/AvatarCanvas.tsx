"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildBodyModel } from "@/lib/avatar/model";
import { buildBodyParts, buildOutfitParts, type WornGarment } from "@/lib/avatar/parts";
import { buildAvatarGroup, disposeAvatarGroup } from "@/lib/avatar/three";
import type { BodyMeasurements, Sex } from "@/lib/types";

interface Props {
  measurements: BodyMeasurements;
  sex: Sex;
  garments?: WornGarment[];
  /** Färga plaggen efter hur de sitter i stället för i sin egen färg. */
  showFit?: boolean;
  autoRotate?: boolean;
  /** Anropas när användaren väljer en fast vy (fram, sida, bak). */
  onStopRotate?: () => void;
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
  avatar: THREE.Group | null;
}

const NO_GARMENTS: WornGarment[] = [];

/** Roterbar 3D-avatar. Dra för att vrida, nyp eller scrolla för att zooma. */
export function AvatarCanvas({ measurements, sex, garments = NO_GARMENTS, showFit = false, autoRotate = true, onStopRotate }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.setAttribute("aria-label", "3D-avatar");
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
    camera.position.set(1.2, 1.25, 4.4);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x9a948c, 1.25));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2.5, 4, 3.5);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7);
    rim.position.set(-3, 2.5, -3);
    scene.add(key, rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(0.75, 64),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.07 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.002;
    scene.add(floor);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.minDistance = 1.6;
    controls.maxDistance = 7;
    controls.minPolarAngle = Math.PI * 0.2;
    controls.maxPolarAngle = Math.PI * 0.6;
    controls.autoRotateSpeed = 1.6;
    controls.target.set(0, 0.9, 0);

    const stage: Stage = { renderer, scene, camera, controls, avatar: null };
    stageRef.current = stage;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let frame = 0;
    const tick = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      if (stage.avatar) disposeAvatarGroup(stage.avatar);
      floor.geometry.dispose();
      (floor.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const model = buildBodyModel(measurements, sex);
    const outfit = buildOutfitParts(model, measurements, sex, garments, showFit);
    const avatar = buildAvatarGroup(model, [...buildBodyParts(model), ...outfit.parts]);
    if (stage.avatar) {
      stage.scene.remove(stage.avatar);
      disposeAvatarGroup(stage.avatar);
    }
    stage.scene.add(avatar);
    stage.avatar = avatar;
    // Håll hela kroppen i bild oavsett längd.
    const height = measurements.heightCm / 100;
    stage.controls.target.set(0, height * 0.52, 0);
    const distance = stage.camera.position.distanceTo(stage.controls.target);
    const wanted = height * 2.2;
    if (Math.abs(distance - wanted) > 0.6) {
      stage.camera.position.sub(stage.controls.target).setLength(wanted).add(stage.controls.target);
    }
  }, [measurements, sex, garments, showFit]);

  useEffect(() => {
    if (stageRef.current) stageRef.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  /** Ställer kameran rakt framför, vid sidan av eller bakom avataren. */
  const lookFrom = (angle: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    // En fast vy stänger av rotationen, annars snurrar avataren direkt vidare.
    onStopRotate?.();
    const { camera, controls } = stage;
    controls.autoRotate = false;
    const distance = camera.position.distanceTo(controls.target);
    camera.position.set(
      controls.target.x + Math.sin(angle) * distance,
      controls.target.y,
      controls.target.z + Math.cos(angle) * distance,
    );
    controls.update();
  };

  return (
    <div className="avatar-canvas" ref={mountRef}>
      {failed ? (
        <p className="avatar-fallback">3D-vyn kan inte visas i den här webbläsaren.</p>
      ) : (
        <div className="view-buttons" role="group" aria-label="Vy">
          <button type="button" onClick={() => lookFrom(0)}>
            Fram
          </button>
          <button type="button" onClick={() => lookFrom(Math.PI / 2)}>
            Sida
          </button>
          <button type="button" onClick={() => lookFrom(Math.PI)}>
            Bak
          </button>
        </div>
      )}
    </div>
  );
}
