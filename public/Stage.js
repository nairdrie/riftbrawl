export class Stage {
    constructor(x, y, z) {
        const groundGeometry = new THREE.BoxGeometry(15, 1, 3);
        const groundMaterial = new THREE.MeshStandardMaterial({
            color: 0xffffff
        });
        this.mesh = new THREE.Mesh(groundGeometry, groundMaterial);
        this.mesh.receiveShadow = true;
        this.setPosition(x, y, z);

    }

    setPosition(x, y, z) {
        this.mesh.position.set(x, y, z);
    }

    getPosition() {
        return this.mesh.position;
    }
}