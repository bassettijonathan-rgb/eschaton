import * as THREE from 'three';
import type { EndStatReport } from '../engine/endstat';
import { plumeOutline } from '../engine/effects';

/** Fallout plumes on the map: where each ground burst's dose passes 100 roentgens. */
export class PlumeLayer {
  readonly group = new THREE.Group();
  private drawn = 0;
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x8e44ad,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  constructor() {
    this.group.name = 'fallout-plumes';
  }

  update(report: EndStatReport): void {
    if (report.strikes.length < this.drawn) {
      this.group.clear();
      this.drawn = 0;
    }
    for (const s of report.strikes.slice(this.drawn)) {
      if (!s.plume) continue;
      const outline = plumeOutline(s.plume);
      if (outline.length < 3) continue;
      const shape = new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x, p.y)));
      const geometry = new THREE.ShapeGeometry(shape);
      geometry.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(geometry, this.material);
      mesh.position.y = 0.0025;
      mesh.renderOrder = 2;
      mesh.name = `plume-${String(s.order)}-${String(s.detonation.warhead)}`;
      this.group.add(mesh);
    }
    this.drawn = report.strikes.length;
  }
}
