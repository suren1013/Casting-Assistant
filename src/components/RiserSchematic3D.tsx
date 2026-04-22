import React from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Bounds } from '@react-three/drei';
import * as THREE from 'three';

interface RiserSchematic3DProps {
  shape: 'cube' | 'plate' | 'cylinder';
  dims: { a: number; l: number; w: number; t: number; d: number; h: number };
  riserDia: number;
  riserHeight: number;
  isBlind: boolean;
}

export default function RiserSchematic3D({ shape, dims, riserDia, riserHeight, isBlind }: RiserSchematic3DProps) {
  // Normalize dimensions to fit nicely in view
  const maxDim = Math.max(dims.a, dims.l, dims.w, dims.t, dims.d, dims.h, riserHeight * 2);
  const s = 4 / maxDim; // scale factor

  // Y offsets
  let castingYOffset = 0;
  let topY = 0;
  
  if (shape === 'cube') {
    topY = dims.a / 2 * s;
  } else if (shape === 'plate') {
    topY = dims.t / 2 * s;
  } else if (shape === 'cylinder') {
    topY = dims.h / 2 * s;
  }

  // Materials
  const castingMaterial = new THREE.MeshStandardMaterial({
    color: '#3f3f46',
    metalness: 0.6,
    roughness: 0.4
  });

  const riserMaterial = new THREE.MeshStandardMaterial({
    color: '#10b981',
    metalness: 0.5,
    roughness: 0.3,
    transparent: true,
    opacity: isBlind ? 0.95 : 0.6
  });

  return (
    <Canvas camera={{ position: [-5, 5, 5], fov: 45 }}>
      <ambientLight intensity={0.5} />
      <directionalLight position={[10, 10, 5]} intensity={1.5} />
      <OrbitControls makeDefault />

      <group position={[0, -Math.max(topY, riserHeight * s * 0.5) * 0.5, 0]}>
        {/* Casting Mesh */}
        <mesh castShadow receiveShadow material={castingMaterial}>
          {shape === 'cube' && <boxGeometry args={[dims.a * s, dims.a * s, dims.a * s]} />}
          {shape === 'plate' && <boxGeometry args={[dims.l * s, dims.t * s, dims.w * s]} />}
          {shape === 'cylinder' && <cylinderGeometry args={[dims.d / 2 * s, dims.d / 2 * s, dims.h * s, 64]} />}
        </mesh>

        {/* Riser Mesh */}
        <mesh position={[0, topY + (riserHeight * s) / 2, 0]} material={riserMaterial}>
          <cylinderGeometry args={[riserDia / 2 * s, riserDia / 2 * s, riserHeight * s, 64]} />
        </mesh>

        {/* Top Cover Visual Indicator for Open/Blind */}
        {isBlind ? (
          <mesh position={[0, topY + (riserHeight * s) + 0.01, 0]}>
            <cylinderGeometry args={[riserDia / 2 * s, riserDia / 2 * s, 0.05, 64]} />
            <meshStandardMaterial color="#059669" metalness={0.8} roughness={0.2} />
          </mesh>
        ) : (
          <mesh position={[0, topY + (riserHeight * s) + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[(riserDia / 2 * s) * 0.7, riserDia / 2 * s * 1.05, 64]} />
            <meshBasicMaterial color="#ef4444" side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>

      <Grid infiniteGrid fadeDistance={15} sectionColor="#27272a" cellColor="#18181b" />
      <Environment preset="city" />
    </Canvas>
  );
}
