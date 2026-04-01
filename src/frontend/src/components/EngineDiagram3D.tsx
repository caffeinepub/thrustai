import { Grid, OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Suspense, useMemo, useRef } from "react";
import * as THREE from "three";

interface EngineDiagram3DProps {
  massFlow: number;
  turbineInletTemp: number;
  netThrustKN: number;
  bypassRatio: number;
}

// Fan blade ring — animated
function FanBlades({
  count,
  radius,
  posZ,
  speedMultiplier,
  bladeWidth = 0.07,
  bladeHeight = 0.55,
  color = "#a0b8d8",
}: {
  count: number;
  radius: number;
  posZ: number;
  speedMultiplier: number;
  bladeWidth?: number;
  bladeHeight?: number;
  color?: string;
}) {
  const groupRef = useRef<THREE.Group>(null);
  useFrame((_, delta) => {
    if (groupRef.current) {
      groupRef.current.rotation.z += delta * speedMultiplier;
    }
  });

  const blades = useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * Math.PI * 2;
      return { angle, key: i };
    });
  }, [count]);

  return (
    <group ref={groupRef} position={[0, 0, posZ]}>
      {blades.map(({ angle, key }) => (
        <mesh
          key={key}
          position={[Math.cos(angle) * radius, Math.sin(angle) * radius, 0]}
          rotation={[0, 0, angle + Math.PI / 2]}
        >
          <boxGeometry args={[bladeWidth, bladeHeight, 0.03]} />
          <meshStandardMaterial
            color={color}
            metalness={0.85}
            roughness={0.15}
          />
        </mesh>
      ))}
      {/* Hub */}
      <mesh>
        <cylinderGeometry args={[0.12, 0.12, 0.06, 16]} />
        <meshStandardMaterial color="#667788" metalness={0.9} roughness={0.1} />
      </mesh>
    </group>
  );
}

// Compressor disk
function CompressorDisk({ posZ, radius }: { posZ: number; radius: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.z += delta * 1.5;
    }
  });
  return (
    <mesh ref={meshRef} position={[0, 0, posZ]} rotation={[Math.PI / 2, 0, 0]}>
      <cylinderGeometry args={[radius, radius * 1.05, 0.06, 32]} />
      <meshStandardMaterial color="#6a8aaa" metalness={0.8} roughness={0.2} />
    </mesh>
  );
}

// Combustion chamber glow
function CombustionChamber({ intensity }: { intensity: number }) {
  const meshRef = useRef<THREE.Mesh>(null);
  const lightRef = useRef<THREE.PointLight>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const pulse = 0.7 + 0.3 * Math.sin(t * 3.5);
    const glow = intensity * pulse;
    if (meshRef.current) {
      const mat = meshRef.current.material as THREE.MeshStandardMaterial;
      mat.emissiveIntensity = glow;
    }
    if (lightRef.current) {
      lightRef.current.intensity = glow * 4;
    }
  });

  return (
    <group>
      {/* Outer casing */}
      <mesh position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.38, 0.38, 0.7, 32, 1, true]} />
        <meshStandardMaterial
          color="#441100"
          metalness={0.6}
          roughness={0.4}
          side={THREE.BackSide}
        />
      </mesh>
      {/* Inner glow */}
      <mesh ref={meshRef} position={[0, 0, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.65, 24]} />
        <meshStandardMaterial
          color="#ff4400"
          emissive="#ff2200"
          emissiveIntensity={intensity}
          metalness={0.2}
          roughness={0.5}
          transparent
          opacity={0.85}
        />
      </mesh>
      {/* Point light inside combustion chamber */}
      <pointLight
        ref={lightRef}
        color="#ff5500"
        intensity={intensity * 4}
        distance={3}
        decay={2}
        position={[0, 0, 0]}
      />
    </group>
  );
}

// Exhaust plume
function ExhaustPlume({ flameLength }: { flameLength: number }) {
  const coneRef = useRef<THREE.Mesh>(null);
  const outerRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const flicker = 0.88 + 0.12 * Math.sin(t * 8.3);
    const scale = flameLength * flicker;
    if (coneRef.current) {
      coneRef.current.scale.set(1, scale, 1);
    }
    if (outerRef.current) {
      outerRef.current.scale.set(1, scale * 0.7, 1);
      const mat = outerRef.current.material as THREE.MeshStandardMaterial;
      mat.opacity = 0.35 * scale;
    }
  });

  return (
    <group position={[0, 0, -2.2]}>
      {/* Core blue-white flame */}
      <mesh
        ref={coneRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.5]}
      >
        <coneGeometry args={[0.18, 1.8, 16, 1, true]} />
        <meshStandardMaterial
          color="#88ccff"
          emissive="#4499ff"
          emissiveIntensity={2}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* Outer orange halo */}
      <mesh
        ref={outerRef}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, -0.3]}
      >
        <coneGeometry args={[0.32, 1.4, 16, 1, true]} />
        <meshStandardMaterial
          color="#ff6600"
          emissive="#ff3300"
          emissiveIntensity={1.5}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
        />
      </mesh>
    </group>
  );
}

