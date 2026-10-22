import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { DecryptingEngramComponent } from '../decrypting-engram/decrypting-engram.component';

type ThreeModule = typeof import('three');

/**
 * 3D decrypting engram (ENGRAM_THEME_SPEC — three.js trial).
 * Progress drives glow / crack emissive from the real load.
 * Falls back to the 2D SVG when WebGL is unavailable or reduced-motion is on.
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
         [class.dc-engram-3d--held]="held"
         role="img"
         [attr.aria-label]="ariaLabel">
      <canvas #canvas
              class="dc-engram-3d__canvas"
              *ngIf="use3d"
              aria-hidden="true"></canvas>
      <app-decrypting-engram
        *ngIf="!use3d"
        [size]="size"
        [progress]="progress"
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
      transition: transform 0.12s ease;
    }
    .dc-engram-3d--held {
      transform: scale(1.05);
    }
    .dc-engram-3d__canvas {
      display: block;
      width: 100%;
      height: 100%;
    }
    .dc-engram-3d--sm { width: 2.75rem; height: 3.25rem; }
    .dc-engram-3d--md { width: 5.5rem; height: 6.5rem; }
    .dc-engram-3d--lg { width: 13.75rem; height: 15.5rem; }
    @media (prefers-reduced-motion: reduce) {
      .dc-engram-3d--held { transform: none; }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Engram3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  /** 0–100 from real load. */
  @Input() progress = 0;
  @Input() size: 'sm' | 'md' | 'lg' = 'lg';
  @Input() held = false;
  @Input() ariaLabel = 'Decrypting engram';

  use3d = true;

  private three: ThreeModule | null = null;
  private renderer: import('three').WebGLRenderer | null = null;
  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private crystal: import('three').Object3D | null = null;
  private coreMat: import('three').MeshStandardMaterial | null = null;
  private shellMat: import('three').MeshStandardMaterial | null = null;
  private crackMat: import('three').LineBasicMaterial | null = null;
  private raf = 0;
  private destroyed = false;
  private spin = 0;
  private resizeObs: ResizeObserver | null = null;

  constructor(
    private readonly zone: NgZone,
    private readonly cdr: ChangeDetectorRef
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
    if (changes['progress'] && this.coreMat) {
      this.applyProgress(this.clamped);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.teardown();
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

    this.zone.runOutsideAngular(() => this.loop());
  }

  private initScene(canvas: HTMLCanvasElement, THREE: ThreeModule): void {
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 220);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 250);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'low-power',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 40);
    camera.position.set(0, 0.15, 5.2);
    this.camera = camera;

    const key = new THREE.DirectionalLight(0xffe9a8, 1.35);
    key.position.set(2.2, 3.2, 2.8);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x9fe3ff, 0.35);
    fill.position.set(-2.5, -1, 1.5);
    scene.add(fill);
    scene.add(new THREE.AmbientLight(0x6a6048, 0.45));

    const geo = this.buildCrystalGeometry(THREE);

    const shellMat = new THREE.MeshStandardMaterial({
      color: 0x1a1d22,
      metalness: 0.55,
      roughness: 0.35,
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
    });
    const coreMat = new THREE.MeshStandardMaterial({
      color: 0xc9a227,
      emissive: 0x5a4a1c,
      emissiveIntensity: 0.25,
      metalness: 0.4,
      roughness: 0.28,
      transparent: true,
      opacity: 0.88,
    });
    this.shellMat = shellMat;
    this.coreMat = coreMat;

    const shell = new THREE.Mesh(geo, shellMat);
    shell.scale.setScalar(1.06);
    const core = new THREE.Mesh(geo.clone(), coreMat);
    core.scale.setScalar(0.92);

    const group = new THREE.Group();
    group.add(shell);
    group.add(core);

    const crackGeo = new THREE.BufferGeometry();
    const crackPts = new Float32Array([
      0, 1.15, 0, -0.12, 0.15, 0.08,
      -0.12, 0.15, 0.08, 0.18, -0.05, -0.05,
      0.18, -0.05, -0.05, -0.08, -1.05, 0.05,
      0.75, 0.35, 0.2, 0.2, -0.05, -0.02,
      -0.7, 0.4, -0.15, -0.05, 0.1, 0.05,
    ]);
    crackGeo.setAttribute('position', new THREE.BufferAttribute(crackPts, 3));
    const crackMat = new THREE.LineBasicMaterial({
      color: 0x0c0e10,
      transparent: true,
      opacity: 0.2,
    });
    this.crackMat = crackMat;
    group.add(new THREE.LineSegments(crackGeo, crackMat));

    this.crystal = group;
    scene.add(group);

    this.applyProgress(this.clamped);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement || canvas);
  }

  /** Hexagonal bipyramid — Destiny-ish engram silhouette. */
  private buildCrystalGeometry(THREE: ThreeModule): import('three').BufferGeometry {
    const radius = 1.05;
    const tip = 1.35;
    const mid = 0.35;
    const positions: number[] = [];
    const indices: number[] = [];

    const ring = (y: number, r: number, startIdx: number): number => {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
        positions.push(Math.cos(a) * r, y, Math.sin(a) * r);
      }
      return startIdx + 6;
    };

    const top = 0;
    positions.push(0, tip, 0); // 0
    let next = 1;
    const upperStart = next;
    next = ring(mid, radius, next); // 1..6
    const lowerStart = next;
    next = ring(-mid, radius * 0.98, next); // 7..12
    const bottom = next;
    positions.push(0, -tip, 0); // 13

    const pushTri = (a: number, b: number, c: number) => {
      indices.push(a, b, c);
    };

    for (let i = 0; i < 6; i++) {
      const u0 = upperStart + i;
      const u1 = upperStart + ((i + 1) % 6);
      const l0 = lowerStart + i;
      const l1 = lowerStart + ((i + 1) % 6);
      pushTri(top, u1, u0);
      pushTri(u0, u1, l1);
      pushTri(u0, l1, l0);
      pushTri(bottom, l0, l1);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setIndex(indices);
    geo.computeVertexNormals();
    return geo;
  }

  private applyProgress(p: number): void {
    const t = p / 100;
    if (this.coreMat) {
      this.coreMat.emissiveIntensity = 0.2 + t * 1.55;
      this.coreMat.color.setRGB(
        0.78 + t * 0.2,
        0.58 + t * 0.25,
        0.12 + t * 0.15
      );
      this.coreMat.opacity = 0.55 + t * 0.4;
    }
    if (this.shellMat) {
      this.shellMat.opacity = 0.95 - t * 0.25;
      const gold = 0.55 + t * 0.45;
      this.shellMat.color.setRGB(0.12 + gold * 0.15, 0.12 + gold * 0.12, 0.14);
    }
    if (this.crackMat) {
      this.crackMat.opacity = 0.15 + t * 0.75;
    }
  }

  private resize(): void {
    const canvas = this.canvasRef?.nativeElement;
    const renderer = this.renderer;
    const camera = this.camera;
    if (!canvas || !renderer || !camera) return;
    const w = Math.max(1, canvas.clientWidth || 1);
    const h = Math.max(1, canvas.clientHeight || 1);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  }

  private loop = (): void => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const group = this.crystal;
    if (group) {
      const speed = this.held ? 0.028 : 0.01;
      this.spin += speed;
      group.rotation.y = this.spin;
      group.rotation.x = Math.sin(this.spin * 0.65) * 0.12;
      const breathe = 1 + Math.sin(this.spin * 1.4) * 0.015 * (0.4 + this.clamped / 100);
      group.scale.setScalar(breathe);
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
    this.crystal = null;
    this.coreMat?.dispose();
    this.shellMat?.dispose();
    this.crackMat?.dispose();
    this.coreMat = null;
    this.shellMat = null;
    this.crackMat = null;
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.three = null;
  }
}
