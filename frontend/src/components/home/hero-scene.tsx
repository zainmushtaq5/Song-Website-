"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";

const BAR_COUNT = { full: 120, lite: 56 } as const;
const PARTICLE_COUNT = { full: 240, lite: 80 } as const;
const RING_RADIUS = 2.45;
const RING_CENTRE: [number, number, number] = [1.75, 0, 0];
/** Tablet tier: half the frames, not just fewer objects. */
const LITE_FPS = 30;

/**
 * Deterministic "spectrum" for one bar.
 *
 * Deliberately not random: the reduced-motion single frame has to look composed
 * without ever ticking a clock, and the same inputs must give the same picture.
 */
function spectrumValue(index: number, time: number): number {
  const standing = 0.24 + 0.12 * Math.sin(index * 0.63);
  const travelling = 0.16 * Math.sin(index * 0.24 - time * 1.35);
  const beat = 0.42 * Math.pow(Math.max(0, Math.sin(index * 0.09 - time * 0.6)), 8);
  const shimmer = 0.05 * Math.sin(index * 1.9 + time * 2.4);
  return Math.min(1.55, Math.max(0.14, standing + travelling + beat + shimmer));
}

function BarRing({
  count,
  accent,
  accentStrong,
  reduced,
  mirrored,
  subtle,
  pointerRef,
}: {
  count: number;
  accent: string;
  accentStrong: string;
  reduced: boolean;
  mirrored: boolean;
  /** Tablet tier: dimmed so it reads as ambience under the copy. */
  subtle: boolean;
  pointerRef: React.RefObject<{ x: number; y: number }>;
}) {
  const group = useRef<THREE.Group>(null);
  const main = useRef<THREE.InstancedMesh>(null);
  const reflection = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  const colours = useMemo(() => {
    const from = new THREE.Color(accent);
    const to = new THREE.Color(accentStrong);
    const mix = new THREE.Color();
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      mix.copy(from).lerp(to, i / Math.max(1, count - 1));
      array[i * 3] = mix.r;
      array[i * 3 + 1] = mix.g;
      array[i * 3 + 2] = mix.b;
    }
    return array;
  }, [accent, accentStrong, count]);

  const writeBars = (time: number) => {
    const mesh = main.current;
    if (!mesh) return;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const height = spectrumValue(i, time);
      dummy.position.set(
        RING_CENTRE[0] + Math.cos(angle) * RING_RADIUS,
        height * 0.62,
        RING_CENTRE[2] + Math.sin(angle) * RING_RADIUS,
      );
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(1, height, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;

    // The reflection is the same geometry upside down — one buffer copy, no
    // second round of maths.
    if (reflection.current) {
      reflection.current.instanceMatrix.array.set(mesh.instanceMatrix.array);
      reflection.current.instanceMatrix.needsUpdate = true;
    }
  };

  // instanceColor must exist before the material compiles its program.
  useLayoutEffect(() => {
    for (const mesh of [main.current, reflection.current]) {
      if (!mesh) continue;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(colours, 3);
      (mesh.material as THREE.Material).needsUpdate = true;
    }
  }, [colours, mirrored]);

  // Reduced motion: compose the single frame that will ever be drawn.
  useLayoutEffect(() => {
    if (!reduced) return;
    if (group.current) group.current.rotation.y = 0.4;
    writeBars(0);
  }, [reduced, writeBars]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const pointer = pointerRef.current ?? { x: 0, y: 0 };
    if (group.current) {
      group.current.rotation.y = 0.4 + Math.sin(t * 0.09) * 0.13 + pointer.x * 0.22;
      group.current.rotation.x = THREE.MathUtils.lerp(
        group.current.rotation.x,
        pointer.y * 0.05,
        0.05,
      );
    }
    writeBars(t);
  });

  return (
    <group ref={group}>
      <instancedMesh ref={main} args={[undefined, undefined, count]} frustumCulled={false}>
        <boxGeometry args={[0.085, 1, 0.085]} />
        <meshBasicMaterial toneMapped={false} transparent opacity={subtle ? 0.7 : 1} />
      </instancedMesh>

      {mirrored && (
        <group scale={[1, -1, 1]} position={[0, -0.16, 0]}>
          <instancedMesh ref={reflection} args={[undefined, undefined, count]} frustumCulled={false}>
            <boxGeometry args={[0.085, 1, 0.085]} />
            <meshBasicMaterial toneMapped={false} transparent opacity={0.22} />
          </instancedMesh>
        </group>
      )}
    </group>
  );
}

