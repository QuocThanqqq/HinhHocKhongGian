import * as THREE from "three";

function rect(width, height, color) {
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ color })
  );
}

export class CatController {
  constructor() {
    this.group = new THREE.Group();
    this.neckPivot = new THREE.Group();
    this.headVelocity = 0;
    this.headOffset = 0;
    this.comboPulse = 0;

    const body = rect(18, 12, 0x282522);
    body.position.set(-30, -18, 6);

    const belly = rect(9, 6, 0xf2d4b8);
    belly.position.set(-30, -18.5, 7);

    const tail = rect(11, 2.2, 0x282522);
    tail.position.set(-39, -15, 5);
    tail.rotation.z = -0.5;

    const head = rect(11, 10, 0x282522);
    const earLeft = rect(3.2, 3.2, 0x282522);
    const earRight = rect(3.2, 3.2, 0x282522);
    const muzzle = rect(4.8, 3.4, 0xf2d4b8);
    const eyeLeft = rect(1, 1.8, 0xf6e16f);
    const eyeRight = rect(1, 1.8, 0xf6e16f);

    earLeft.position.set(-2.7, 4.2, 0);
    earLeft.rotation.z = 0.35;
    earRight.position.set(2.7, 4.2, 0);
    earRight.rotation.z = -0.35;
    muzzle.position.set(0, -1.8, 1);
    eyeLeft.position.set(-2.2, 1.4, 1);
    eyeRight.position.set(2.2, 1.4, 1);

    this.neckPivot.position.set(-30, -11, 7);
    this.neckPivot.add(head, earLeft, earRight, muzzle, eyeLeft, eyeRight);
    this.group.add(body, belly, tail, this.neckPivot);
  }

  onHit(grade) {
    this.headVelocity = grade === "Perfect" ? 0.22 : 0.16;
  }

  onComboReady() {
    this.comboPulse = 0.9;
  }

  update(deltaSeconds) {
    this.headOffset += this.headVelocity;
    this.headVelocity *= 0.78;
    this.comboPulse = Math.max(0, this.comboPulse - deltaSeconds * 1.6);

    const bounce = Math.sin(this.headOffset * 10) * this.headVelocity * 1.8;
    this.neckPivot.rotation.z = bounce + Math.sin(performance.now() * 0.004) * 0.03;
    this.neckPivot.position.y = -11 + this.comboPulse * 0.7;
    this.group.position.y = Math.sin(performance.now() * 0.003) * 0.6;
  }
}
