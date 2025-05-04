import * as THREE from 'three';

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { AudioListener, AudioLoader, PositionalAudio } from 'https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js';

const clock = new THREE.Clock();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x202020); // Morado oscuro para el cielo al caer la noche
scene.fog = new THREE.Fog(0x202020, 0, 100); // Similar para la niebla

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.rotation.order = 'YXZ';

const fillLight1 = new THREE.HemisphereLight(0x8dc1de, 0x00668d, 1.5);
fillLight1.position.set(2, 1, 1);
scene.add(fillLight1);

const directionalLight = new THREE.DirectionalLight(0x93ffff, 2.5);
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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.VSMShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
container.appendChild(renderer.domElement);

const GRAVITY = 30;

const NUM_SPHERES = 30;
const SPHERE_RADIUS = 0.5;

const STEPS_PER_FRAME = 5;

const sphereGeometry = new THREE.IcosahedronGeometry(SPHERE_RADIUS, 5);
const sphereMaterial = new THREE.MeshLambertMaterial({ color: 0xdede8d });

const spheres = [];
const enemigos = [];
const zombieAudios = [];
const mixers = [];
let sphereIdx = 0;
const loaderBala = new GLTFLoader();
const loaderArma = new GLTFLoader();
let armaModel;
let armaTargetPosition = new THREE.Vector3();

// VARIABLES PARA EL JUEGO
let puntaje = 0;
let vida = 100;

let puntajeNivel = 0;
let noEnemigosNivel = 10;

let perdio = false;
let noBalas = 15;

let isAttack = false;
let isPlay = false;

/* SONIDOS */
let shoot = new Audio('./assets/sounds/shoot.mp3');
let music = new Audio('./assets/sounds/music.mp3');



function reproducirMusic() {
    music.volume = 0.3; // Ajusta el volumen antes de reproducirlo

    music.loop = true; // Hace que el sonido se repita
    music.play();
}

function estaReproduciendo(audio) {
    return !audio.paused && !audio.ended && audio.currentTime > 0;
}

// Cargar el modelo .glb de la bala
loaderBala.load('./models/gltf/bala.glb', function (gltf) {
    // Al cargar el modelo .glb, lo usamos para crear las balas
    for (let i = 0; i < NUM_SPHERES; i++) {
        // Crear una copia del modelo cargado
        const bullet = SkeletonUtils.clone(gltf.scene) // Clonamos el modelo

        bullet.scale.set(4, 4, 4);

        bullet.traverse((node) => {
            if (node.isMesh) {
                node.material = node.material.clone();
                node.geometry = node.geometry.clone();
                node.castShadow = true;
                node.receiveShadow = true;

                if (node.material.isMeshStandardMaterial || node.material.isMeshPhysicalMaterial) {
                    // Mantiene el color original
                    node.material.emissiveIntensity = 0.3; // más brillo sin cambiar color

                    node.material.roughness = 0.5; // más liso
                    node.material.metalness = 0.3; // más metálico

                    const baseColor = node.material.color.clone();
                    node.material.emissive = baseColor.multiplyScalar(0.1); // una pequeña emisión del color original
                }
            }
        });

        // Añadir la bala a la escena
        scene.add(bullet);

        // Agregar la bala al array de esferas (spheres)
        spheres.push({
            mesh: bullet,
            collider: new THREE.Sphere(new THREE.Vector3(0, -100, 0), SPHERE_RADIUS), // Usamos un collider esférico para la bala
            velocity: new THREE.Vector3(), // Velocidad inicial de la bala
            isOnGround: false // Atributo para saber si está en el suelo
        });
    }
}, undefined, function (error) {
    console.error(error); // Si hay algún error al cargar el modelo
});

