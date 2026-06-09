import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';
import { PointerLockControls } from 'https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js';

// --- DEĞİŞKENLER ---
let moveForward = false, moveBackward = false, moveLeft = false, moveRight = false;
let isRunning = false;
let flashlightOn = true;
let isGameOver = false;

const velocity = new THREE.Vector3();
const direction = new THREE.Vector3();
let prevTime = performance.now();

const collidableBoxes = []; 
const playerRadius = 0.5; // Dar koridorlar için karakter genişliği biraz daraltıldı

// Zorluk Dengesi
let monster;
const monsterSpeed = 3.5;       
const monsterDetectRange = 10;   

let exitDoor;

// --- 1. SAHNE VE AYARLAR (BASIK TAVAN: h=3.5) ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xd4c270); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
// Oyuncu başlangıç pozisyonu dar koridora göre ayarlandı
camera.position.set(-45, 1.6, -45); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap; 
document.body.appendChild(renderer.domElement);

// Genel Aydınlatma
const ambientLight = new THREE.AmbientLight(0xfffae0, 0.65); 
scene.add(ambientLight);

const instructions = document.getElementById('instructions');
const interactionPrompt = document.getElementById('interaction-prompt');
const gameOverScreen = document.getElementById('game-over-screen');

// --- 2. KONTROLLER ---
const controls = new PointerLockControls(camera, document.body);

instructions.addEventListener('click', () => { if(!isGameOver) controls.lock(); });
controls.addEventListener('lock', () => instructions.style.display = 'none');
controls.addEventListener('unlock', () => { if(!isGameOver) instructions.style.display = 'flex'; });

document.addEventListener('keydown', (e) => {
    if (isGameOver) return;
    if (e.code === 'KeyW') moveForward = true;
    if (e.code === 'KeyA') moveLeft = true;
    if (e.code === 'KeyS') moveBackward = true;
    if (e.code === 'KeyD') moveRight = true;
    if (e.code === 'ShiftLeft') isRunning = true;
    
    if (e.code === 'KeyF') {
        flashlightOn = !flashlightOn;
        flashlight.visible = flashlightOn;
    }

    if (e.code === 'KeyE') {
        const playerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
        const doorPos = new THREE.Vector3(exitDoor.position.x, 0, exitDoor.position.z);
        if (playerPos.distanceTo(doorPos) < 2.5) {
            triggerEndGame("oyun-bitti");
        }
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'KeyW') moveForward = false;
    if (e.code === 'KeyA') moveLeft = false;
    if (e.code === 'KeyS') moveBackward = false;
    if (e.code === 'KeyD') moveRight = false;
    if (e.code === 'ShiftLeft') isRunning = false;
});

// --- 3. EL FENERİ ---
const flashlight = new THREE.SpotLight(0xfffadb, 35, 25, Math.PI / 4.5, 0.4, 1.2);
flashlight.castShadow = true;
scene.add(flashlight);

const flashlightTarget = new THREE.Object3D();
scene.add(flashlightTarget);
flashlight.target = flashlightTarget;

// --- 4. FLORESAN LAMBALAR (Basık tavan hizasında: y=3.4) ---
const createFluorescentLight = (x, z) => {
    const flLight = new THREE.SpotLight(0xfffae0, 12, 25, Math.PI / 2.2, 0.6, 1.2);
    flLight.position.set(x, 3.4, z);
    flLight.castShadow = true;
    scene.add(flLight);

    const paneGeo = new THREE.BoxGeometry(2, 0.02, 0.8);
    const paneMat = new THREE.MeshBasicMaterial({ color: 0xffffee }); 
    const pane = new THREE.Mesh(paneGeo, paneMat);
    pane.position.set(x, 3.48, z);
    scene.add(pane);
};

// --- 5. DOKU VE STRATEJİK DAR LABİRENT ---
const textureLoader = new THREE.TextureLoader();
const wallTexture = textureLoader.load('https://threejs.org/examples/textures/floors/FloorsCheckerboard_S_Diffuse.jpg'); 
wallTexture.wrapS = THREE.RepeatWrapping;
wallTexture.wrapT = THREE.RepeatWrapping;

const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, color: 0xd4c270, roughness: 0.8 });

