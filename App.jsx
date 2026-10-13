import React from 'react'
import ShaderGradientBackground from './ShaderGradientBackground'
import './App.css'

export default function App() {
  return (
    <div className="app-container">
      {/* 3D Animated Shader Gradient */}
      <ShaderGradientBackground />

      {/* Hero Overlay Content */}
      <main className="content">
        <span className="badge">WebGL Shader Experience</span>
        <h1 className="title">Liquid Flame Shader</h1>
        <p className="subtitle">
          Dynamic 3D gradient rendered with custom lighting, noise distortion, and real-time grain.
        </p>
        <div className="button-group">
          <button className="btn primary">Explore Parameters</button>
          <button className="btn secondary">Copy Config</button>
        </div>
      </main>
    </div>
  )
}