// Main engine assembly
function TurbofanEngine({
  massFlow,
  turbineInletTemp,
  netThrustKN,
  bypassRatio,
}: EngineDiagram3DProps) {
  // Normalize values
  const rotSpeed = ((massFlow - 50) / 450) * 3.5 + 0.8; // 0.8 – 4.3 rad/s
  const glowIntensity = (turbineInletTemp - 1200) / 800; // 0–1
  const flameLength = Math.min(2, Math.max(0.1, netThrustKN / 80)); // 0.1–2
  const fanRadius = 0.55 + bypassRatio * 0.025; // bigger fan for higher BPR

  return (
    <group>
      {/* ── Outer nacelle ── */}
      {/* Inlet cowl */}
      <mesh position={[0, 0, 1.9]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.58, 0.72, 0.4, 40]} />
        <meshStandardMaterial color="#3a4a5a" metalness={0.9} roughness={0.1} />
      </mesh>
      {/* Main barrel */}
      <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.72, 0.7, 2.8, 40, 1, true]} />
        <meshStandardMaterial
          color="#2a3a4a"
          metalness={0.85}
          roughness={0.15}
          side={THREE.FrontSide}
        />
      </mesh>
      {/* Nozzle convergence */}
      <mesh position={[0, 0, -1.5]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.38, 0.7, 0.8, 40]} />
        <meshStandardMaterial color="#222f3a" metalness={0.9} roughness={0.1} />
      </mesh>

      {/* ── Fan (front) ── */}
      <FanBlades
        count={12}
        radius={fanRadius}
        posZ={1.65}
        speedMultiplier={rotSpeed}
        bladeHeight={fanRadius - 0.12}
        color="#8aa8c8"
      />

      {/* ── Compressor stages ── */}
      <CompressorDisk posZ={1.0} radius={0.52} />
      <CompressorDisk posZ={0.5} radius={0.46} />
      <CompressorDisk posZ={0.0} radius={0.42} />

      {/* ── Combustion chamber ── */}
      <group position={[0, 0, -0.35]}>
        <CombustionChamber intensity={glowIntensity} />
      </group>

      {/* ── Turbine blades (rear) ── */}
      <FanBlades
        count={8}
        radius={0.35}
        posZ={-0.9}
        speedMultiplier={rotSpeed * 1.4}
        bladeHeight={0.28}
        bladeWidth={0.06}
        color="#c8a040"
      />
      <FanBlades
        count={8}
        radius={0.35}
        posZ={-1.15}
        speedMultiplier={rotSpeed * 1.4}
        bladeHeight={0.28}
        bladeWidth={0.06}
        color="#b89030"
      />

      {/* ── Shaft ── */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.06, 0.06, 4, 16]} />
        <meshStandardMaterial
          color="#556677"
          metalness={0.95}
          roughness={0.05}
        />
      </mesh>

      {/* ── Exhaust flame ── */}
      <ExhaustPlume flameLength={flameLength} />
    </group>
  );
}

// Scene wrapper
function Scene(props: EngineDiagram3DProps) {
  return (
    <>
      <ambientLight intensity={0.25} color="#334455" />
      <directionalLight
        position={[4, 5, 3]}
        intensity={1.8}
        color="#aaccee"
        castShadow
      />
      <directionalLight
        position={[-3, -2, -4]}
        intensity={0.4}
        color="#224466"
      />

      <TurbofanEngine {...props} />

      <Grid
        position={[0, -1.1, 0]}
        args={[10, 10]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1a2a3a"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#2a3f55"
        fadeDistance={8}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      <OrbitControls
        enablePan={false}
        minDistance={2}
        maxDistance={8}
        autoRotate={false}
        enableDamping
        dampingFactor={0.08}
      />
    </>
  );
}

export function EngineDiagram3D(props: EngineDiagram3DProps) {
  return (
    <div
      className="w-full h-full rounded-t overflow-hidden"
      style={{ background: "oklch(8% 0.02 230)" }}
    >
      <Suspense
        fallback={
          <div className="w-full h-full flex items-center justify-center text-[11px] text-muted-foreground tracking-widest animate-pulse">
            LOADING ENGINE...
          </div>
        }
      >
        <Canvas
          camera={{ position: [3.5, 1.8, 3.5], fov: 45 }}
          shadows
          gl={{ antialias: true }}
          style={{ background: "transparent" }}
        >
          <Scene {...props} />
        </Canvas>
      </Suspense>
    </div>
  );
}