// Cargar el modelo .glb del arma
loaderArma.load('./models/gltf/arma.glb', function (gltf) {
    armaModel = gltf.scene;
    armaModel.scale.set(0.6, 0.6, 0.6); // Ajusta según tamaño real del modelo

    // Posición inicial (parte inferior derecha de la vista de la cámara)
    const offsetInicial = new THREE.Vector3(0.4, -0.3, -0.7); // Derecha, abajo, hacia adelante
    const initialPosition = camera.position.clone().add(offsetInicial.applyQuaternion(camera.quaternion));
    armaModel.position.copy(initialPosition);

    // Posición destino (centro de pantalla, justo al frente)
    const offsetCentro = new THREE.Vector3(0, -0.1, -0.5);
    armaTargetPosition.copy(camera.position.clone().add(offsetCentro.applyQuaternion(camera.quaternion)));

    scene.add(armaModel);
}, undefined, function (error) {
    console.error(error);
});


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

    if (vida <= 0 || perdio) {
        return;
    }

    if (noBalas <= 0) {
        return;
    }

    if (!isPlay) {
        return;
    }

    const sphere = spheres[sphereIdx];
    camera.getWorldDirection(playerDirection);

    sphere.collider.center.copy(playerCollider.end).addScaledVector(playerDirection, playerCollider.radius * 1.5);
    sphere.isOnGround = false;

    if (!scene.children.includes(sphere.mesh)) {
        scene.add(sphere.mesh)
    }

    // Obtener posición objetivo en la dirección del jugador
    const target = new THREE.Vector3().copy(sphere.mesh.position).add(playerDirection);

    // Hacer que la malla mire hacia la dirección del jugador
    sphere.mesh.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().lookAt(sphere.mesh.position, target, new THREE.Vector3(0, -1, 0))
    );

    // Ajustar rotación inicial del modelo si apunta en otra dirección originalmente
    sphere.mesh.rotateY(-Math.PI / 2);  // Por ejemplo, si tu modelo apunta en el eje Y

    // throw the ball with more force if we hold the button longer, and if we move forward
    const impulse = 50 + 30 * (1 - Math.exp((mouseTime - performance.now()) * 0.001));

    shoot.currentTime = 0;  // Reinicia el sonido si no se está reproduciendo
    shoot.volume = 0.2;
    shoot.play();

    sphere.velocity.copy(playerDirection).multiplyScalar(impulse);
    sphere.velocity.addScaledVector(playerVelocity, 2);

    sphereIdx = (sphereIdx + 1) % spheres.length;

    noBalas--;

    let txt = noBalas.toString().padStart(2, ' ');
    document.getElementById('noBalas').innerHTML = 'Munición ' + txt + '/15'
    actualizarBarraMunicion();
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
    posArma();

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


function enemyCollisions(enemigo) {
    // Tomar los valores del objeto enemigo
    const x = enemigo.collider.center.x;        // Posición en X
    const y = enemigo.collider.center.y + 2;    // Posición en Y
    const z = enemigo.collider.center.z;        // Posición en Z

    const radio = 0.9;  // Tamaño en radio para la esfera

    // Crear una esfera con la posición y radio del enemigo
    const esferaCollider = new THREE.Sphere(new THREE.Vector3(x, y, z), radio);

    // Usar el método sphereIntersect para verificar si la esfera colisiona con alguna pared
    const result = worldOctree.sphereIntersect(esferaCollider);

    if (result) {
        // Opción para mover al enemigo fuera de la colisión, si es necesario
        enemigo.collider.center.addScaledVector(result.normal, result.depth);
        return true;  // Retorna true si se detectó la colisión
    }

    // Retorna false si no se detectó colisión
    return false;
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

const listener = new THREE.AudioListener();
camera.add(listener);
const audioLoader = new THREE.AudioLoader();

// Cargar mapa
loader.load('Mapa_op.glb', (gltf) => {
    document.getElementById('spinner').classList.add('hidden');
    document.getElementById('txtSpinner').classList.add('hidden');
    agregarBoton();

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
        colocarEnemigos(min, size, 70);

    });

});

