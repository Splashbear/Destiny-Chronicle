import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
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
 * Destiny-style exotic engram: gold dodecahedron with light seams.
 * Drag to rotate. Progress brightens the core. Falls back to 2D SVG.
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
        [progress]="Math.max(progress, 35)"
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
      filter: drop-shadow(0 0 28px rgba(228, 192, 74, 0.55))
              drop-shadow(0 0 60px rgba(255, 230, 150, 0.25));
    }
    .dc-engram-3d:active { cursor: grabbing; }
    .dc-engram-3d--held {
      filter: drop-shadow(0 0 36px rgba(255, 236, 170, 0.75))
              drop-shadow(0 0 80px rgba(228, 192, 74, 0.4));
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
    @media (prefers-reduced-motion: reduce) {
      .dc-engram-3d { filter: drop-shadow(0 0 12px rgba(228, 192, 74, 0.35)); }
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Engram3dComponent implements AfterViewInit, OnChanges, OnDestroy {
  readonly Math = Math;
  @ViewChild('canvas') canvasRef?: ElementRef<HTMLCanvasElement>;

  /** 0–100 from real load (idle gate can pass 0 — still looks gold). */
  @Input() progress = 0;
  @Input() size: 'sm' | 'md' | 'lg' | 'hero' = 'lg';
  @Input() held = false;
  @Input() ariaLabel = 'Exotic engram';
  /** Slow auto-spin when not dragging (landing page). */
  @Input() autoSpin = true;

  use3d = true;
  dragging = false;

  private three: ThreeModule | null = null;
  private renderer: import('three').WebGLRenderer | null = null;
  private scene: import('three').Scene | null = null;
  private camera: import('three').PerspectiveCamera | null = null;
  private crystal: import('three').Object3D | null = null;
  private plateMat: import('three').MeshStandardMaterial | null = null;
  private glowMat: import('three').MeshBasicMaterial | null = null;
  private edgeMat: import('three').LineBasicMaterial | null = null;
  private pointLight: import('three').PointLight | null = null;
  private raf = 0;
  private destroyed = false;
  private rotY = 0.35;
  private rotX = 0.2;
  private targetRotY = 0.35;
  private targetRotX = 0.2;
  private dragLastX = 0;
  private dragLastY = 0;
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
    if ((changes['progress'] || changes['held']) && this.plateMat) {
      this.applyProgress(this.clamped);
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.resizeObs?.disconnect();
    this.teardown();
  }

  onPointerDown(ev: PointerEvent): void {
    if (ev.button !== 0) return;
    this.dragging = true;
    this.dragLastX = ev.clientX;
    this.dragLastY = ev.clientY;
    (ev.currentTarget as HTMLElement).setPointerCapture?.(ev.pointerId);
  }

  onPointerMove(ev: PointerEvent): void {
    if (!this.dragging) return;
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
  }

  @HostListener('wheel', ['$event'])
  onWheel(ev: WheelEvent): void {
    if (!this.crystal) return;
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
    const w = Math.max(1, canvas.clientWidth || canvas.parentElement?.clientWidth || 320);
    const h = Math.max(1, canvas.clientHeight || canvas.parentElement?.clientHeight || 320);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;

    const camera = new THREE.PerspectiveCamera(28, w / h, 0.1, 40);
    camera.position.set(0, 0, 4.6);
    this.camera = camera;

    scene.add(new THREE.AmbientLight(0xfff0c8, 0.55));
    const key = new THREE.DirectionalLight(0xfff6d0, 1.6);
    key.position.set(2.4, 3.5, 3.2);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffe08a, 0.85);
    rim.position.set(-2.8, -1.2, 2);
    scene.add(rim);

    const point = new THREE.PointLight(0xffe9a8, 1.4, 12, 2);
    point.position.set(0, 0, 0);
    this.pointLight = point;
    scene.add(point);

    // Solid gold plates (slightly shrunk so seams read)
    const plateGeo = new THREE.DodecahedronGeometry(1.05, 0);
    const plateMat = new THREE.MeshStandardMaterial({
      color: 0xd4a84b,
      metalness: 0.82,
      roughness: 0.28,
      emissive: 0x8a6a20,
      emissiveIntensity: 0.35,
    });
    this.plateMat = plateMat;
    const plates = new THREE.Mesh(plateGeo, plateMat);
    plates.scale.setScalar(0.965);

    // Inner glow core (light leaking through seams)
    const glowGeo = new THREE.DodecahedronGeometry(1.02, 0);
    const glowMat = new THREE.MeshBasicMaterial({
      color: 0xfff4c2,
      transparent: true,
      opacity: 0.92,
    });
    this.glowMat = glowMat;
    const glow = new THREE.Mesh(glowGeo, glowMat);

    // Bright seam lines
    const edges = new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(1.05, 0), 15);
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0xfff8e0,
      transparent: true,
      opacity: 0.95,
    });
    this.edgeMat = edgeMat;
    const seams = new THREE.LineSegments(edges, edgeMat);

    const group = new THREE.Group();
    group.add(glow);
    group.add(plates);
    group.add(seams);
    this.crystal = group;
    scene.add(group);

    this.applyProgress(this.clamped);

    this.resizeObs = new ResizeObserver(() => this.resize());
    this.resizeObs.observe(canvas.parentElement || canvas);
  }

  private applyProgress(p: number): void {
    // Idle gate at 0 should still look like a lit exotic engram
    const t = Math.max(0.35, p / 100);
    if (this.plateMat) {
      this.plateMat.emissiveIntensity = 0.25 + t * 0.7;
      this.plateMat.color.setHex(p >= 90 ? 0xe8c56a : 0xd4a84b);
    }
    if (this.glowMat) {
      this.glowMat.opacity = 0.75 + t * 0.2;
    }
    if (this.edgeMat) {
      this.edgeMat.opacity = 0.7 + t * 0.3;
    }
    if (this.pointLight) {
      this.pointLight.intensity = 1.1 + t * 1.4;
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
    if (this.autoSpin && !this.dragging) {
      this.targetRotY += 0.004;
    }
    this.rotY += (this.targetRotY - this.rotY) * 0.12;
    this.rotX += (this.targetRotX - this.rotX) * 0.12;
    if (this.crystal) {
      this.crystal.rotation.y = this.rotY;
      this.crystal.rotation.x = this.rotX;
      const pulse = 1 + Math.sin(performance.now() * 0.0016) * 0.012;
      this.crystal.scale.setScalar(this.held || this.dragging ? pulse * 1.03 : pulse);
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
    this.plateMat?.dispose();
    this.glowMat?.dispose();
    this.edgeMat?.dispose();
    this.plateMat = null;
    this.glowMat = null;
    this.edgeMat = null;
    this.pointLight = null;
    this.scene?.clear();
    this.scene = null;
    this.camera = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.three = null;
  }
}