// Yeni Duvar Oluşturucu (Yüksekliği otomatik 3.5 metre yapar)
const createWall = (w, d, x, z) => {
    const h = 3.5; // Sabit basık tavan yüksekliği
    const currentWallTex = wallTexture.clone();
    currentWallTex.needsUpdate = true;
    w > d ? currentWallTex.repeat.set(w / 2, h / 2) : currentWallTex.repeat.set(d / 2, h / 2);

    const currentWallMat = wallMat.clone();
    currentWallMat.map = currentWallTex;

    const wallGeo = new THREE.BoxGeometry(w, h, d);
    const wall = new THREE.Mesh(wallGeo, currentWallMat);
    wall.position.set(x, h / 2, z); // Tabana sıfırla
    wall.castShadow = true;
    wall.receiveShadow = true;
    scene.add(wall);

    const box = new THREE.Box3().setFromObject(wall);
    collidableBoxes.push(box);
};

// Zemin ve Basık Tavan Alanı (100x100)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x4a3f2c, roughness: 0.9 }));
floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);

// YENİLENEN TAVAN RENGİ (Sararmış tavan paneli tonu)
const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0xc2b78a, roughness: 0.9 }));
ceiling.rotation.x = Math.PI / 2; ceiling.position.y = 3.5; scene.add(ceiling);

// --- DAR KORİDOR MİMARİSİ (Genişlikler daraltıldı, tam klostrofobik yapı) ---
// Dış Sınırlar
createWall(100, 0.5, 0, -50); createWall(100, 0.5, 0, 50);  
createWall(0.5, 100, -50, 0); createWall(0.5, 100, 30, 0);  

// İç Dar Koridor Hatları
createWall(25, 4, -37.5, -30);
createWall(4, 30, -25, -15);
createWall(35, 4, -5, 5);
createWall(4, 40, 15, -15);
createWall(20, 4, 5, -35);
createWall(4, 25, -10, 25);
createWall(30, 4, -5, 35);
createWall(4, 20, -35, 10);
createWall(15, 4, -42.5, -10);

// Sıralı Floresan Işıklar
createFluorescentLight(-45, -40); createFluorescentLight(-25, -20);
createFluorescentLight(0, 0); createFluorescentLight(20, -20);
createFluorescentLight(-20, 20); createFluorescentLight(5, 42);

// --- 6. SEVİYE ATLAYAN CANAVAR MODELİ (HUMANOID MODEL) ---
const monsterGroup = new THREE.Group();
const monsterMat = new THREE.MeshStandardMaterial({ color: 0x1f1f1a, roughness: 0.9 });

// Gövde (Torso)
const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.12, 1.2), monsterMat);
torso.position.y = 1.6;
monsterGroup.add(torso);

// Kafa (Head)
const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), monsterMat);
head.position.y = 2.3;
monsterGroup.add(head);

// Kollar (Uzun İnce Kollar)
const armMat = new THREE.CylinderGeometry(0.04, 0.03, 1.3);
const leftArm = new THREE.Mesh(armMat, monsterMat);
leftArm.position.set(-0.28, 1.5, 0);
leftArm.rotation.z = 0.1;
monsterGroup.add(leftArm);

const rightArm = new THREE.Mesh(armMat, monsterMat);
rightArm.position.set(0.28, 1.5, 0);
rightArm.rotation.z = -0.1;
monsterGroup.add(rightArm);

// Bacaklar (Legs)
const legMat = new THREE.CylinderGeometry(0.06, 0.04, 1.1);
const leftLeg = new THREE.Mesh(legMat, monsterMat);
leftLeg.position.set(-0.12, 0.55, 0);
monsterGroup.add(leftLeg);

const rightLeg = new THREE.Mesh(legMat, monsterMat);
rightLeg.position.set(0.12, 0.55, 0);
monsterGroup.add(rightLeg);

monsterGroup.position.set(20, 0, 10); 
scene.add(monsterGroup);
monster = monsterGroup;

// --- 7. DUVARA GÖMÜLÜ ÇIKIŞ KAPISI (SOL SINIR DUVARINA SIFIR) ---
const doorGroup = new THREE.Group();
// İnce kapı kasası duvara gömülü
const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 2.4, 1.4), new THREE.MeshStandardMaterial({ color: 0x421212, roughness: 0.7 })); 
doorPanel.position.y = 1.2;
doorGroup.add(doorPanel);

