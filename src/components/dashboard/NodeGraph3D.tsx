"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { demandHue, scoreHue, type DashJob, type Sel } from "@/lib/graph";

type Props = {
  skills: { key: string; name: string; demand: number }[];
  jobs: DashJob[];
  edges: [number, number][];
  selected: Sel;
  hoverJobId: string | null;
  onSelect: (s: Sel) => void;
  onFail?: () => void;
};

type GNode = {
  m: THREE.Mesh;
  halo: THREE.Sprite;
  el: HTMLDivElement;
  kind: "core" | "sk" | "jb";
  id: string;
  text: string;
  color: THREE.Color;
  s: number; // skala target
  cur: number; // skala saat ini (animasi muncul)
  on: boolean; // false = diredupkan oleh pilihan
  delay: number;
  pos: THREE.Vector3;
};

const hueColor = (h: number) => new THREE.Color().setHSL(h / 360, 0.9, 0.55);

// Tekstur cahaya lembut untuk efek "glow" di tiap node
function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  if (g) {
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,255,255,1)");
    grd.addColorStop(0.25, "rgba(255,255,255,0.55)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  return new THREE.CanvasTexture(c);
}

/**
 * Bola holografis ala JARVIS: "KAMU" di inti, skill CV di permukaan bola dalam, lowongan di bola luar.
 * Warna node: hijau = sangat cocok (dekat pusat), merah = kurang cocok (jauh).
 */
