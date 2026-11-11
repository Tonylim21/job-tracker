"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

const PVS = `attribute float aSize;attribute float aPhase;attribute float aOrd;uniform float uTime,uPx,uReveal;varying float vA;void main(){vec4 mv=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*mv;float tw=.65+.35*sin(uTime*1.4+aPhase*6.2832);float on=step(0.,aOrd);float boost=on*(1.-smoothstep(uReveal-.12,uReveal,aOrd));gl_PointSize=aSize*uPx*(1.+boost*.9)*(34./-mv.z);vA=tw*(.55+boost*.9)*(1.+on*.3);}`;
const PFS = `varying float vA;void main(){float d=length(gl_PointCoord-.5);float a=smoothstep(.5,0.,d);gl_FragColor=vec4(vec3(1.),min(a*vA,1.));}`;
const LVS = `attribute float aOrd;uniform float uReveal;varying float vA;void main(){vA=.10+.6*(1.-smoothstep(uReveal-.12,uReveal,aOrd));gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const LFS = `varying float vA;void main(){gl_FragColor=vec4(vec3(1.),vA);}`;
const MVS = `varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`;
const MFS = `varying vec2 vUv;uniform float uTime,uAlpha,uSeed,uHatch;float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}void main(){vec2 p=vUv-.5;float r=length(p);vec2 d=normalize(p+1e-5);float edge=.42+.04*n(d*2.+uSeed)+.012*n(d*9.+uSeed*3.);float inside=smoothstep(edge,edge-.006,r);float hatch=step(.55,fract((vUv.x*.8+vUv.y)*uHatch+uTime*.01));float rim=smoothstep(edge-.03,edge-.006,r)*inside;gl_FragColor=vec4(vec3(1.),(inside*(.04+.11*hatch)+rim*.3)*uAlpha);}`;

/**
 * Scene 3D "night sky + ink moon". Dikendalikan lewat CustomEvent di window:
 *  - cn:reveal (detail: 0..1)  -> berapa banyak rasi menyala (progres isi form)
 *  - cn:turn   (detail: "login" | "register") -> memutar dunia seperti membalik bab
 *  - cn:warp                    -> efek zoom saat submit berhasil
 */
export default function AuthScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let r: THREE.WebGLRenderer;
    try {
      r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true, powerPreference: "low-power" });
    } catch {
      document.body.classList.add("nogl");
      return;
    }

    const small = window.innerWidth < 820;
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.5 : 2));
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
    const world = new THREE.Group();
    scene.add(world);
    const U = {
      uTime: { value: 0 },
      uReveal: { value: 0.15 },
      uPx: { value: r.getPixelRatio() },
    };
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);

    const makePoints = (pos: Float32Array, sz: [number, number], ord: Float32Array) => {
      const n = pos.length / 3;
      const g = new THREE.BufferGeometry();
      const s = new Float32Array(n);
      const p = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        s[i] = rnd(sz[0], sz[1]);
        p[i] = Math.random();
      }
      g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
      g.setAttribute("aSize", new THREE.BufferAttribute(s, 1));
      g.setAttribute("aPhase", new THREE.BufferAttribute(p, 1));
      g.setAttribute("aOrd", new THREE.BufferAttribute(ord, 1));
      return new THREE.Points(
        g,
        new THREE.ShaderMaterial({
          uniforms: U,
          vertexShader: PVS,
          fragmentShader: PFS,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        })
      );
    };

    // bintang latar
    const N = small ? 900 : 2200;
    const sp = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      sp[i * 3] = rnd(-65, 65);
      sp[i * 3 + 1] = rnd(-38, 38);
      sp[i * 3 + 2] = rnd(-62, 8);
    }
    world.add(makePoints(sp, [0.6, 1.6], new Float32Array(N).fill(-1)));

    // node (skill) + garis rasi
    const M = 64;
    const np = new Float32Array(M * 3);
    const no = new Float32Array(M);
    const nodes: number[][] = [];
    for (let i = 0; i < M; i++) {
      const x = rnd(-29, 29), y = rnd(-16, 16), z = rnd(-18, -2);
      np.set([x, y, z], i * 3);
      no[i] = Math.random();
      nodes.push([x, y, z]);
    }
    world.add(makePoints(np, [2.6, 4.2], no));

    const seen = new Set<string>();
    const lp: number[] = [];
    const lo: number[] = [];
    for (let i = 0; i < M; i++) {
      const near = nodes
        .map((p, j) => [j, j === i ? 1e9 : Math.hypot(p[0] - nodes[i][0], p[1] - nodes[i][1], (p[2] - nodes[i][2]) * 0.5)])
        .sort((a, b) => a[1] - b[1])
        .slice(0, 2);
      for (const [j] of near) {
        const k = Math.min(i, j) + "-" + Math.max(i, j);
        if (seen.has(k)) continue;
        seen.add(k);
        const a = nodes[i], b = nodes[j], o = Math.random();
        const pts: number[][] = [a];
        for (const t of [0.33, 0.66]) {
          pts.push([
            a[0] + (b[0] - a[0]) * t + rnd(-0.5, 0.5),
            a[1] + (b[1] - a[1]) * t + rnd(-0.5, 0.5),
            a[2] + (b[2] - a[2]) * t + rnd(-0.5, 0.5),
          ]);
        }
        pts.push(b);
        for (let s = 0; s < 3; s++) {
          lp.push(...pts[s], ...pts[s + 1]);
          lo.push(o, o);
        }
      }
    }
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(lp), 3));
    lg.setAttribute("aOrd", new THREE.BufferAttribute(new Float32Array(lo), 1));
    world.add(
      new THREE.LineSegments(
        lg,
        new THREE.ShaderMaterial({
          uniforms: U,
          vertexShader: LVS,
          fragmentShader: LFS,
          transparent: true,
          depthWrite: false,
        })
      )
    );

    // "ink moon": bulan arsir dengan tepi sobekan kertas
    const addMoon = (x: number, y: number, z: number, s: number, seed: number, hatch: number, alpha: number) => {
      const m = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          uniforms: { uTime: U.uTime, uAlpha: { value: alpha }, uSeed: { value: seed }, uHatch: { value: hatch } },
          vertexShader: MVS,
          fragmentShader: MFS,
        })
      );
      m.position.set(x, y, z);
      m.scale.set(s, s, 1);
      m.renderOrder = -1;
      world.add(m);
    };
    addMoon(-17, 7, -20, 30, 3.1, 70, 1);
    addMoon(24, -9, -34, 22, 8.4, 110, 0.8);

    // state
    let target = 0.15, turnY = 0, baseZ = 22, zT = 22, px = 0, py = 0, mx = 0, my = 0;
    let need = true, raf = 0, warpTimer: ReturnType<typeof setTimeout> | undefined;

    const resize = () => {
      r.setSize(window.innerWidth, window.innerHeight, false);
      cam.aspect = window.innerWidth / window.innerHeight;
      baseZ = cam.aspect < 1 ? 32 : 22;
      zT = baseZ;
      cam.updateProjectionMatrix();
      need = true;
    };
    const onPointer = (e: PointerEvent) => {
      mx = (e.clientX / window.innerWidth) * 2 - 1;
      my = (e.clientY / window.innerHeight) * 2 - 1;
    };
    const onReveal = (e: Event) => {
      target = 0.15 + 0.85 * (e as CustomEvent<number>).detail;
      need = true;
    };
    const onTurn = (e: Event) => {
      turnY = (e as CustomEvent<string>).detail === "register" ? 0.55 : 0;
      need = true;
    };
    const onWarp = () => {
      zT = baseZ - 11;
      need = true;
      warpTimer = setTimeout(() => {
        zT = baseZ;
        need = true;
      }, 1200);
    };

    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointer);
    window.addEventListener("cn:reveal", onReveal);
    window.addEventListener("cn:turn", onTurn);
    window.addEventListener("cn:warp", onWarp);
    resize();
    cam.position.z = baseZ;

    const frame = (tms: number) => {
      raf = requestAnimationFrame(frame);
      const t = tms / 1000;
      if (document.hidden) return;
      if (RM && !need && Math.abs(U.uReveal.value - target) < 0.002) return;
      U.uTime.value = RM ? 0 : t;
      U.uReveal.value += (target - U.uReveal.value) * 0.06;
      if (!RM) {
        px += (mx - px) * 0.05;
        py += (my - py) * 0.05;
        world.position.x = Math.sin(t * 0.05) * 1.5;
      }
      world.rotation.y += (turnY - world.rotation.y) * 0.05;
      cam.position.x = px * 3;
      cam.position.y = -py * 2;
      cam.position.z += (zT - cam.position.z) * 0.06;
      cam.lookAt(0, 0, 0);
      r.render(scene, cam);
      need = false;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      if (warpTimer) clearTimeout(warpTimer);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("cn:reveal", onReveal);
      window.removeEventListener("cn:turn", onTurn);
      window.removeEventListener("cn:warp", onWarp);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mat = m.material;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      r.dispose();
    };
  }, []);

  return <canvas id="gl" ref={ref} aria-hidden="true" />;
}
