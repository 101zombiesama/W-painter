import {
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  LineBasicMaterial,
  LineLoop,
  Quaternion,
  Vector3,
} from 'three'

const Z_AXIS = new Vector3(0, 0, 1)
const SEGMENTS = 96
const _quaternion = new Quaternion()

/**
 * A circle drawn on the model surface showing where and how big the brush is.
 * Drawn with lines so its stroke stays hairline-thin at any brush size.
 */
export class BrushCursor {
  readonly object = new Group()
  private readonly geometry: BufferGeometry
  private readonly materials: LineBasicMaterial[] = []

  constructor() {
    const points: number[] = []
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (i / SEGMENTS) * Math.PI * 2
      points.push(Math.cos(angle), Math.sin(angle), 0)
    }
    this.geometry = new BufferGeometry()
    this.geometry.setAttribute('position', new Float32BufferAttribute(points, 3))

    // A light circle hugged by dark ones stays visible on any surface color.
    this.addCircle(1.012, 0x000000, 0.55, 1)
    this.addCircle(0.988, 0x000000, 0.55, 1)
    this.addCircle(1, 0xffffff, 1, 2)
    this.addCircle(0.012, 0xffffff, 1, 2)
    this.object.visible = false
  }

  /** Shows the circle at a surface point, lying flat against `normal`. */
  update(point: Vector3, normal: Vector3, radius: number): void {
    this.object.visible = true
    this.object.position.copy(point).addScaledVector(normal, radius * 0.02)
    this.object.quaternion.copy(_quaternion.setFromUnitVectors(Z_AXIS, normal))
    this.object.scale.setScalar(radius)
  }

  /** Returns true if the cursor was visible (i.e. a redraw is needed). */
  hide(): boolean {
    const wasVisible = this.object.visible
    this.object.visible = false
    return wasVisible
  }

  dispose(): void {
    this.geometry.dispose()
    for (const material of this.materials) material.dispose()
  }

  private addCircle(scale: number, color: number, opacity: number, order: number): void {
    const material = new LineBasicMaterial({
      color,
      opacity,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
    })
    const circle = new LineLoop(this.geometry, material)
    circle.scale.setScalar(scale)
    circle.renderOrder = 1000 + order
    // The cursor must never intercept brush raycasts.
    circle.raycast = () => {}
    this.materials.push(material)
    this.object.add(circle)
  }
}
