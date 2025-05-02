import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020); // Morado oscuro para el cielo al caer la noche
scene.fog = new THREE.Fog(0x202020, 0, 100); // Similar para la niebla

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0xffffff, 2.5);
directionalLight.position.set(25, 25, 25);
directionalLight.castShadow = true;
directionalLight.shadow.camera.near = 0.01;
directionalLight.shadow.camera.far = 500;
directionalLight.shadow.camera.right = 30;
directionalLight.shadow.camera.left = - 30;
directionalLight.shadow.camera.top = 30;
directionalLight.shadow.camera.bottom = - 30;
directionalLight.shadow.mapSize.width = 1024;
directionalLight.shadow.mapSize.height = 1024;
directionalLight.shadow.radius = 4;
directionalLight.shadow.bias = - 0.00006;
scene.add(directionalLight);

const container = document.getElementById('three-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setAnimationLoop(animate);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const GRAVITY = 30;

const NUM_SPHERES = 10;
const SPHERE_RADIUS = 0.1;

const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
const enemigos = [];
const mixers = [];
let sphereIdx = 0;

for (let i = 0; i < NUM_SPHERES; i++) {

    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.castShadow = true;
    sphere.receiveShadow = true;

    scene.add(sphere);

    spheres.push({
        mesh: sphere,
        collider: new THREE.Sphere(new THREE.Vector3(0, - 100, 0), SPHERE_RADIUS),
        velocity: new THREE.Vector3(),
        isOnGround: false // Atributo para saber si está en el suelo
    });

}

const worldOctree = new Octree();

const playerCollider = new Capsule(new THREE.Vector3(0, 0.35, 0), new THREE.Vector3(0, 1, 0), 0.35);

const playerVelocity = new THREE.Vector3();
const playerDirection = new THREE.Vector3();

let playerOnFloor = false;
let mouseTime = 0;

const keyStates = {};

const vector1 = new THREE.Vector3();
const vector2 = new THREE.Vector3();
const vector3 = new THREE.Vector3();

let minMap, sizeMap;

document.addEventListener('keydown', (event) => {

    keyStates[event.code] = true;

});

document.addEventListener('keyup', (event) => {

    keyStates[event.code] = false;

});

container.addEventListener('mousedown', () => {

    document.body.requestPointerLock();

    mouseTime = performance.now();

});

document.addEventListener('mouseup', () => {

    if (document.pointerLockElement !== null) throwBall();

});

document.body.addEventListener('mousemove', (event) => {

    if (document.pointerLockElement === document.body) {

        camera.rotation.y -= event.movementX / 500;
        camera.rotation.x -= event.movementY / 500;

    }

});

window.addEventListener('resize', onWindowResize);

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize(window.innerWidth, window.innerHeight);

}

function throwBall() {

    const sphere = spheres[sphereIdx];

    camera.getWorldDirection(playerDirection);

    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);
    sphere.isOnGround = false;

    if (!scene.children.includes(sphere.mesh)) {
        scene.add(sphere.mesh)
    }

    // throw the ball with more force if we hold the button longer, and if we move forward

    const impulse = 25 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    sphereIdx = (sphereIdx + 1) % spheres.length;

}

function playerCollisions() {

    const result = worldOctree.capsuleIntersect(playerCollider);

    playerOnFloor = false;

    if (result) {

        playerOnFloor = result.normal.y > 0;

        if (!playerOnFloor) {

            playerVelocity.addScaledVector(result.normal, - result.normal.dot(playerVelocity));

        }

        if (result.depth >= 1e-10) {

            playerCollider.translate(result.normal.multiplyScalar(result.depth));

        }

    }

}

function updatePlayer(deltaTime) {

    let damping = Math.exp(- 4 * deltaTime) - 1;

    if (!playerOnFloor) {

        playerVelocity.y -= GRAVITY * deltaTime;

        // small air resistance
        damping *= 0.1;

    }

    playerVelocity.addScaledVector(playerVelocity, damping);

    const deltaPosition = playerVelocity.clone().multiplyScalar(deltaTime);
    playerCollider.translate(deltaPosition);

    playerCollisions();

    camera.position.copy(playerCollider.end);

    directionalLight.position.copy(playerCollider.end).add(new THREE.Vector3(25, 100, 25));
    directionalLight.target.position.copy(playerCollider.end);
    directionalLight.target.updateMatrixWorld();
}