function Particles({ count, colour, subtle }: { count: number; colour: string; subtle: boolean }) {
  const points = useRef<THREE.Points>(null);

  const positions = useMemo(() => {
    const array = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      // Deterministic spiral shell — no Math.random, so the static frame is
      // composed rather than accidental.
      const t = i / count;
      const angle = t * Math.PI * 12;
      const radius = 1.9 + (i % 7) * 0.34;
      array[i * 3] = Math.cos(angle) * radius + RING_CENTRE[0];
      array[i * 3 + 1] = Math.sin(t * Math.PI * 5) * 1.5;
      array[i * 3 + 2] = Math.sin(angle) * radius;
    }
    return array;
  }, [count]);

  useFrame((state) => {
    if (points.current) points.current.rotation.y = state.clock.elapsedTime * 0.03;
  });

  return (
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.05}
        sizeAttenuation
        color={colour}
        transparent
        opacity={subtle ? 0.32 : 0.5}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/** Thin halo under the bar ring, purely to anchor the composition. */
function Halo({ colour }: { colour: string }) {
  return (
    <mesh position={[RING_CENTRE[0], -0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[RING_RADIUS + 0.75, RING_RADIUS + 0.77, 96]} />
      <meshBasicMaterial color={colour} transparent opacity={0.35} side={THREE.DoubleSide} />
    </mesh>
  );
}

/**
 * Tablet tier: instead of letting rAF run at the display rate and skipping
 * work, the loop itself is driven at 30fps — half the GPU work, same motion.
 */
function CappedFps({ fps }: { fps: number }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    const handle = window.setInterval(() => invalidate(1), 1000 / fps);
    return () => window.clearInterval(handle);
  }, [fps, invalidate]);
  return null;
}

/** Demand mode draws nothing on its own; re-arm after scrolling back in. */
function RedrawOnActivate({ active }: { active: boolean }) {
  const invalidate = useThree((state) => state.invalidate);
  useEffect(() => {
    if (active) invalidate();
  }, [active, invalidate]);
  return null;
}

export interface HeroSceneProps {
  tier: "lite" | "full";
  /** Hero is on screen and the tab is visible. */
  active: boolean;
  /** prefers-reduced-motion: one static frame, no animation loop. */
  reduced: boolean;
  accent: string;
  accentStrong: string;
}

export default function HeroScene({ tier, active, reduced, accent, accentStrong }: HeroSceneProps) {
  const full = tier === "full";
  const pointer = useRef({ x: 0, y: 0 });

  // Pointer parallax without pointer events on the canvas (the layer is
  // decorative and click-through, so it never receives them).
  useEffect(() => {
    if (!full || reduced) return;
    const onMove = (event: PointerEvent) => {
      pointer.current = {
        x: (event.clientX / window.innerWidth) * 2 - 1,
        y: (event.clientY / window.innerHeight) * 2 - 1,
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [full, reduced]);

  // Rendering modes:
  //   full + active      -> "always": the rAF loop
  //   lite + active      -> "demand": driven by CappedFps at 30fps
  //   reduced + active   -> "demand": exactly one frame, nothing invalidates it
  //   inactive           -> "never": off-screen or hidden tab, no frames at all
  const frameloop = !active ? "never" : reduced || tier === "lite" ? "demand" : "always";

  return (
    <Canvas
      frameloop={frameloop}
      dpr={full ? [1, 1.75] : 1}
      camera={{ position: [0, 0.35, 7.2], fov: 42 }}
      gl={{ alpha: true, antialias: full, powerPreference: "high-performance" }}
      style={{ position: "absolute", inset: 0 }}
    >
      {tier === "lite" && active && !reduced && <CappedFps fps={LITE_FPS} />}
      <RedrawOnActivate active={active} />
      {/*
        On desktop the ring sits to the right of the copy. A tablet hero is
        full-width and stacked, so the same framing would run straight through
        the headline: there the scene drops below the copy, shrinks and dims.
      */}
      <group position={full ? [0, 0, 0] : [0, -1.15, -0.4]} scale={full ? 1 : 0.72}>
        <BarRing
          count={full ? BAR_COUNT.full : BAR_COUNT.lite}
          accent={accent}
          accentStrong={accentStrong}
          reduced={reduced}
          mirrored={full}
          subtle={!full}
          pointerRef={pointer}
        />
        <Halo colour={accent} />
        <Particles
          count={full ? PARTICLE_COUNT.full : PARTICLE_COUNT.lite}
          colour={accentStrong}
          subtle={!full}
        />
      </group>
    </Canvas>
  );
}

