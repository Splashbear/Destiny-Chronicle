import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DecryptingEngramComponent } from '../decrypting-engram/decrypting-engram.component';

type ThreeModule = typeof import('three');

/** Screen-space panel rect the facet dissolves into (CSS pixels). */
export interface EngramUnzipTarget {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Bronze sealed engram (ENGRAM_TRANSITION_3D_MOCKUP).
 * Progress lights seams / opens gaps; unzip flies facets into hard-light panel rects.
 * Falls back to 2D SVG under reduced motion or WebGL failure.
 */
@Component({
  selector: 'dc-engram-3d',
  standalone: true,
  imports: [CommonModule, DecryptingEngramComponent],
  template: `
    <div class="dc-engram-3d"
         [class.dc-engram-3d--sm]="size === 'sm'"
         [class.dc-engram-3d--md]="size === 'md'"
         [class.dc-engram-3d--lg]="size === 'lg'"
         [class.dc-engram-3d--hero]="size === 'hero'"
         [class.dc-engram-3d--held]="held || dragging"
         [class.dc-engram-3d--unzip]="unzipping"
         role="img"
         [attr.aria-label]="ariaLabel"
         (pointerdown)="onPointerDown($event)"
         (pointermove)="onPointerMove($event)"
         (pointerup)="onPointerUp($event)"
         (pointerleave)="onPointerUp($event)"
         (pointercancel)="onPointerUp($event)">
      <canvas #canvas
              class="dc-engram-3d__canvas"
              *ngIf="use3d"
              aria-hidden="true"></canvas>
      <app-decrypting-engram
        *ngIf="!use3d"
        [size]="size === 'hero' ? 'lg' : size"
        [progress]="fallbackProgress"
        [ariaLabel]="ariaLabel">
      </app-decrypting-engram>
    </div>
  `,
  styles: [`
    .dc-engram-3d {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      line-height: 0;
      touch-action: none;
      cursor: grab;
      user-select: none;
      filter: drop-shadow(0 0 24px rgba(176, 106, 52, 0.55))
              drop-shadow(0 0 48px rgba(255, 200, 144, 0.22));
    }
    .dc-engram-3d:active { cursor: grabbing; }
    .dc-engram-3d--held {
      filter: drop-shadow(0 0 32px rgba(255, 200, 144, 0.7))
              drop-shadow(0 0 64px rgba(176, 106, 52, 0.4));
    }
    .dc-engram-3d--unzip {
      cursor: default;
      filter: none;
    }
    .dc-engram-3d__canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .dc-engram-3d--sm { width: 3rem; height: 3rem; }
    .dc-engram-3d--md { width: 6.5rem; height: 6.5rem; }
    .dc-engram-3d--lg { width: 14rem; height: 14rem; }
    .dc-engram-3d--hero {
      width: min(72vw, 22rem);
      height: min(72vw, 22rem);
    }
    .dc-engram-3d--hero.dc-engram-3d--unzip {
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      z-index: 95;
      pointer-events: none;
    }
    @media (prefers-reduced-motion: reduce) {
      .dc-engram-3d { filter: drop-shadow(0 0 12px rgba(176, 106, 52, 0.35)); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Engram3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly Math = Math;
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  /** 0–100 overall (fallback when litAccounts not set). Idle sealed = 0. */
  @Input() progress = 0;
  /**
   * Accounts finished loading — lights that many facet groups on the engram.
   * Prefer this over raw progress so each profile visibly “unlocks” a panel.
   */
  @Input() litAccounts = 0;
  /** Total accounts in this decrypt (denominator for facet lighting). */
  @Input() totalAccounts = 0;
  @Input() size: 'sm' | 'md' | 'lg' | 'hero' = 'lg';
  @Input() held = false;
  @Input() ariaLabel = 'Sealed engram';
  @Input() autoSpin = true;
  /** When true, run facet fly-out toward unzipTargets (same instance — do not remount). */
  @Input() unzipping = false;
  @Input() unzipTargets: EngramUnzipTarget[] = [];

  @Output() unzipComplete = new EventEmitter<void>();
  @Output() engramActivate = new EventEmitter<void>();

  use3d = true;
  dragging = false;

  get fallbackProgress(): number {
    if (this.unzipping) return 100;
    if (this.totalAccounts > 0) {
      return Math.round(
        Math.max(0, Math.min(1, this.litAccounts / this.totalAccounts)) * 100
      );
    }
    return Math.max(this.progress, 20);
  }

  private three: ThreeModule | null = null;
  private renderer: import('three').WebGLRenderer | null = null;
  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private group: import('three').Group | null = null;
  private faces: import('three').Mesh[] = [];
  private edges: import('three').Line[] = [];
  private core: import('three').Mesh | null = null;
  private glow: import('three').Sprite | null = null;
  private glowMap: import('three').Texture | null = null;
  private planes: import('three').Mesh[] = [];
  private flares: import('three').Sprite[] = [];
  private particles: import('three').Points | null = null;
  private particlePos: Float32Array | null = null;
  private particleRand: Float32Array | null = null;
  private unzipT = -1;
  private unzipStarts: { p: import('three').Vector3; q: import('three').Quaternion }[] | null = null;
  private unzipEmitted = false;
  /** Smoothed 0–1 unlock amount (drives glow / spin). */
  private lit = 0;
  private targetLit = 0;
  /** Smoothed face count — rises gradually so facets ignite in a cascade. */
  private facesLitSmooth = 0;
  private targetFacesLit = 0;
  /** Integer ceiling of facesLitSmooth — how many faces emit any light. */
  private facesLitCount = 0;
  /**
   * Max visual ramp rate: 0→1 bloom takes ~10s (matches a typical Decrypt wait).
   * Targets can jump; the shell never catches up faster than this.
   */
  private readonly litRampPerSec = 0.1;
  private raf = 0;
  private destroyed = false;
  private rotY = 0.5;
  private rotX = 0.35;
  private targetRotY = 0.5;
  private targetRotX = 0.35;
  private dragLastX = 0;
  private dragLastY = 0;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private resizeObs: ResizeObserver | null = null;
  private tt = 0;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef,
    private readonly host: ElementRef<HTMLElement>
  ) {
    if (typeof window !== 'undefined' && window.matchMedia) {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        this.use3d = false;
      }
    }
  }

  ngAfterViewInit(): void {
    if (!this.use3d) return;
    void this.boot();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      (changes['progress'] || changes['litAccounts'] || changes['totalAccounts']) &&
      this.faces.length &&
      !this.unzipping
    ) {
      // Only update targets — the render loop eases illumination in.
      this.syncLitTargets();
    }
    if (changes['unzipping'] && this.unzipping && this.use3d) {
      // Let Angular apply unzipTargets + full-viewport class before measuring.
      requestAnimationFrame(() => {
        this.resize();
        this.beginUnzip();
      });
    }
    if (changes['unzipping'] && !this.unzipping) {
      this.unzipT = -1;
      this.unzipEmitted = false;
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.teardown();
  }

  onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0 || this.unzipping) return;
    this.dragging = true;
    this.dragLastX = ev.clientX;
    this.dragLastY = ev.clientY;
    this.pointerDownX = ev.clientX;
    this.pointerDownY = ev.clientY;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.dragging || this.unzipping) return;
    const dx = ev.clientX - this.dragLastX;
    const dy = ev.clientY - this.dragLastY;
    this.dragLastX = ev.clientX;
    this.dragLastY = ev.clientY;
    this.targetRotY += dx * 0.008;
    this.targetRotX += dy * 0.008;
    this.targetRotX = Math.max(-1.1, Math.min(1.1, this.targetRotX));
  }

  onPointerUp(ev: PointerEvent): void {
    if (!this.dragging) return;
    this.dragging = false;
    try {
      (ev.currentTarget as HTMLElement).releasePointerCapture?.(ev.pointerId);
    } catch {
      /* ignore */
    }
    const dx = ev.clientX - this.pointerDownX;
    const dy = ev.clientY - this.pointerDownY;
    if (Math.hypot(dx, dy) < 8) {
      this.engramActivate.emit();
    }
  }

  @HostListener('wheel', ['$event'])
  onWheel(ev: WheelEvent): void {
    if (!this.group || this.unzipping) return;
    ev.preventDefault();
    this.targetRotY += ev.deltaY * 0.0015;
  }

  private get clamped(): number {
    const n = Number(this.progress);
    if (!Number.isFinite(n)) return 0;
    return Math.max(0, Math.min(100, n));
  }

  private fallback2d(): void {
    this.teardown();
    this.use3d = false;
    this.cdr.markForCheck();
    if (this.unzipping && !this.unzipEmitted) {
      this.unzipEmitted = true;
      setTimeout(() => this.unzipComplete.emit(), 280);
    }
  }

  private async boot(): Promise<void> {
    try {
      this.three = await import('three');
    } catch {
      this.fallback2d();
      return;
    }
    if (this.destroyed || !this.three) return;
    await Promise.resolve();
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas || this.destroyed) {
      this.fallback2d();
      return;
    }
    try {
      this.initScene(canvas, this.three);
    } catch {
      this.fallback2d();
      return;
    }
    if (this.unzipping) this.beginUnzip();
    this.zone.runOutsideAngular(() => this.loop());
  }

  private initScene(canvas: HTMLCanvasElement, THREE: ThreeModule): void {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 320);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 320);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.z = 8;
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const key = new THREE.PointLight(0xfff0c0, 2.2);
    key.position.set(3, 3, 5);
    scene.add(key);

    const group = new THREE.Group();
    group.position.x = -0.4;
    this.group = group;
    scene.add(group);

    const sealed = new THREE.DodecahedronGeometry(1.5, 0);
    const base = sealed.index ? sealed.toNonIndexed() : sealed;
    const P = base.attributes['position'];
    const faces: import('three').Mesh[] = [];
    const edges: import('three').Line[] = [];

    for (let i = 0; i < P.count; i += 9) {
      const a: number[] = [];
      for (let k = 0; k < 9; k++) {
        a.push(P.getX(i + k), P.getY(i + k), P.getZ(i + k));
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
      geo.computeVertexNormals();
      const mat = new THREE.MeshStandardMaterial({
        color: 0x6a3a1c,
        metalness: 0.85,
        roughness: 0.42,
        emissive: 0x000000,
        emissiveIntensity: 0,
        flatShading: true,
        side: THREE.DoubleSide,
        transparent: true,
      });
      const m = new THREE.Mesh(geo, mat);
      const n = new THREE.Vector3(
        a[0] + a[3] + a[6],
        a[1] + a[4] + a[7],
        a[2] + a[5] + a[8]
      ).normalize();
      m.userData['n'] = n;
      m.userData['c'] = new THREE.Vector3(
        (a[0] + a[3] + a[6]) / 3,
        (a[1] + a[4] + a[7]) / 3,
        (a[2] + a[5] + a[8]) / 3
      );
      // Seam midpoints — nanobot dust births in the gaps as facets separate.
      m.userData['seams'] = [
        new THREE.Vector3((a[0] + a[3]) / 2, (a[1] + a[4]) / 2, (a[2] + a[5]) / 2),
        new THREE.Vector3((a[3] + a[6]) / 2, (a[4] + a[7]) / 2, (a[5] + a[8]) / 2),
        new THREE.Vector3((a[6] + a[0]) / 2, (a[7] + a[1]) / 2, (a[8] + a[2]) / 2),
      ];
      group.add(m);
      faces.push(m);

      const eg = new THREE.EdgesGeometry(geo);
      const ep = eg.attributes['position'];
      for (let j = 0; j < ep.count; j += 2) {
        const lg = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(ep.getX(j), ep.getY(j), ep.getZ(j)),
          new THREE.Vector3(ep.getX(j + 1), ep.getY(j + 1), ep.getZ(j + 1)),
        ]);
        const l = new THREE.Line(
          lg,
          new THREE.LineBasicMaterial({ color: 0x4a2a14, transparent: true })
        );
        m.add(l);
        edges.push(l);
      }
    }
    edges.sort(() => Math.random() - 0.5);
    this.faces = faces;
    this.edges = edges;

    const core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.85, 1),
      new THREE.MeshBasicMaterial({ color: 0xffd8b0, transparent: true, opacity: 0 })
    );
    this.core = core;
    group.add(core);

    const glowMap = this.makeGlowTexture(THREE);
    this.glowMap = glowMap;
    const glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowMap,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
        color: 0xffc090,
      })
    );
    glow.scale.set(6, 6, 1);
    glow.material.opacity = 0.1;
    this.glow = glow;
    group.add(glow);

    // Soft flare sprite per facet — opacity ramps when that account panel lights.
    this.flares = faces.map((face, i) => {
      const n = face.userData['n'] as import('three').Vector3;
      const spr = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowMap,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          transparent: true,
          color: 0xffe0b0,
          opacity: 0,
        })
      );
      spr.position.copy(n).multiplyScalar(1.65);
      spr.scale.set(0.01, 0.01, 1);
      spr.userData['faceIndex'] = i;
      group.add(spr);
      return spr;
    });

    // Smoke motes from seams until dissolve; reused for unzip.
    // Rand layout per mote: phase, tanA, tanB, swirlSpeed, swirlPhase, buoyancy
    const NP = 2000;
    const pg = new THREE.BufferGeometry();
    const pp = new Float32Array(NP * 3);
    const pr = new Float32Array(NP * 6);
    for (let i = 0; i < NP; i++) {
      pr[i * 6] = Math.random();
      pr[i * 6 + 1] = Math.random() - 0.5;
      pr[i * 6 + 2] = Math.random() - 0.5;
      pr[i * 6 + 3] = 0.6 + Math.random() * 1.4;
      pr[i * 6 + 4] = Math.random() * Math.PI * 2;
      pr[i * 6 + 5] = 0.3 + Math.random() * 0.9;
    }
    pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const pts = new THREE.Points(
      pg,
      new THREE.PointsMaterial({
        color: 0xffd4a0,
        size: 0.055,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      })
    );
    this.particles = pts;
    this.particlePos = pp;
    this.particleRand = pr;
    group.add(pts);

    this.syncLitTargets();
    this.applyLitVisuals(true);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement || canvas);
  }

  private makeGlowTexture(THREE: ThreeModule): import('three').CanvasTexture {
    const c2 = document.createElement('canvas');
    c2.width = c2.height = 256;
    const ctx = c2.getContext('2d')!;
    const gr = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    gr.addColorStop(0, 'rgba(255,240,210,1)');
    gr.addColorStop(0.18, 'rgba(255,190,110,0.85)');
    gr.addColorStop(0.45, 'rgba(220,110,40,0.35)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c2);
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Bloom target for the wait: finding accounts only opens part of the shell;
   * day/activity progress finishes it. Prevents 1/1 “found” from instantly
   * becoming a full explosion while the day is still loading.
   */
  private litFraction(): number {
    const day = this.clamped / 100;
    if (this.totalAccounts > 0) {
      const acct = Math.max(0, Math.min(1, this.litAccounts / this.totalAccounts));
      return Math.max(0, Math.min(1, acct * 0.4 + day * 0.6));
    }
    return day;
  }

  private computeFacesLit(): number {
    const n = this.faces.length;
    if (!n) return 0;
    return Math.round(this.litFraction() * n);
  }

  /** Refresh animation targets from inputs (visuals ramp in the loop). */
  private syncLitTargets(): void {
    this.targetLit = this.litFraction();
    this.targetFacesLit = this.computeFacesLit();
  }

  /**
   * Linear-capped chase: full bloom takes ~10s even if the target jumps to 1.
   * Facets cascade as facesLitSmooth rises through face indices.
   */
  private stepLitEase(): void {
    if (!this.faces.length || this.unzipT >= 0) return;
    const dt = 0.016;
    const maxLitStep = this.litRampPerSec * dt;
    const dLit = this.targetLit - this.lit;
    if (dLit > 0) this.lit += Math.min(dLit, maxLitStep);
    else if (dLit < 0) this.lit += Math.max(dLit, -maxLitStep);

    const faceRate = Math.max(1, this.faces.length) * this.litRampPerSec; // faces / sec at full target
    const maxFaceStep = faceRate * dt;
    const dFaces = this.targetFacesLit - this.facesLitSmooth;
    if (dFaces > 0) this.facesLitSmooth += Math.min(dFaces, maxFaceStep);
    else if (dFaces < 0) this.facesLitSmooth += Math.max(dFaces, -maxFaceStep);

    this.applyLitVisuals(false);
  }

  /**
   * Paint emissive / flares from smoothed progress. Kept bronze-warm — never
   * blow out to a white “frozen explosion.”
   */
  private applyLitVisuals(immediate: boolean): void {
    if (!this.faces.length || this.unzipT >= 0) return;
    if (immediate) {
      this.lit = this.targetLit;
      this.facesLitSmooth = this.targetFacesLit;
    }
    const f = this.lit;
    const smooth = this.facesLitSmooth;
    this.facesLitCount = Math.ceil(smooth);

    this.faces.forEach((m, i) => {
      const amount = Math.max(0, Math.min(1, smooth - i));
      const n = m.userData['n'] as import('three').Vector3;
      // Pull plates apart so seams open — dust streams from those gaps.
      m.position.copy(n).multiplyScalar(0.12 * amount);
      const mat = m.material as import('three').MeshStandardMaterial;
      // Sealed bronze → warm lit amber (not cream-white).
      mat.color.setRGB(
        0x6a / 255 + amount * ((0xe8 - 0x6a) / 255),
        0x3a / 255 + amount * ((0x8a - 0x3a) / 255),
        0x1c / 255 + amount * ((0x3a - 0x1c) / 255)
      );
      mat.emissive.setRGB(
        amount * (0xe0 / 255),
        amount * (0x78 / 255),
        amount * (0x28 / 255)
      );
      mat.emissiveIntensity = amount * 0.95;
      mat.metalness = 0.85 - amount * 0.35;
      mat.roughness = 0.42 - amount * 0.12;
      mat.opacity = 1;
      m.children.forEach(ch => {
        const lm = (ch as import('three').Line).material as import('three').LineBasicMaterial;
        if (!lm) return;
        lm.color.setRGB(
          0x3a / 255 + amount * ((0xf0 - 0x3a) / 255),
          0x1e / 255 + amount * ((0xb0 - 0x1e) / 255),
          0x0c / 255 + amount * ((0x60 - 0x0c) / 255)
        );
        lm.opacity = 0.5 + amount * 0.45;
      });
    });

    this.flares.forEach((spr, i) => {
      const amount = Math.max(0, Math.min(1, smooth - i));
      const mat = spr.material as import('three').SpriteMaterial;
      const pulse =
        amount > 0.02
          ? 0.7 + amount * 0.9 + Math.sin(this.tt * 2.2 + i) * 0.12 * amount
          : 0.01;
      mat.opacity = amount * 0.38;
      spr.scale.set(pulse, pulse, 1);
      spr.visible = amount > 0.01;
    });

    if (this.core) {
      (this.core.material as import('three').MeshBasicMaterial).opacity = 0.05 + f * 0.45;
    }
    if (this.glow) {
      this.glow.material.opacity = 0.06 + f * 0.55;
      this.glow.scale.setScalar(4 + f * 3.5);
    }
    if (this.particles) {
      (this.particles.material as import('three').PointsMaterial).opacity =
        smooth > 0.02 ? 0.35 + f * 0.45 : 0;
    }
  }

  /**
   * Smoke from open seams: each lit face billows along its own outward normal
   * with slow turbulent curl — a haze around a stationary engram, not a streak.
   */
  private stepIdleDust(): void {
    if (!this.particlePos || !this.particleRand || !this.particles) return;
    if (this.unzipT >= 0) return;

    const mat = this.particles.material as import('three').PointsMaterial;
    if (this.facesLitSmooth < 0.02 && this.lit < 0.02) {
      mat.opacity = 0;
      return;
    }

    const f = Math.max(this.lit, 0.12);
    const activeFaces = Math.max(1, this.facesLitCount);
    const totalMotes = Math.floor(this.particlePos.length / 3);
    const motesPer = Math.max(20, Math.floor(totalMotes / activeFaces));
    // Soft radial bloom; no shared camera bias (that read as a comet).
    const outReach = 0.55 + f * 0.85;
    const swirlAmp = 0.35 + f * 0.45;
    const smokeSpeed = 0.11;

    for (let fi = 0; fi < activeFaces; fi++) {
      const face = this.faces[fi];
      if (!face) continue;
      const amount = Math.max(0.2, Math.min(1, this.facesLitSmooth - fi + 0.3));
      const n = face.userData['n'] as import('three').Vector3;
      const seams = face.userData['seams'] as import('three').Vector3[] | undefined;
      const c = face.userData['c'] as import('three').Vector3;
      const px = face.position.x;
      const py = face.position.y;
      const pz = face.position.z;

      // Tangent frame for curling smoke in the seam plane.
      const ux = Math.abs(n.y) < 0.85 ? 0 : 1;
      const uy = Math.abs(n.y) < 0.85 ? 1 : 0;
      let tx = n.y * 0 - n.z * uy;
      let ty = n.z * ux - n.x * 0;
      let tz = n.x * uy - n.y * ux;
      let tLen = Math.hypot(tx, ty, tz) || 1;
      tx /= tLen;
      ty /= tLen;
      tz /= tLen;
      let bx = n.y * tz - n.z * ty;
      let by = n.z * tx - n.x * tz;
      let bz = n.x * ty - n.y * tx;
      const bLen = Math.hypot(bx, by, bz) || 1;
      bx /= bLen;
      by /= bLen;
      bz /= bLen;

      for (let m = 0; m < motesPer; m++) {
        const j = fi * motesPer + m;
        if (j >= totalMotes) break;
        const phase = this.particleRand[j * 6];
        const tanA = this.particleRand[j * 6 + 1];
        const tanB = this.particleRand[j * 6 + 2];
        const swirlSp = this.particleRand[j * 6 + 3];
        const swirlPh = this.particleRand[j * 6 + 4];
        const buoy = this.particleRand[j * 6 + 5];

        // Slow life cycle — smoke hangs and dissipates rather than rocketing out.
        const life = (this.tt * smokeSpeed * swirlSp + phase) % 1;
        const puff = Math.sqrt(life); // quick leave seam, then drift
        const thin = 1 - life * life; // thin out at the end of the puff

        const seamIdx =
          seams && seams.length
            ? Math.abs(Math.floor(phase * seams.length + fi)) % seams.length
            : 0;
        const seam = seams && seams.length ? seams[seamIdx] : c;
        const sx = seam.x + px;
        const sy = seam.y + py;
        const sz = seam.z + pz;

        const out = puff * outReach * amount;
        const ang = this.tt * 0.55 * swirlSp + swirlPh + life * 4;
        const curlT = Math.sin(ang) * swirlAmp * puff * thin;
        const curlB = Math.cos(ang * 1.37 + tanA) * swirlAmp * puff * thin;
        const wanderT = tanA * (0.15 + puff * 0.55) * amount;
        const wanderB = tanB * (0.15 + puff * 0.55) * amount;
        // Gentle buoyancy so plumes loft differently per mote — still multi-axis.
        const loft = puff * buoy * 0.35 * amount * thin;

        this.particlePos[j * 3] =
          sx + n.x * out + tx * (wanderT + curlT) + bx * (wanderB + curlB);
        this.particlePos[j * 3 + 1] =
          sy + n.y * out + ty * (wanderT + curlT) + by * (wanderB + curlB) + loft;
        this.particlePos[j * 3 + 2] =
          sz + n.z * out + tz * (wanderT + curlT) + bz * (wanderB + curlB);
      }
    }

    for (let j = activeFaces * motesPer; j < totalMotes; j++) {
      this.particlePos[j * 3] = 0;
      this.particlePos[j * 3 + 1] = -40;
      this.particlePos[j * 3 + 2] = 0;
    }

    this.particles.geometry.attributes['position'].needsUpdate = true;
    // Softer haze — reads as smoke, not hard streaks.
    mat.opacity = 0.28 + f * 0.35;
    mat.size = 0.05 + f * 0.04;
    this.particles.visible = true;
  }

  private defaultTargets(): EngramUnzipTarget[] {
    const W = window.innerWidth;
    const H = window.innerHeight;
    return [
      { x: W * 0.04, y: H * 0.04, w: W * 0.92, h: H * 0.08 },
      { x: W * 0.04, y: H * 0.16, w: W * 0.58, h: H * 0.28 },
      { x: W * 0.66, y: H * 0.16, w: W * 0.3, h: H * 0.28 },
      { x: W * 0.04, y: H * 0.48, w: W * 0.3, h: H * 0.4 },
      { x: W * 0.36, y: H * 0.48, w: W * 0.3, h: H * 0.4 },
      { x: W * 0.68, y: H * 0.48, w: W * 0.28, h: H * 0.4 },
    ];
  }

  private beginUnzip(): void {
    if (!this.three || !this.scene || !this.camera || !this.group || !this.faces.length) {
      if (!this.unzipEmitted) {
        this.unzipEmitted = true;
        this.zone.run(() => this.unzipComplete.emit());
      }
      return;
    }
    const THREE = this.three;
    const targets = this.unzipTargets.length >= 1 ? this.unzipTargets : this.defaultTargets();
    this.planes.forEach(p => {
      this.scene?.remove(p);
      p.geometry.dispose();
      (p.material as import('three').Material).dispose();
    });
    this.planes = [];

    const W = window.innerWidth;
    const H = window.innerHeight;
    const toWorld = (px: number, py: number) => {
      const v = new THREE.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(this.camera!);
      const d = v.sub(this.camera!.position).normalize();
      return this.camera!.position.clone().add(d.multiplyScalar(-this.camera!.position.z / d.z));
    };

    this.faces.forEach((_m, i) => {
      const t = targets[i % targets.length];
      const half = t.w / 2;
      const x0 = t.x + (i >= targets.length ? half : 0);
      const a = toWorld(x0, t.y);
      const b = toWorld(x0 + Math.max(half, t.w * 0.5), t.y + t.h);
      const pw = Math.abs(b.x - a.x);
      const ph = Math.abs(b.y - a.y);
      const pl = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshBasicMaterial({
          color: 0xff9a5a,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      pl.userData['c'] = new THREE.Vector3((a.x + b.x) / 2, (a.y + b.y) / 2, 0);
      pl.userData['w'] = pw;
      pl.userData['h'] = ph;
      this.scene!.add(pl);
      this.planes.push(pl);
    });

    this.flares.forEach(spr => {
      spr.visible = false;
      (spr.material as import('three').SpriteMaterial).opacity = 0;
    });
    this.group.updateMatrixWorld(true);
    this.unzipStarts = this.faces.map(m => {
      const p = new THREE.Vector3();
      m.getWorldPosition(p);
      const q = new THREE.Quaternion();
      m.getWorldQuaternion(q);
      return { p, q };
    });
    this.faces.forEach(m => this.scene!.attach(m));
    if (this.particles) this.scene!.attach(this.particles);
    this.unzipT = 0;
    this.unzipEmitted = false;
    this.cdr.markForCheck();
  }

  private stepUnzip(u: number): void {
    if (!this.three || !this.unzipStarts || !this.particlePos || !this.particleRand) return;
    const THREE = this.three;
    u = Math.min(1, u);
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    const targets = this.unzipTargets.length >= 1 ? this.unzipTargets : this.defaultTargets();
    const W = window.innerWidth;
    const H = window.innerHeight;
    const toWorld = (px: number, py: number) => {
      const v = new THREE.Vector3((px / W) * 2 - 1, -(py / H) * 2 + 1, 0.5).unproject(this.camera!);
      const d = v.sub(this.camera!.position).normalize();
      return this.camera!.position.clone().add(d.multiplyScalar(-this.camera!.position.z / d.z));
    };

    this.faces.forEach((m, i) => {
      const t = targets[i % targets.length];
      const pl = this.planes[i];
      if (!pl) return;
      const d = pl.userData as { c: import('three').Vector3; w: number; h: number };
      const k = Math.min(1, u / 0.6);
      const ek = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      m.position.lerpVectors(this.unzipStarts![i].p, d.c, ek);
      m.quaternion.copy(this.unzipStarts![i].q);
      m.rotateOnAxis(m.userData['n'] as import('three').Vector3, ek * Math.PI * 3);
      m.scale.setScalar(1 + ek * 0.6);
      const mo = Math.max(0, Math.min(1, (u - 0.45) / 0.25));
      const mat = m.material as import('three').MeshStandardMaterial;
      mat.transparent = true;
      mat.opacity = 1 - mo;
      m.visible = mo < 0.99;
      m.children.forEach(ch => {
        const lm = (ch as import('three').Line).material as import('three').LineBasicMaterial;
        if (lm) lm.opacity = 1 - mo;
      });
      pl.position.copy(m.position);
      pl.scale.set(0.8 + (d.w - 0.8) * mo, 0.8 + (d.h - 0.8) * mo, 1);
      (pl.material as import('three').MeshBasicMaterial).opacity =
        mo * (1 - Math.max(0, (u - 0.8) / 0.2)) * 0.55;
      for (let j = i * 75; j < i * 75 + 75; j++) {
        const sp = (1 - mo * 0.5) * 1.2;
        this.particlePos![j * 3] = m.position.x + this.particleRand![j * 6 + 1] * (mo ? d.w : sp);
        this.particlePos![j * 3 + 1] = m.position.y + this.particleRand![j * 6 + 2] * (mo ? d.h : sp);
        this.particlePos![j * 3 + 2] = m.position.z + this.particleRand![j * 6 + 1] * 0.4;
      }
      void toWorld;
      void t;
    });
    if (this.particles) {
      this.particles.geometry.attributes['position'].needsUpdate = true;
      (this.particles.material as import('three').PointsMaterial).opacity =
        Math.sin(Math.PI * Math.min(1, u)) * 0.9;
    }
    if (this.core && this.glow) {
      (this.core.material as import('three').MeshBasicMaterial).opacity = Math.max(0, 1 - e * 1.5);
      this.glow.material.opacity = Math.max(0, 1 - e * 1.5);
      this.core.scale.setScalar(1 + e * 2);
      this.core.visible = this.glow.visible = e < 0.6;
    }
  }

  private resize(): void {
    const canvas = this.canvasRef?.nativeElement;
    const renderer = this.renderer;
    const camera = this.camera;
    if (!canvas || !renderer || !camera) return;
    const host = this.host.nativeElement;
    const w = Math.max(1, this.unzipping ? window.innerWidth : canvas.clientWidth || host.clientWidth || 1);
    const h = Math.max(1, this.unzipping ? window.innerHeight : canvas.clientHeight || host.clientHeight || 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.tt += 0.016;

    if (this.unzipT >= 0) {
      if (this.unzipT < 1.05) {
        this.unzipT += 0.008;
        this.stepUnzip(this.unzipT);
      } else if (!this.unzipEmitted) {
        this.unzipEmitted = true;
        this.zone.run(() => this.unzipComplete.emit());
      }
    } else if (this.group) {
      this.stepLitEase();
      // Keep spin calm — bloom is the motion, not a rapid whirl.
      const spin = 0.002 + this.lit * 0.01;
      if (this.autoSpin && !this.dragging) {
        this.targetRotY += spin;
      }
      this.rotY += (this.targetRotY - this.rotY) * 0.08;
      this.rotX += (this.targetRotX - this.rotX) * 0.08;
      this.group.rotation.set(
        this.rotX + Math.sin(this.tt * 0.7) * 0.04 * Math.max(0.15, this.lit),
        this.rotY,
        this.lit * 0.08
      );
      this.group.position.y = Math.sin(this.tt * 1.2) * 0.03;
      if (this.glow) {
        this.glow.scale.setScalar(4 + this.lit * 3.5 + Math.sin(this.tt * 1.6) * 0.2);
      }
      this.stepIdleDust();
    }

    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  };

  private teardown(): void {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    this.resizeObs?.disconnect();
    this.resizeObs = null;
    this.faces.forEach(m => {
      m.geometry.dispose();
      (m.material as import('three').Material).dispose();
    });
    this.faces = [];
    this.edges = [];
    this.flares.forEach(spr => {
      (spr.material as import('three').Material).dispose();
    });
    this.flares = [];
    this.planes.forEach(p => {
      p.geometry.dispose();
      (p.material as import('three').Material).dispose();
    });
    this.planes = [];
    this.core = null;
    this.glow = null;
    this.glowMap?.dispose();
    this.glowMap = null;
    this.particles = null;
    this.group = null;
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.three = null;
  }
}