export default function NodeGraph3D({ skills, jobs, edges, selected, hoverJobId, onSelect, onFail }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lblRef = useRef<HTMLDivElement>(null);
  const selRef = useRef<Sel>(selected);
  const hoverRef = useRef<string | null>(hoverJobId);
  const applyRef = useRef<(() => void) | null>(null);
  const cbRef = useRef({ onSelect, onFail });

  useEffect(() => {
    cbRef.current = { onSelect, onFail };
  });
  useEffect(() => {
    selRef.current = selected;
    applyRef.current?.();
  }, [selected]);
  useEffect(() => {
    hoverRef.current = hoverJobId;
  }, [hoverJobId]);

  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    const lbl = lblRef.current;
    if (!host || !canvas || !lbl) return;
    const RM = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let R: THREE.WebGLRenderer;
    try {
      R = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      cbRef.current.onFail?.();
      return;
    }
    R.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
    const grp = new THREE.Group();
    scene.add(grp);
    grp.rotation.x = 0.35;

    const glow = glowTexture();
    const nodes: GNode[] = [];
    const sg = new THREE.SphereGeometry(1, 16, 12);
    const jg = new THREE.OctahedronGeometry(1);

    const mk = (geo: THREE.BufferGeometry, pos: THREE.Vector3, scale: number, text: string, kind: GNode["kind"], id: string, color: THREE.Color) => {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true }));
      m.position.copy(pos);
      m.scale.setScalar(0.0001);
      grp.add(m);
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: glow, color, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false })
      );
      halo.position.copy(pos);
      halo.scale.setScalar(0.0001);
      grp.add(halo);
      const el = document.createElement("div");
      el.className = "lbl " + kind;
      el.textContent = text;
      el.style.color = kind === "core" ? "#fafafa" : "#" + color.getHexString();
      lbl.appendChild(el);
      const n: GNode = { m, halo, el, kind, id, text, color, s: scale, cur: 0, on: true, delay: nodes.length * 0.06, pos: pos.clone() };
      m.userData.n = n;
      nodes.push(n);
      return n;
    };

    // --- kerangka bola holografis ---
    const wire = (geo: THREE.BufferGeometry, opacity: number) =>
      new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true, transparent: true, opacity }));
    const innerSphere = wire(new THREE.SphereGeometry(9, 24, 16), 0.1); // tempat skill
    const midSphere = wire(new THREE.SphereGeometry(15, 20, 14), 0.045);
    const outerSphere = wire(new THREE.SphereGeometry(22, 18, 12), 0.03);
    const coreCage = wire(new THREE.IcosahedronGeometry(2.6, 1), 0.28);
    grp.add(innerSphere, midSphere, outerSphere, coreCage);

    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3 });
    const rings = [
      { m: new THREE.Mesh(new THREE.TorusGeometry(12, 0.045, 6, 180), ringMat), ax: "z" as const, sp: 0.0035, tilt: [1.2, 0.2] },
      { m: new THREE.Mesh(new THREE.TorusGeometry(17, 0.04, 6, 200), ringMat), ax: "z" as const, sp: -0.0025, tilt: [0.5, 0.9] },
      { m: new THREE.Mesh(new THREE.TorusGeometry(23, 0.035, 6, 220), ringMat), ax: "z" as const, sp: 0.0018, tilt: [1.45, -0.5] },
    ];
    rings.forEach((r) => {
      r.m.rotation.x = r.tilt[0];
      r.m.rotation.y = r.tilt[1];
      grp.add(r.m);
    });

    // --- node ---
    const core = mk(sg, new THREE.Vector3(), 1.0, "KAMU", "core", "core", new THREE.Color(0xffffff));

    const maxDemand = Math.max(0, ...skills.map((s) => s.demand));
    const count = skills.length;
    const skillNodes = skills.map((s, i) => {
      const y = count > 1 ? 1 - (i / (count - 1)) * 2 : 0;
      const rad = Math.sqrt(1 - y * y);
      const th = i * 2.39996;
      const p = new THREE.Vector3(Math.cos(th) * rad, y, Math.sin(th) * rad).multiplyScalar(9);
      return mk(sg, p, 0.5, s.name, "sk", s.key, hueColor(demandHue(s.demand, maxDemand)));
    });

    const jobNodes = jobs.map((j, i) => {
      const d = new THREE.Vector3();
      edges.forEach(([a, b]) => {
        if (a === i) d.add(skillNodes[b].pos);
      });
      if (d.lengthSq() < 1e-6) d.set(Math.cos(i * 2.4), Math.sin(i * 1.7), Math.sin(i * 2.4));
      d.normalize();
      d.x += Math.sin(i * 2.1) * 0.25;
      d.y += Math.cos(i * 1.7) * 0.25;
      d.normalize().multiplyScalar(11 + (100 - j.score) * 0.25); // makin cocok, makin dekat
      return mk(jg, d, 0.5 + Math.max(0, j.score - 40) / 70, `${Math.round(j.score)}%`, "jb", j.id, hueColor(scoreHue(j.score)));
    });

    // --- garis (gradasi warna dari ujung ke ujung) ---
    const segs = (pairs: [GNode, GNode][]) => {
      const pos: number[] = [];
      const col: number[] = [];
      pairs.forEach(([a, b]) => {
        pos.push(a.pos.x, a.pos.y, a.pos.z, b.pos.x, b.pos.y, b.pos.z);
        col.push(a.color.r, a.color.g, a.color.b, b.color.r, b.color.g, b.color.b);
      });
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
      return g;
    };
    const lm = (o: number) =>
      new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    const all: [GNode, GNode][] = skillNodes.map((s) => [core, s]);
    edges.forEach(([a, b]) => all.push([jobNodes[a], skillNodes[b]]));
    const baseMat = lm(0.28);
    const hlMat = lm(1);
    const base = new THREE.LineSegments(segs(all), baseMat);
    const hl = new THREE.LineSegments(new THREE.BufferGeometry(), hlMat);
    grp.add(base, hl);

    // bintang latar
    const sp: number[] = [];
    for (let i = 0; i < 500; i++) {
      const a = Math.random() * 6.283;
      const b = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 80;
      sp.push(r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a));
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.6, transparent: true, opacity: 0.35 }));
    scene.add(stars);

    let hov: GNode | null = null;
    let dragging = false;
    let moved = 0;
    let lx = 0;
    let ly = 0;
    let t0: number | null = null;
    let raf = 0;

    const isSel = (n: GNode) => {
      const sel = selRef.current;
      return !!sel && ((sel.k === "job" && n.kind === "jb" && n.id === sel.id) || (sel.k === "skill" && n.kind === "sk" && n.id === sel.key));
    };

    const apply = () => {
      const sel = selRef.current;
      const hi = new Set<GNode>();
      const pairs: [GNode, GNode][] = [];
      if (sel?.k === "job") {
        const ji = jobs.findIndex((j) => j.id === sel.id);
        if (ji >= 0) {
          hi.add(jobNodes[ji]);
          edges.forEach(([a, b]) => {
            if (a === ji) {
              hi.add(skillNodes[b]);
              pairs.push([jobNodes[ji], skillNodes[b]]);
            }
          });
        }
      } else if (sel?.k === "skill") {
        const si = skills.findIndex((s) => s.key === sel.key);
        if (si >= 0) {
          hi.add(skillNodes[si]);
          edges.forEach(([a, b]) => {
            if (b === si) {
              hi.add(jobNodes[a]);
              pairs.push([jobNodes[a], skillNodes[si]]);
            }
          });
        }
      }
      nodes.forEach((n) => {
        n.on = !sel || hi.has(n) || n.kind === "core";
      });
      hl.geometry.dispose();
      hl.geometry = segs(pairs);
      baseMat.opacity = sel ? 0.07 : 0.28;
    };
    applyRef.current = apply;
    apply();

    const rc = new THREE.Raycaster();
    const nd = new THREE.Vector2();
    const pickables = nodes.filter((n) => n.kind !== "core").map((n) => n.m);
    const pick = (e: PointerEvent): GNode | null => {
      const b = canvas.getBoundingClientRect();
      nd.set(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1);
      rc.setFromCamera(nd, cam);
      const h = rc.intersectObjects(pickables, false)[0];
      return h ? (h.object.userData.n as GNode) : null;
    };

    const onDown = (e: PointerEvent) => {
      dragging = true;
      moved = 0;
      lx = e.clientX;
      ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const onMove = (e: PointerEvent) => {
      if (dragging) {
        const dx = e.clientX - lx;
        const dy = e.clientY - ly;
        moved += Math.abs(dx) + Math.abs(dy);
        grp.rotation.y += dx * 0.006;
        grp.rotation.x = Math.max(-1.1, Math.min(1.1, grp.rotation.x + dy * 0.006));
        lx = e.clientX;
        ly = e.clientY;
      } else {
        hov = pick(e);
        canvas.style.cursor = hov ? "pointer" : "grab";
      }
    };
    const onUp = (e: PointerEvent) => {
      dragging = false;
      canvas.style.cursor = "grab";
      if (moved < 6) {
        const n = pick(e);
        cbRef.current.onSelect(n ? (n.kind === "jb" ? { k: "job", id: n.id } : { k: "skill", key: n.id }) : null);
      }
    };
    const onCancel = () => {
      dragging = false;
    };
    const onLeave = () => {
      if (!dragging) hov = null;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onCancel);
    canvas.addEventListener("pointerleave", onLeave);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      R.setSize(w, h, false);
      cam.aspect = w / h;
      cam.position.z = w / h < 1.1 ? 70 : 56;
      cam.updateProjectionMatrix();
    });
    ro.observe(host);

    const v = new THREE.Vector3();
    const frame = (tms: number) => {
      raf = requestAnimationFrame(frame);
      if (document.hidden) return;
      const t = tms / 1000;
      t0 = t0 === null ? t : t0;
      if (!RM) {
        if (!dragging && !selRef.current) grp.rotation.y += 0.0022;
        coreCage.rotation.y += 0.006;
        coreCage.rotation.x += 0.003;
        innerSphere.rotation.y -= 0.0012;
        outerSphere.rotation.y += 0.0008;
        rings.forEach((r) => {
          r.m.rotation[r.ax] += r.sp;
        });
        stars.rotation.y += 0.0002;
      }
      const w = host.clientWidth;
      const h = host.clientHeight;
      for (const n of nodes) {
        const big = n === hov || isSel(n) || (n.kind === "jb" && n.id === hoverRef.current);
        const goal = (RM || t - t0 > n.delay ? 1 : 0) * n.s * (big ? 1.4 : 1);
        n.cur += (goal - n.cur) * (RM ? 1 : 0.12);
        n.m.scale.setScalar(Math.max(n.cur, 0.0001));
        n.halo.scale.setScalar(Math.max(n.cur * 4.4, 0.0001));
        const mm = n.m.material as THREE.MeshBasicMaterial;
        mm.opacity += ((n.on ? 1 : 0.15) - mm.opacity) * (RM ? 1 : 0.15);
        const hm = n.halo.material as THREE.SpriteMaterial;
        hm.opacity += ((n.on ? (big ? 0.95 : 0.6) : 0.05) - hm.opacity) * (RM ? 1 : 0.15);
        n.m.getWorldPosition(v);
        const depth = Math.min(1, Math.max(0, (v.z + 26) / 52));
        v.project(cam);
        n.el.style.transform = `translate(${(v.x * 0.5 + 0.5) * w}px,${(-v.y * 0.5 + 0.5) * h}px)`;
        n.el.style.opacity = String((0.3 + 0.7 * depth) * (n.on ? 1 : 0.15));
        if (n.kind === "jb") {
          const job = jobs.find((j) => j.id === n.id);
          const full = big && job ? `${n.text} · ${job.title}` : n.text;
          if (n.el.textContent !== full) n.el.textContent = full;
        }
      }
      R.render(scene, cam);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onCancel);
      canvas.removeEventListener("pointerleave", onLeave);
      applyRef.current = null;
      lbl.replaceChildren();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mt = m.material;
        if (Array.isArray(mt)) mt.forEach((x) => x.dispose());
        else mt?.dispose();
      });
      glow.dispose();
      R.dispose();
    };
  }, [skills, jobs, edges]);

  return (
    <div ref={hostRef} style={{ position: "absolute", inset: 0 }}>
      <canvas
        ref={canvasRef}
        className="g-canvas"
        role="img"
        aria-label="Grafik 3D node skill dan lowongan. Daftar lowongan di sebelah kanan berisi informasi yang sama."
      />
      <div ref={lblRef} className="g-lbls" aria-hidden="true" />
    </div>
  );
}