// Kapıyı tam sol sınır duvarının (-50) üzerine yapıştırıyoruz
doorGroup.position.set(-49.9, 0, 20); 
scene.add(doorGroup);
exitDoor = doorGroup;

// --- ÇARPIŞMA FONKSİYONU ---
function checkWallCollisions(newPosition) {
    const playerBox = new THREE.Box3(
        new THREE.Vector3(newPosition.x - playerRadius, 0, newPosition.z - playerRadius),
        new THREE.Vector3(newPosition.x + playerRadius, 3.5, newPosition.z + playerRadius)
    );
    for (let i = 0; i < collidableBoxes.length; i++) {
        if (playerBox.intersectsBox(collidableBoxes[i])) return true;
    }
    return false;
}

// --- OYUN BİTİRME TETİKLEYİCİSİ ---
function triggerEndGame(reason) {
    isGameOver = true;
    controls.unlock();
    interactionPrompt.style.display = 'none';
    
    if(reason === "yakalandi") {
        gameOverScreen.innerText = "Yaratık Seni Yakaladı! Yeniden Başlat.";
    } else {
        gameOverScreen.innerText = "Oynadığınız için teşekkür ederiz.";
    }
    gameOverScreen.style.display = 'flex';
}

// --- 8. ANA YÜRÜTME DÖNGÜSÜ ---
function animate() {
    if (isGameOver) return; 
    requestAnimationFrame(animate);

    const time = performance.now();
    const delta = (time - prevTime) / 1000;

    // CANAVAR YAPAY ZEKASI 
    const playerPos = new THREE.Vector3(camera.position.x, 0, camera.position.z);
    const monsterPos = new THREE.Vector3(monster.position.x, 0, monster.position.z);
    const distanceToPlayer = monsterPos.distanceTo(playerPos);

    if (distanceToPlayer < monsterDetectRange) {
        monster.lookAt(playerPos.x, monster.position.y, playerPos.z);
        const dirToPlayer = new THREE.Vector3().subVectors(playerPos, monsterPos).normalize();
        monster.position.addScaledVector(dirToPlayer, monsterSpeed * delta);
    }

    if (distanceToPlayer < 1.1) {
        triggerEndGame("yakalandi");
    }

    // GÖMÜLÜ KAPI ETKİLEŞİM KONTROLÜ
    const doorPos = new THREE.Vector3(exitDoor.position.x, 0, exitDoor.position.z);
    if (playerPos.distanceTo(doorPos) < 2.5) {
        interactionPrompt.style.display = 'block'; 
    } else {
        interactionPrompt.style.display = 'none';
    }

    // OYUNCU MOTORU
    if (controls.isLocked === true) {
        velocity.x -= velocity.x * 10.0 * delta;
        velocity.z -= velocity.z * 10.0 * delta;

        direction.z = Number(moveForward) - Number(moveBackward);
        direction.x = Number(moveRight) - Number(moveLeft);
        direction.normalize();

        const speed = isRunning ? 40.0 : 20.0; // Basık odada hız hissi dengelendi
        if (moveForward || moveBackward) velocity.z -= direction.z * speed * delta;
        if (moveLeft || moveRight) velocity.x -= direction.x * speed * delta;

        const oldPosition = camera.position.clone();
        controls.moveRight(-velocity.x * delta);
        controls.moveForward(-velocity.z * delta);

        if (checkWallCollisions(camera.position)) camera.position.copy(oldPosition);

        // Fener Pozisyonu (Yeni tavan ve göz hizasına göre)
        const elapsed = time / 1000;
        let bobbing = 0;
        if (moveForward || moveBackward || moveLeft || moveRight) {
            bobbing = Math.sin(elapsed * (isRunning ? 14 : 8)) * (isRunning ? 0.02 : 0.01);
        }
        flashlight.position.copy(camera.position);
        flashlight.position.y += bobbing - 0.15; 

        const targetVector = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        flashlightTarget.position.copy(flashlight.position).add(targetVector);
    }

    prevTime = time;
    renderer.render(scene, camera);
}

animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});