function playerSphereCollision(sphere) {

    const center = vector1.addVectors(playerCollider.start, playerCollider.end).multiplyScalar(0.5);

    const sphere_center = sphere.collider.center;

    const r = playerCollider.radius + sphere.collider.radius;
    const r2 = r * r;

    // approximation: player = 3 spheres

    for (const point of [playerCollider.start, playerCollider.end, center]) {

        const d2 = point.distanceToSquared(sphere_center);

        if (d2 < r2) {

            const normal = vector1.subVectors(point, sphere_center).normalize();
            const v1 = vector2.copy(normal).multiplyScalar(normal.dot(playerVelocity));
            const v2 = vector3.copy(normal).multiplyScalar(normal.dot(sphere.velocity));

            playerVelocity.add(v2).sub(v1);
            sphere.velocity.add(v1).sub(v2);

            const d = (r - Math.sqrt(d2)) / 2;
            sphere_center.addScaledVector(normal, - d);

        }

    }

}

function spheresCollisions() {

    for (let i = 0, length = spheres.length; i < length; i++) {

        const s1 = spheres[i];

        for (let j = i + 1; j < length; j++) {

            const s2 = spheres[j];

            const d2 = s1.collider.center.distanceToSquared(s2.collider.center);
            const r = s1.collider.radius + s2.collider.radius;
            const r2 = r * r;

            if (d2 < r2) {

                const normal = vector1.subVectors(s1.collider.center, s2.collider.center).normalize();
                const v1 = vector2.copy(normal).multiplyScalar(normal.dot(s1.velocity));
                const v2 = vector3.copy(normal).multiplyScalar(normal.dot(s2.velocity));

                s1.velocity.add(v2).sub(v1);
                s2.velocity.add(v1).sub(v2);

                const d = (r - Math.sqrt(d2)) / 2;

                s1.collider.center.addScaledVector(normal, d);
                s2.collider.center.addScaledVector(normal, - d);

            }

        }

    }

}

// Verifica si alguna esfera golpea a algún enemigo
function enemyCoalition() {
    for (let i = spheres.length - 1; i >= 0; i--) {
        const esfera = spheres[i];
        if (esfera.isOnGround) continue;

        for (let j = 0; j < enemigos.length; j++) {
            const enemigo = enemigos[j];

            const dx = esfera.collider.center.x - enemigo.collider.center.x;
            const dy = esfera.collider.center.y - enemigo.collider.center.y;
            const dz = esfera.collider.center.z - enemigo.collider.center.z;

            const rx = 0.5;  // ancho (X)
            const ry = 1.9;  // alto (Y), ajustable según tamaño del enemigo
            const rz = 0.5; // largo (Z)

            const elipsoide = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) + (dz * dz) / (rz * rz);

            if (elipsoide < 1) {
                enemigo.dead = true;
                scene.remove(esfera.mesh);
                break;
            }
        }
    }
}

function updateSpheres(deltaTime) {

    spheres.forEach(sphere => {

        sphere.collider.center.addScaledVector(sphere.velocity, deltaTime);

        const result = worldOctree.sphereIntersect(sphere.collider);

        if (result) {

            // Detenemos la velocidad completamente en las direcciones x y z
            sphere.velocity.x = 0;
            sphere.velocity.z = 0;

            // Solo mantenemos la componente y de la velocidad para que pueda caer hacia el suelo
            // Movemos la esfera fuera de la colisión
            sphere.collider.center.add(result.normal.multiplyScalar(result.depth));

            // Si la colisión es en la pared, comenzamos a aplicar la gravedad
            // De lo contrario, la velocidad y se ajusta con la gravedad
            if (result.normal.y < 0.5) {
                sphere.velocity.y = -Math.abs(sphere.velocity.y); // Empieza a caer hacia el suelo

                sphere.isOnGround = true // Atributo para saber si está en el suelo
            }

        } else {

            sphere.velocity.y -= GRAVITY * deltaTime;

        }

        const damping = Math.exp(- 1.5 * deltaTime) - 1;
        sphere.velocity.addScaledVector(sphere.velocity, damping);

       //playerSphereCollision(sphere);

    });

    //spheresCollisions();
    enemyCoalition();

    for (const sphere of spheres) {

        sphere.mesh.position.copy(sphere.collider.center);

    }

}

function getForwardVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();

    return playerDirection;

}

function getSideVector() {

    camera.getWorldDirection(playerDirection);
    playerDirection.y = 0;
    playerDirection.normalize();
    playerDirection.cross(camera.up);

    return playerDirection;

}

function controls(deltaTime) {

    // gives a bit of air control
    const speedDelta = deltaTime * (playerOnFloor ? 25 : 8);

    if (keyStates['KeyW']) {

        playerVelocity.add(getForwardVector().multiplyScalar(speedDelta));

    }

    if (keyStates['KeyS']) {

        playerVelocity.add(getForwardVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyA']) {

        playerVelocity.add(getSideVector().multiplyScalar(- speedDelta));

    }

    if (keyStates['KeyD']) {

        playerVelocity.add(getSideVector().multiplyScalar(speedDelta));

    }

    if (playerOnFloor) {

        if (keyStates['Space']) {

            playerVelocity.y = 10;

        }

    }

}

const loader = new GLTFLoader().setPath('./models/gltf/');
const loaderEne = new GLTFLoader();

const modeloRuta = './models/gltf/Zombi.glb';
let modeloBase = null;
let modeloAnimations = [];

// Cargar mapa
loader.load('mapa_op.glb', (gltf) => {
    document.getElementById('loadingMessage').classList.add('hidden');

    const mapa = gltf.scene;
    mapa.scale.set(0.7, 0.7, 0.7);

    scene.add(mapa);
    worldOctree.fromGraphNode(mapa);

    gltf.scene.traverse(child => {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material.map) {
                child.material.map.anisotropy = 4;
            }
        }
    });

    const box = new THREE.Box3().setFromObject(mapa);
    const size = new THREE.Vector3();
    box.getSize(size);
    const min = box.min;

    minMap = min;
    sizeMap = size;

    // Aquí ya está cargado el mapa. Ahora carga el modelo de enemigo.
    loaderEne.load(modeloRuta, (gltfEnemy) => {
        modeloBase = gltfEnemy.scene;
        modeloAnimations = gltfEnemy.animations;

        // Ya se puede colocar porque el mapa existe
        colocarEnemigos(min, size, 60);

    });

});

// Función para colocar enemigos
function colocarEnemigos(min, size, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        if (modeloBase) {
            // Clonamos el modelo base con un clon profundo para asegurar que materiales y geometrías se copien correctamente
            const clon = SkeletonUtils.clone(modeloBase);

            // Clonar materiales y geometrías para evitar referencias compartidas
            clon.traverse((node) => {
                if (node.isMesh) {
                    node.material = node.material.clone();
                    node.geometry = node.geometry.clone();
                    node.castShadow = true;
                    node.receiveShadow = true;

                }
            });

            // Generamos las posiciones aleatorias
            const x = min.x + Math.random() * size.x;
            const z = min.z + Math.random() * size.z;

            // Establecemos la posición en las coordenadas calculadas
            clon.position.set(x, 0.1, z);
            clon.scale.set(1, 1, 1);

            const mixer = new THREE.AnimationMixer(clon);

            // Crear objeto de acciones con las animaciones disponibles
            const actions = {
                Walk: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'WALK')),
                Attack: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'ATTACK')),
                Dying: mixer.clipAction(THREE.AnimationClip.findByName(modeloAnimations, 'DYNING'))
            };

            // Reproducir animación por defecto (WALK)
            if (actions.Walk) {
                actions.Walk.setLoop(THREE.LoopRepeat, Infinity);  // Repetir indefinidamente
                actions.Walk.timeScale = 2;
                actions.Walk.play();
            }

            // Guardar el mixer para actualizarlo en el bucle de render
            mixers.push(mixer);

            // También puedes guardar las acciones si más adelante cambias de estado
            clon.userData = { actions };

            // Agregar atributo personalizado 'dead' para controlar el estado del enemigo
            clon.dead = false;

            // Añadimos el clon a la escena
            scene.add(clon);

            // Agregar collider al enemigo
            clon.collider = {
                center: clon.position.clone(),
                radius: 5
            };

            enemigos.push({
                mesh: clon,
                collider: new THREE.Sphere(clon.position.clone(), 5),
            });
        } else {
            console.warn('modeloBase no está definido al intentar clonar.');
        }
    }
}

