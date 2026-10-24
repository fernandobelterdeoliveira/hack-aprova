"use client"

import React, { useRef, useState } from "react"
import { useFrame } from "@react-three/fiber"
import { Html, Environment, useTexture } from "@react-three/drei"
import { Button } from "@/components/ui/button"
import * as THREE from "three"
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link"

import { termOfServices } from "../lib/term-of-services"
import { privacyPolicy } from "../lib/privacy-policy"

// Presentational components used inside the motion containers
type ViewToggle = (view: "landing" | "terms" | "privacy") => void

const Landing: React.FC<{ onToggle?: ViewToggle }> = ({ onToggle }) => (
  <div className="h-full w-full relative flex justify-center items-center">
    <div className="h-[80.5%] w-[60.1%] rounded-2xl border-2 border-white pointer-events-auto text-white">
      <div className="h-[80%] w-[60%] z-[-1] absolute rounded-2xl backdrop-blur-md bg-black/30"></div>
      <div className=" w-full h-full">
        {/* Header with logo */}
        <header className="p-6 pointer-events-auto"></header>

        {/* Main content */}
        <div className="flex flex-col items-center justify-center h-[calc(100vh-120px)] px-4">
          <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl text-center mb-16 text-white text-balance drop-shadow-lg">
            Bem-vindo à Simply Law Consulting
          </h1>

          {/* Button positioned in center */}
          <div className="pointer-events-auto">
            <Link href="/dashboard">
              <Button
                size="lg"
                className="bg-white text-gray-900 hover:bg-white/90 shadow-lg px-8 py-6 text-base font-medium rounded-full"
              >
                Começar
              </Button>
            </Link>
          </div>

          {/* Footer text */}
          <div className="mt-16 text-xs text-white/80 text-center max-w-md drop-shadow flex flex-row">
            Ao continuar, você concorda com os
            
            <button onClick={() => onToggle && onToggle("terms")} className="z-10">
              <div className="font-bold cursor-pointer">&nbsp;Termos de Uso&nbsp;</div>
            </button>
            
            e a
            <button onClick={() => onToggle && onToggle("privacy")} className="z-10">
              <div className="font-bold cursor-pointer">&nbsp;Política de Privacidade&nbsp;</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
)

// --- TERMS OF SERVICE ---
const TermsOfServices: React.FC<{ onToggle?: ViewToggle }> = ({ onToggle }) => (
  <div className="h-full w-full relative flex justify-center items-center">
    {/* Outer glass container */}
    <div className="relative h-[90%] w-[70%] rounded-2xl border-2 border-white text-white overflow-hidden">
      {/* Blurred background */}
      <div className="absolute inset-0 z-[-1] rounded-2xl backdrop-blur-md bg-black/30"></div>

      {/* Scrollable content area */}
      <div className="h-full w-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent">
        <h2 className="text-2xl font-bold mb-4">Termos de Uso</h2>
        <pre className="whitespace-pre-line text-sm text-white/80 leading-relaxed">
          {termOfServices}
        </pre>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => onToggle && onToggle("landing")} variant="ghost">
            Voltar
          </Button>
        </div>
      </div>
    </div>
  </div>
);

// --- PRIVACY POLICY ---
const PrivacyPolicy: React.FC<{ onToggle?: ViewToggle }> = ({ onToggle }) => (
  <div className="h-full w-full relative flex justify-center items-center">
    {/* Outer glass container */}
    <div className="relative h-[90%] w-[70%] rounded-2xl border-2 border-white text-white overflow-hidden">
      {/* Blurred background */}
      <div className="absolute inset-0 z-[-1] rounded-2xl backdrop-blur-md bg-black/30"></div>

      {/* Scrollable content area */}
      <div className="h-full w-full overflow-y-auto p-6 scrollbar-thin scrollbar-thumb-white/30 scrollbar-track-transparent">
        <h2 className="text-2xl font-bold mb-4">Política de Privacidade</h2>
        <pre className="whitespace-pre-line text-sm text-white/80 leading-relaxed">
          {privacyPolicy}
        </pre>
        <div className="mt-6 flex justify-end">
          <Button onClick={() => onToggle && onToggle("landing")} variant="ghost">
            Voltar
          </Button>
        </div>
      </div>
    </div>
  </div>
);