// Función para colocar enemigos
function colocarEnemigos(min, size, cantidad) {
    for (let i = 0; i < cantidad; i++) {
        if (modeloBase) {
            // Clonamos el modelo base con un clon profundo para asegurar que materiales y geometrías se copien correctamente
            const clon = SkeletonUtils.clone(modeloBase);

            // Crear el primer audio para el sonido de caminar
            const audioWalk = new THREE.PositionalAudio(listener);
            audioLoader.load('./assets/sounds/Zombie.mp3', (buffer) => {
                audioWalk.setBuffer(buffer);
                audioWalk.setRefDistance(0);
                audioWalk.setLoop(true);
                audioWalk.setVolume(2);

                audioWalk.setMaxDistance(20);  // Más allá de esto, apenas se escucha
                audioWalk.setDistanceModel('linear');  // Puedes usar 'inverse' o 'exponential' también

                zombieAudios.push(audioWalk);  // Guardar el audio en el array de audios globales
                clon.audioWalk = audioWalk;  // Asignar el audio de caminar al clon
            });

            // Crear el segundo audio para el sonido de ataque
            const audioAttack = new THREE.PositionalAudio(listener);
            audioLoader.load('./assets/sounds/zombi_attack.mp3', (buffer) => {
                audioAttack.setBuffer(buffer);
                audioAttack.setRefDistance(0);
                audioAttack.setLoop(true);
                audioAttack.setVolume(1);

                audioAttack.setMaxDistance(20);  // Más allá de esto, apenas se escucha
                audioAttack.setDistanceModel('linear');  // Puedes usar 'inverse' o 'exponential' también

                clon.audioAttack = audioAttack;  // Asignar el audio de ataque al clon
            });

            // Crear el segundo audio para el sonido de muerte
            const audioDead = new THREE.PositionalAudio(listener);
            audioLoader.load('./assets/sounds/zombie_dead.mp3', (buffer) => {
                audioDead.setBuffer(buffer);
                audioDead.setRefDistance(0);
                audioDead.setLoop(true);
                audioDead.setVolume(2);

                audioDead.setMaxDistance(20);  // Más allá de esto, apenas se escucha
                audioDead.setDistanceModel('linear');  // Puedes usar 'inverse' o 'exponential' también

                clon.audioDead = audioDead;  // Asignar el audio de ataque al clon
            });


            // Clonar materiales y geometrías para evitar referencias compartidas
            clon.traverse((node) => {
                if (node.isMesh) {
                    node.material = node.material.clone();
                    node.geometry = node.geometry.clone();
                    node.castShadow = true;
                    node.receiveShadow = true;
                    node.add(audioAttack)
                    node.add(audioWalk)
                    node.add(audioDead)

                    if (node.material.isMeshStandardMaterial || node.material.isMeshPhysicalMaterial) {
                        // Mantiene el color original
                        node.material.emissiveIntensity = 1; // más brillo sin cambiar color

                        node.material.roughness = 0.8; // más liso
                        node.material.metalness = 0.5; // más metálico

                        const baseColor = node.material.color.clone();
                        node.material.emissive = baseColor.multiplyScalar(0.01); // una pequeña emisión del color original
                    }
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
                radius: 5,
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

    if (camera.position.y <= - 20) {

        playerCollider.start.set(0, 0.5, 0);
        playerCollider.end.set(0, 1, 0);
        playerCollider.radius = 0.5;
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

// Función que actualiza la posición y orientación del arma
//const clock1 = new THREE.Clock();

function posArma() {
    if (!armaModel) return;

    // Base: posición del jugador
    const basePos = playerCollider.end.clone();

    // Offset relativo a la cámara
    const offset = new THREE.Vector3(0.2, -0.3, -0.7); // abajo, derecha y al frente
    const offsetMundial = offset.applyQuaternion(camera.quaternion);

    // Posición final sin interpolación
    // Espera 1000 milisegundos (1 segundo) antes de actualizar la posición
    setTimeout(() => {
        armaModel.position.copy(basePos.add(offsetMundial));
    }, 0.05); // 1000 milisegundos

    // Rotación = igual a la de la cámara
    armaModel.quaternion.copy(camera.quaternion);

    // Ajuste diagonal
    armaModel.rotateX(0.40);
    armaModel.rotateY(-1.1);
}

function crearCruz() {
    const material = new THREE.LineBasicMaterial({ color: 0xbd0505 });
    const size = 0.3;

    const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size, 0, 0), new THREE.Vector3(size, 0, 0),
        new THREE.Vector3(0, -size, 0), new THREE.Vector3(0, size, 0),
    ]);

    const cruz = new THREE.LineSegments(geometry, material);
    scene.add(cruz);
    return cruz;
}

const mira = crearCruz();

function animate() {
    const delta = clock.getDelta();
    const deltaTime = Math.min(0.05, delta) / STEPS_PER_FRAME;

    if (vida <= 0 || perdio) {
        renderer.setAnimationLoop(null);
        txtGameOver();

        zombieAudios.forEach(audio => {
            if (audio.isPlaying && audio.buffer) {
                audio.pause();
            }
        });

        enemigos.forEach((enemigo) => {
            enemigo.mesh.audioWalk.pause();
            enemigo.mesh.audioAttack.pause();
            enemigo.mesh.audioDead.pause();
        });

        clearInterval(intervaBalaslId);
        document.exitPointerLock();
        container.removeEventListener('mousedown', handleMouseDown);
    }

    // we look for collisions in substeps to mitigate the risk of
    // an object traversing another too quickly for detection.

    for (let i = 0; i < STEPS_PER_FRAME; i++) {

        controls(deltaTime);

        updatePlayer(deltaTime);

        updateSpheres(deltaTime);

        teleportPlayerIfOob();

        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir); // obtiene la dirección hacia la que mira la cámara
        const miraPos = new THREE.Vector3().copy(camera.position).add(camDir.multiplyScalar(10));
        miraPos.y -= 0.7;
        mira.position.copy(miraPos);
        mira.rotation.copy(camera.rotation);
    }

    // Actualizar la posición de los enemigos
    const velocidadZombie = 0.01;
    isAttack = false;

    enemigos.forEach((enemigo) => {
        const direccion = new THREE.Vector3();
        direccion.subVectors(playerCollider.end, enemigo.mesh.position);  // Direccion hacia el jugador
        const distancia = direccion.length();
        const acciones = enemigo.mesh.userData.actions;

        // Si el enemigo choca con una pared se genera en una nueva posición
        if (enemyCollisions(enemigo, deltaTime)) {
            nuevaPosicion(enemigo.mesh)
        }

        if (enemigo.dead && isAnimating(acciones)) {
            //console.log('Bug')
            acciones.Dying.reset();
            acciones.Dying.play();
            acciones.Dying.stop();

            nuevaPosicion(enemigo.mesh)

            enemigo.dead = false
            return;
        }

        if (enemigo.dead) {
            const clipDuracion = acciones.Dying.getClip().duration;
            //const timeScale = acciones.Dying.timeScale || 1;
            const tiempoActual = acciones.Dying.time;

            if (acciones && !acciones.Dying.isRunning() && !isAnimating(acciones)) {

                if (acciones.Walk.isRunning()) {
                    acciones.Walk.stop();
                    enemigo.mesh.audioWalk.pause();
                } else {
                    acciones.Attack.stop();
                    enemigo.mesh.audioAttack.pause();
                }

                if (!enemigo.mesh.audioDead.isPlaying) {
                    enemigo.mesh.audioDead.play();
                }

                acciones.Dying.reset();
                acciones.Dying.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Dying.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Dying.timeScale = 2;
                acciones.Dying.play();

                puntaje++;
                puntajeNivel++;

                document.getElementById('puntObje').innerHTML = puntajeNivel;
                document.getElementById('puntTotal').innerHTML = puntaje;
                //console.log(puntaje)
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

                if (!enemigo.mesh.audioWalk.isPlaying) {
                    enemigo.mesh.audioWalk.play();
                }

                enemigo.mesh.audioAttack.pause();
            }

        } else {

            const clipDuracion = acciones.Attack.getClip().duration;
            const tiempoActual = acciones.Attack.time;
            isAttack = true;

            if (acciones && !acciones.Attack.isRunning() && !isAnimating(acciones)) {

                if (acciones.Walk.isRunning()) {
                    acciones.Walk.stop();
                }

                acciones.Attack.reset();
                acciones.Attack.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Attack.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Attack.timeScale = 2;
                acciones.Attack.play();

                enemigo.mesh.audioWalk.pause();

                if (!enemigo.mesh.audioAttack.isPlaying) {
                    enemigo.mesh.audioAttack.play();
                }
            }

            if (tiempoActual >= clipDuracion) {
                acciones.Attack.reset();
                acciones.Attack.setLoop(THREE.LoopOnce, 1);   // Solo una vez
                acciones.Attack.clampWhenFinished = true;     // Se detiene en el último frame
                acciones.Attack.timeScale = 2;
                acciones.Attack.play();

                vida -= 5;

                let fuerzaTexto = vida.toString().padStart(3, ' ');
                document.getElementById('fuerza').innerHTML = 'Fuerza ' + fuerzaTexto + '/100';
                actualizarBarraVida();
            }
        }
    });

    if (isAttack) {
        document.getElementById('three-container').classList.add('show-border');
    } else {
        document.getElementById('three-container').classList.remove('show-border');
    }

    // Actualizar animaciones
    mixers.forEach(mixer => mixer.update(delta));

    renderer.render(scene, camera);

}

// Función que se ejecuta cada minuto
function incrementaNivel() {
    //Cada nivel aumenta dos enemigos más para matar
    if (noEnemigosNivel > puntajeNivel) {
        perdio = true;
    }

    noEnemigosNivel += 2;
    puntajeNivel = 0;

    document.getElementById('puntObje').innerHTML = puntajeNivel;
}

function incrementaBalas() {
    //Cada nivel aumenta dos enemigos más para matar
    if (noBalas < 15)
        noBalas++;

    let txt = noBalas.toString().padStart(2, ' ');
    document.getElementById('noBalas').innerHTML = 'Munición ' + txt + '/15'
    actualizarBarraMunicion();
}

const intervaBalaslId = setInterval(incrementaBalas, 1500);

function txtGameOver() {
    // Limpiar el contenido previo del contenedor
    const threeContainer = document.getElementById('three-container');
    threeContainer.innerHTML = '';  // Borra todo el contenido actual

    // Crear el contenedor principal
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'loadingMessage';

    // Crear y agregar el título
    const title = document.createElement('h1');
    title.classList.add('game-title');
    title.textContent = 'Game Over';
    loadingMessage.appendChild(title);

    // Agregar el mensaje al contenedor
    threeContainer.appendChild(loadingMessage);

    // Llamar a la función para agregar el botón
    agregarBoton('JUGAR DE NUEVO', 1);
}

function agregarBoton(txt = 'JUGAR AHORA', opc = 0) {
    // Crear el contenedor <span>
    const span = document.createElement('span');

    // Crear el contenedor <div> con id 'btnControl' y la clase 'containerBtn'
    const btnControl = document.createElement('div');
    btnControl.id = 'btnControl';
    btnControl.classList.add('containerBtn');

    // Crear el enlace <a> con la clase 'button' y 'type--C'
    const buttonLink = document.createElement('a');
    buttonLink.href = '#';
    buttonLink.classList.add('button', 'type--C');

    // Crear el texto dentro del botón
    const buttonText = document.createElement('span');
    buttonText.classList.add('button__text');
    buttonText.textContent = txt;

    // Agregar el texto al botón
    buttonLink.appendChild(buttonText);

    // Agregar el enlace al contenedor <div>
    btnControl.appendChild(buttonLink);

    // Agregar el contenedor <div> al contenedor <span>
    span.appendChild(btnControl);

    // Obtener el contenedor de carga por su ID y agregarle el <span>
    const loadingMessage = document.getElementById('loadingMessage');
    loadingMessage.appendChild(span);

    // Agregar el evento de clic al botón
    buttonLink.addEventListener('click', function (event) {
        event.preventDefault();  // Prevenir la acción predeterminada del enlace (si es necesario)

        if (opc == 0) {
            renderer.setAnimationLoop(animate);
            isPlay = true;

            if (!estaReproduciendo(music)) {
                reproducirMusic();
            }

            zombieAudios.forEach(audio => {
                if (!audio.isPlaying && audio.buffer) {
                    audio.play();
                }
            });

            document.getElementById('loadingMessage').classList.add('hidden');

            document.body.requestPointerLock();
            container.addEventListener('mousedown', handleMouseDown);

            iniciarTemporizador(60);
            mostrarAlerta();
        } else {
            location.reload();
        }
    });
}

function handleMouseDown() {
    document.body.requestPointerLock();
    mouseTime = performance.now();
}

function iniciarTemporizador(duracionSegundos) {
    const timeElement = document.getElementById('time');
    let tiempoInicio = Date.now();

    function actualizar() {
        const tiempoActual = Date.now();
        const tiempoTranscurrido = tiempoActual - tiempoInicio;
        const tiempoRestante = duracionSegundos * 1000 - (tiempoTranscurrido % (duracionSegundos * 1000));

        const segundosRestantes = Math.floor(tiempoRestante / 1000);
        const minutos = Math.floor(segundosRestantes / 60).toString().padStart(2, '0');
        const segundos = (segundosRestantes % 60).toString().padStart(2, '0');

        if (timeElement) {
            timeElement.textContent = `${minutos}:${segundos}`;
        }

        // Cuando se cumple exactamente un ciclo completo
        if (tiempoTranscurrido >= duracionSegundos * 1000) {
            incrementaNivel();
            mostrarAlerta();
            tiempoInicio = Date.now(); // Reinicia el tiempo
        }

        requestAnimationFrame(actualizar);
    }

    actualizar();
}

function actualizarBarraMunicion() {
    const porcentajeMunicion = (noBalas / 15) * 100;
    const barraMunicion = document.getElementById('progressBarBullets');
    barraMunicion.style.setProperty('width', porcentajeMunicion + '%', 'important');

    // Actualizar el texto que muestra la munición
    document.getElementById('noBalas').innerHTML = `Munición ${noBalas}/15`;
}

function actualizarBarraVida() {
    const porcentajeVida = (vida / 100) * 100; // Supongo que la vida máxima es 100
    const barraVida = document.getElementById('progressBarVida');
    barraVida.style.setProperty('width', porcentajeVida + '%', 'important');

    // Actualizar el texto que muestra la vida
    document.getElementById('fuerza').innerHTML = `Fuerza ${vida}/100`;
}

function mostrarAlerta() {
    const alerta = document.getElementById('modalAlerta');
    document.getElementById('txtDescript').innerHTML = 'Debes de terminar con ' + noEnemigosNivel + ' zombies';
    alerta.classList.add('mostrar'); // Muestra la alerta añadiendo la clase

    setTimeout(() => {
        alerta.classList.remove('mostrar'); // La oculta después de 3 segundos
    }, 3000);
}