function teleportPlayerIfOob() {

    if (camera.position.y <= - 25) {

        playerCollider.start.set(0, 0.35, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.35;
        camera.position.copy(playerCollider.end);
        camera.rotation.set(0, 0, 0);

    }

}

function isAnimating(acciones) {
    return Object.values(acciones).every(action => !action.isRunning());
}

function nuevaPosicion(enemy) {
    // Generamos las posiciones aleatorias
    const x = minMap.x + Math.random() * sizeMap.x;
    const z = minMap.z + Math.random() * sizeMap.z;

    // Establecemos la posición en las coordenadas calculadas
    enemy.position.set(x, 0.1, z);
}

function animate() {
    const delta = clock.getDelta();
    const deltaTime = Math.min(0.05, delta) / STEPS_PER_FRAME;

    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

    for (let i = 0; i < STEPS_PER_FRAME; i++) {

        controls(deltaTime);

        updatePlayer(deltaTime);

        updateSpheres(deltaTime);

        teleportPlayerIfOob();

        //console.log(playerCollider);

    }

    // Actualizar la posición de los enemigos
    const velocidadZombie = 0.02;

    enemigos.forEach((enemigo) => {
        const direccion = new THREE.Vector3();
        direccion.subVectors(playerCollider.end, enemigo.mesh.position);  // Direccion hacia el jugador
        const distancia = direccion.length();
        const acciones = enemigo.mesh.userData.actions;

        if (enemigo.dead) {
            const clipDuracion = acciones.Dying.getClip().duration;
            //const timeScale = acciones.Dying.timeScale || 1;
            const tiempoActual = acciones.Dying.time;

            if (acciones && !acciones.Dying.isRunning() && !isAnimating(acciones)) {

                if (acciones.Walk.isRunning()) {
                    acciones.Walk.stop();
                } else {
                    acciones.Attack.stop();
                }

                acciones.Dying.reset();
                acciones.Dying.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Dying.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Dying.timeScale = 2;
                acciones.Dying.play();

            }

            if (tiempoActual >= clipDuracion) {
                acciones.Dying.reset();
                acciones.Dying.play();
                acciones.Dying.stop();

                nuevaPosicion(enemigo.mesh)

                enemigo.dead = false
            }

            return;
        }

        if (distancia > 2 && !enemigo.dead) {
            direccion.normalize();  // Normalizamos la dirección para no movernos más rápido en diagonal

            // Actualizar la posición del enemigo
            enemigo.mesh.position.x += direccion.x * velocidadZombie;
            enemigo.mesh.position.z += direccion.z * velocidadZombie;

            // Asegurarse de que el enemigo siempre esté cerca del suelo
            enemigo.mesh.position.y = 0.1;

            // Actualizar collider
            enemigo.collider.center.copy(enemigo.mesh.position);

            // Calcular la rotación del enemigo hacia el jugador
            const angulo = Math.atan2(direccion.x, direccion.z);  // Calculamos el ángulo en radianes
            enemigo.mesh.rotation.y = angulo;  // Aplicamos la rotación en el eje Y

            if (acciones && (acciones.Attack.isRunning() || isAnimating(acciones))) {
                acciones.Attack.stop();        // Detén WALK si está activa
                acciones.Walk.reset();
                acciones.Walk.setLoop(THREE.LoopRepeat, Infinity);  // Repetir indefinidamente
                acciones.Walk.timeScale = 2;
                acciones.Walk.play();
            }

        } else {

            if (acciones && acciones.Walk.isRunning()) {
                acciones.Walk.stop();
                acciones.Attack.reset();
                acciones.Attack.setLoop(THREE.LoopRepeat, Infinity);  // Repetir indefinidamente
                acciones.Attack.timeScale = 1;
                acciones.Attack.play();
            }
        }
    });

    // Actualizar animaciones
    mixers.forEach(mixer => mixer.update(delta));

    renderer.render(scene, camera);

}