export function CometScene() {
  const skydomeRef = useRef<THREE.Mesh>(null)
  // Use separate refs for each sphere so they don't overwrite each other
  const leftSphereRef = useRef<THREE.Mesh>(null)
  const rightSphereRef = useRef<THREE.Mesh>(null)

  // load skydome texture via hook so the loader lifecycle is managed by R3F
  const skyTexture = useTexture('/clouds.png')

  // avoid mutating the texture returned from the hook (linter/immutability concerns)
  // clone and configure a copy that we pass to the material
  const configuredSkyTexture = skyTexture
    ? (() => {
        const t = skyTexture.clone()
        // set encoding and orientation for proper colors and mapping
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(t as any).encoding = (THREE as any).sRGBEncoding
        t.flipY = false
        t.needsUpdate = true
        return t
      })()
    : undefined

  // local state for Framer Motion switching (which view to show)
  const [view, setView] = useState<"landing" | "terms" | "privacy">("landing")

  // Vertical slide: enter from above, center rides in, exit slides down
  const variants = {
    enter: { y: "100%", opacity: 0 },
    center: { y: 0, opacity: 1 },
    exit: { y: "100%", opacity: 0 },
  }

  // Rotate the skydome slowly
  useFrame((state, delta) => {
    if (skydomeRef.current) {
      skydomeRef.current.rotation.y += delta * 0.05
    }
    // Rotate both spheres independently
    if (leftSphereRef.current) {
      leftSphereRef.current.rotation.x = Math.sin(state.clock.elapsedTime * 0.3) * 0.2
      leftSphereRef.current.rotation.y += delta * 0.2
    }
    if (rightSphereRef.current) {
      // use a slightly different speed/phase for variety
      rightSphereRef.current.rotation.x = Math.cos(state.clock.elapsedTime * 0.35) * 0.2
      rightSphereRef.current.rotation.y -= delta * 0.18
    }
  })

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.8} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <pointLight position={[-10, -10, -5]} intensity={0.5} color="#ff8c5a" />

      {/* Environment for reflections */}
      <Environment preset="sunset" />

      {/* Rotating Skydome */}
      {/* Skydome texture loaded via useTexture for proper lifecycle & encoding */}
      <mesh ref={skydomeRef} scale={[-1, 1, 1]}>
        <sphereGeometry args={[5, 100, 100]} />
        {/* map is provided as a configured clone so we don't mutate hook return */}
        <meshBasicMaterial side={THREE.BackSide} map={configuredSkyTexture} />
      </mesh>

      {/* Torus with gradient material */}
      <mesh ref={leftSphereRef} position={[-3, 0, -1.5]}>
        <sphereGeometry args={[2, 100, 100]} />
        <meshStandardMaterial
          color="#AB6609"
          emissive="#2d5a5a"
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* Torus with gradient material */}
      <mesh ref={rightSphereRef} position={[3, 0, -1.5]}>
        <sphereGeometry args={[2, 100, 100]} />
        <meshStandardMaterial
          color="#AB6609"
          emissive="#2d5a5a"
          emissiveIntensity={0.5}
          metalness={0.8}
          roughness={0.2}
        />
      </mesh>

      {/* HTML Overlay for UI elements */}
      <Html fullscreen>
        <AnimatePresence initial={false} mode="wait">
          {view === "landing" && (
            <motion.div
              key="landing"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute h-full w-full"
            >
              <Landing onToggle={(v) => setView(v)} />
            </motion.div>
          )}

          {view === "terms" && (
            <motion.div
              key="terms"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute h-full w-full"
            >
              <TermsOfServices onToggle={(v) => setView(v)} />
            </motion.div>
          )}

          {view === "privacy" && (
            <motion.div
              key="privacy"
              variants={variants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.6, ease: "easeInOut" }}
              className="absolute h-full w-full"
            >
              <PrivacyPolicy onToggle={(v) => setView(v)} />
            </motion.div>
          )}
        </AnimatePresence>
      </Html>
    </>
  )
}
