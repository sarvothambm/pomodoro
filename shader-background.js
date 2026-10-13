// WebGL Mesmerizing Shader Gradient Engine
// Elegant dark ambiance with high contrast for text and controls
(function () {
  'use strict';

  class ShaderGradientRenderer {
    constructor(canvasId) {
      this.canvas = document.getElementById(canvasId);
      if (!this.canvas) return;

      this.gl = this.canvas.getContext('webgl', { antialias: true, alpha: false }) || 
                this.canvas.getContext('experimental-webgl', { antialias: true, alpha: false });
      if (!this.gl) {
        console.warn('WebGL not supported, falling back to CSS gradient');
        return;
      }

      this.program = null;
      this.attribs = {};
      this.uniforms = {};
      this.startTime = performance.now();
      this.speed = 0.18; // smooth hypnotic flow

      this.initShaders();
      this.initBuffers();
      this.resize();

      window.addEventListener('resize', () => this.resize(), { passive: true });
      this.render = this.render.bind(this);
      requestAnimationFrame(this.render);
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = window.innerWidth;
      const height = window.innerHeight;

      if (this.canvas.width !== Math.floor(width * dpr) || this.canvas.height !== Math.floor(height * dpr)) {
        this.canvas.width = Math.floor(width * dpr);
        this.canvas.height = Math.floor(height * dpr);
      }

      if (this.gl) {
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
      }
    }

    initShaders() {
      const gl = this.gl;

      const vsSource = `
        attribute vec2 a_position;
        varying vec2 v_uv;
        void main() {
          v_uv = (a_position + 1.0) * 0.5;
          gl_Position = vec4(a_position, 0.0, 1.0);
        }
      `;

      // GLSL Fragment Shader:
      // Uses the user's color palette (#ff5430, #dbba10, #d0bce1) balanced with deep obsidian shadow
      // so all white fonts, dials, and glass cards pop with pristine legibility!
      const fsSource = `
        precision highp float;
        varying vec2 v_uv;

        uniform vec2 u_resolution;
        uniform float u_time;
        uniform vec3 u_color1;
        uniform vec3 u_color2;
        uniform vec3 u_color3;
        uniform float u_brightness;
        uniform float u_density;
        uniform float u_frequency;
        uniform float u_strength;
        uniform float u_speed;

        vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
        vec3 permute(vec3 x) { return mod289(((x * 34.0) + 1.0) * x); }

        float snoise(vec2 v) {
          const vec4 C = vec4(0.211324865405187,
                              0.366025403784439,
                             -0.577350269189626,
                              0.024390243902439);
          vec2 i  = floor(v + dot(v, C.yy));
          vec2 x0 = v - i + dot(i, C.xx);
          vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
          vec4 x12 = x0.xyxy + C.xxzz;
          x12.xy -= i1;
          i = mod289(i);
          vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
          vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
          m = m * m;
          m = m * m;
          vec3 x = 2.0 * fract(p * C.www) - 1.0;
          vec3 h = abs(x) - 0.5;
          vec3 ox = floor(x + 0.5);
          vec3 a0 = x - ox;
          m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
          vec3 g;
          g.x  = a0.x  * x0.x  + h.x  * x0.y;
          g.yz = a0.yz * x12.xz + h.yz * x12.yw;
          return 130.0 * dot(m, g);
        }

        float random(vec2 p) {
          return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
        }

        void main() {
          vec2 uv = gl_FragCoord.xy / u_resolution.xy;
          float aspect = u_resolution.x / u_resolution.y;
          vec2 p = uv;
          p.x *= aspect;

          // Rotation angle
          float angle = 0.872;
          mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
          p = rot * (p - vec2(0.5 * aspect, 0.5)) + vec2(0.5 * aspect, 0.5);

          float t = u_time * u_speed;

          // Smooth liquid waves
          vec2 q = vec2(0.0);
          q.x = snoise(p * (u_frequency * 0.3) + vec2(t * 0.5, t * 0.25));
          q.y = snoise(p * (u_frequency * 0.3) + vec2(t * 0.2, t * 0.6));

          vec2 r = vec2(0.0);
          r.x = snoise(p * (u_frequency * 0.5) + u_strength * 0.25 * q + vec2(t * 0.3, t * 0.4));
          r.y = snoise(p * (u_frequency * 0.5) + u_strength * 0.25 * q + vec2(t * 0.4, t * 0.2));

          float f = snoise(p * (u_density * 0.6) + u_strength * 0.35 * r + vec2(t * 0.2, t * 0.15));
          f = (f + 1.0) * 0.5;

          // Smooth transitions between the 3 colors
          float mix1 = smoothstep(0.1, 0.65, f + q.x * 0.25);
          float mix2 = smoothstep(0.45, 0.95, f + r.y * 0.25);

          vec3 col = mix(u_color1, u_color2, mix1);
          col = mix(col, u_color3, mix2);

          // Vivid, clear and radiant color reproduction (no artificial darkening)
          col *= u_brightness;

          // Subtle organic grain for rich tactile liquid texture
          float grain = (random(uv * (u_time + 1.0)) - 0.5) * 0.015;
          col += grain;

          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }
      `;

      const createShader = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          console.error(gl.getShaderInfoLog(shader));
          gl.deleteShader(shader);
          return null;
        }
        return shader;
      };

      const vs = createShader(gl.VERTEX_SHADER, vsSource);
      const fs = createShader(gl.FRAGMENT_SHADER, fsSource);

      this.program = gl.createProgram();
      gl.attachShader(this.program, vs);
      gl.attachShader(this.program, fs);
      gl.linkProgram(this.program);

      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(this.program));
        return;
      }

      gl.useProgram(this.program);

      // Cache locations
      this.attribs.position = gl.getAttribLocation(this.program, 'a_position');
      this.uniforms.resolution = gl.getUniformLocation(this.program, 'u_resolution');
      this.uniforms.time = gl.getUniformLocation(this.program, 'u_time');
      this.uniforms.color1 = gl.getUniformLocation(this.program, 'u_color1');
      this.uniforms.color2 = gl.getUniformLocation(this.program, 'u_color2');
      this.uniforms.color3 = gl.getUniformLocation(this.program, 'u_color3');
      this.uniforms.brightness = gl.getUniformLocation(this.program, 'u_brightness');
      this.uniforms.density = gl.getUniformLocation(this.program, 'u_density');
      this.uniforms.frequency = gl.getUniformLocation(this.program, 'u_frequency');
      this.uniforms.strength = gl.getUniformLocation(this.program, 'u_strength');
      this.uniforms.speed = gl.getUniformLocation(this.program, 'u_speed');

      // Colors from user prompt:
      // color1="#ff543" -> #ff5430
      // color2="#dbba10"
      // color3="#d0bce" -> #d0bce1
      gl.uniform3f(this.uniforms.color1, 1.0, 0.329, 0.188);
      gl.uniform3f(this.uniforms.color2, 0.859, 0.729, 0.063);
      gl.uniform3f(this.uniforms.color3, 0.816, 0.737, 0.882);

      gl.uniform1f(this.uniforms.brightness, 1.0);
      gl.uniform1f(this.uniforms.density, 5.0);
      gl.uniform1f(this.uniforms.frequency, 5.5);
      gl.uniform1f(this.uniforms.strength, 4.8);
      gl.uniform1f(this.uniforms.speed, 0.18);
    }

    initBuffers() {
      const gl = this.gl;
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      const vertices = new Float32Array([
        -1.0, -1.0,
         1.0, -1.0,
        -1.0,  1.0,
        -1.0,  1.0,
         1.0, -1.0,
         1.0,  1.0,
      ]);
      gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

      gl.enableVertexAttribArray(this.attribs.position);
      gl.vertexAttribPointer(this.attribs.position, 2, gl.FLOAT, false, 0, 0);
    }

    render() {
      if (!this.gl || !this.program) return;

      const gl = this.gl;
      gl.useProgram(this.program);

      const elapsed = (performance.now() - this.startTime) * 0.001;

      gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
      gl.uniform1f(this.uniforms.time, elapsed);

      gl.drawArrays(gl.TRIANGLES, 0, 6);

      requestAnimationFrame(this.render);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    window.shaderBackground = new ShaderGradientRenderer('shader-canvas');
  });
})();
