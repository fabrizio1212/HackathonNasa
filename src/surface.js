import * as THREE from "three";

const boundary = 140;
const lunarGravity = 1.62; // m/s²
const jumpSpeed = 1.55;
const walkSpeed = 1.85;
const runSpeed = 3.65;
const terrainSize = 380;
const terrainSegments = 240;
const initialPosition = new THREE.Vector3(3.4, 0, 5.4);
const movementKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space"]);
const craters = [[-14, -17, 6], [20, -27, 10], [-35, 14, 12], [38, 39, 14], [3, -55, 17], [-55, -24, 19], [56, -54, 21], [-49, 57, 23]];

function terrainHeight(x, z) {
  const distance = Math.hypot(x, z);
  let height = Math.min(distance / 22, 1) * (
    Math.sin(x * .13 + z * .17) * .36 + Math.cos(z * .28 - x * .11) * .26
    + Math.sin(x * .62 + z * .31) * .07
  );
  for (const [cx, cz, radius] of craters) {
    const r = Math.hypot(x - cx, z - cz) / radius;
    if (r < 1.5) height += radius * (
      .045 * Math.exp(-((r - 1) ** 2) / .035) - .12 * Math.max(1 - r * r, 0)
    );
  }
  return height;
}

function randomGenerator(seed) {
  return () => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function createGround(heightAt) {
  const random = randomGenerator(111969);
  const geometry = new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegments, terrainSegments).rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = [];
  const dust = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    positions.setY(i, heightAt(x, z));
    dust.set(0x82796f).multiplyScalar(.79 + random() * .32);
    colors.push(dust.r, dust.g, dust.b);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const size = 256;
  const grain = new Uint8Array(size * size * 4);
  for (let i = 0; i < grain.length; i += 4) {
    grain.fill(85 + random() * 153, i, i + 3);
    grain[i + 3] = 255;
  }
  const bumpMap = new THREE.DataTexture(grain, size, size);
  bumpMap.wrapS = bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.repeat.set(94, 94);
  bumpMap.magFilter = THREE.LinearFilter;
  bumpMap.minFilter = THREE.LinearMipmapLinearFilter;
  bumpMap.generateMipmaps = true;
  bumpMap.needsUpdate = true;
  const ground = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 1, bumpMap, bumpScale: .20,
  }));
  ground.receiveShadow = true;
  return ground;
}

function createFlag() {
  const flag = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: 0xb6ab9b, metalness: .48, roughness: .52 });
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(.022, .025, 2.17, 12), metal);
  staff.position.y = 1.085;
  const crossbar = new THREE.Mesh(new THREE.CylinderGeometry(.014, .014, 1.18, 8), metal);
  crossbar.rotation.z = Math.PI / 2;
  crossbar.position.set(.59, 2.15, 0);
  staff.castShadow = crossbar.castShadow = true;
  flag.add(staff, crossbar);

  const canvas = document.createElement("canvas");
  canvas.width = 520;
  canvas.height = 260;
  const ctx = canvas.getContext("2d");
  for (let stripe = 0; stripe < 13; stripe += 1) {
    ctx.fillStyle = stripe % 2 ? "#eee9dd" : "#ad273c";
    ctx.fillRect(0, stripe * 20, 520, 20);
  }
  ctx.fillStyle = "#27385d";
  ctx.fillRect(0, 0, 208, 140);
  ctx.fillStyle = "#eee9dd";
  for (let row = 0; row < 9; row += 1) {
    const count = row % 2 ? 5 : 6;
    for (let column = 0; column < count; column += 1) {
      const x = 104 + (column - (count - 1) / 2) * 33;
      const y = 14 + row * 14;
      ctx.beginPath();
      for (let vertex = 0; vertex < 10; vertex += 1) {
        const angle = vertex * Math.PI / 5 - Math.PI / 2;
        const radius = vertex % 2 ? 2.4 : 5.8;
        ctx.lineTo(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius);
      }
      ctx.closePath();
      ctx.fill();
    }
  }
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const clothGeometry = new THREE.PlaneGeometry(1.28, .83, 32, 14);
  const positions = clothGeometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i) + .64;
    const y = positions.getY(i) + .415;
    positions.setXYZ(i, x - .10 * (y / .83) * (x / 1.28), y,
      .075 * (x / 1.28) * Math.sin(x * 12 + y * 8));
  }
  clothGeometry.computeVertexNormals();
  const cloth = new THREE.Mesh(clothGeometry, new THREE.MeshStandardMaterial({ map, side: THREE.DoubleSide }));
  cloth.position.y = 1.32;
  cloth.castShadow = true;
  flag.add(cloth);
  // North is -Z. The historical support rod pointed 24 degrees south of east.
  flag.rotation.y = -THREE.MathUtils.degToRad(24);
  flag.rotation.z = THREE.MathUtils.degToRad(2);
  return flag;
}

function createRocks(heightAt) {
  const random = randomGenerator(1120);
  const geometry = new THREE.IcosahedronGeometry(1, 0);
  const rocks = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({
    color: 0x9b8d7f, roughness: 1, flatShading: true,
  }), 720);
  const transform = new THREE.Object3D();
  for (let index = 0; index < rocks.count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = 3 + random() ** 1.7 * 150;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const size = .06 + random() ** 4 * (radius < 12 ? .29 : 1.65);
    transform.position.set(x, heightAt(x, z), z);
    transform.rotation.set(.2, random() * Math.PI, random());
    transform.scale.set(size, size * (.4 + random() * .5), size * (.75 + random() * .4));
    transform.updateMatrix();
    rocks.setMatrixAt(index, transform.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  return rocks;
}

export function createSurface(canvas, pad) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x060608);
  const stars = [];
  const random = randomGenerator(1969);
  for (let index = 0; index < 420; index += 1) {
    const angle = random() * Math.PI * 2;
    const y = random() * 285;
    const radius = Math.sqrt(300 ** 2 - y ** 2);
    stars.push(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
  }
  const sky = new THREE.BufferGeometry();
  sky.setAttribute("position", new THREE.Float32BufferAttribute(stars, 3));
  scene.add(new THREE.Points(sky, new THREE.PointsMaterial({ color: 0xaaa6a5, size: .55 })));
  let eastOffset = 0;
  let northOffset = 0;
  const heightAt = (x, z) => terrainHeight(x + eastOffset, z + northOffset);
  const ground = createGround(heightAt);
  const flag = createFlag();
  let rocks = createRocks(heightAt);
  scene.add(ground, flag, rocks);
  scene.add(new THREE.HemisphereLight(0xe8e2dc, 0x504439, 1.25));
  const sun = new THREE.DirectionalLight(0xfff3e3, 2.4);
  sun.position.set(-24, 14, 13);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: .5, far: 160 });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.normalBias = .03;
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(61, 1, .055, 500);
  camera.rotation.order = "YXZ";
  const position = initialPosition.clone();
  const pressedKeys = new Set();
  const heldButtons = new Map();
  let enabled = false;
  let activePointer = null;
  let yaw = 0;
  let pitch = 0;
  let lastTime = 0;
  const velocity = new THREE.Vector3();
  const desiredVelocity = new THREE.Vector2();
  const origin2D = new THREE.Vector2();
  let grounded = true;
  let jumpQueued = false;
  let tapDirection = null;
  let tapRemaining = 0;

  function stopInput() {
    pressedKeys.clear();
    heldButtons.clear();
    activePointer = null;
    jumpQueued = false;
    tapRemaining = 0;
  }

  canvas.addEventListener("keydown", (event) => {
    if (!enabled || !movementKeys.has(event.code)) return;
    event.preventDefault();
    if (event.code === "Space" && !event.repeat) jumpQueued = true;
    pressedKeys.add(event.code);
  });
  canvas.addEventListener("keyup", (event) => pressedKeys.delete(event.code));
  canvas.addEventListener("blur", () => pressedKeys.clear());
  window.addEventListener("blur", stopInput);

  canvas.addEventListener("pointerdown", (event) => {
    if (!enabled || event.button !== 0 || activePointer !== null) return;
    canvas.focus({ preventScroll: true });
    activePointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!enabled || activePointer?.id !== event.pointerId) return;
    yaw -= (event.clientX - activePointer.x) * .004;
    pitch = THREE.MathUtils.clamp(pitch - (event.clientY - activePointer.y) * .004, -1.25, 1.25);
    activePointer.x = event.clientX;
    activePointer.y = event.clientY;
  });
  canvas.addEventListener("lostpointercapture", (event) => {
    if (activePointer?.id === event.pointerId) activePointer = null;
  });

  for (const button of pad.querySelectorAll("button")) {
    button.addEventListener("pointerdown", (event) => {
      if (!enabled || event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      if (button.dataset.move === "Space") jumpQueued = true;
      heldButtons.set(event.pointerId, button.dataset.move);
    });
    button.addEventListener("lostpointercapture", (event) => heldButtons.delete(event.pointerId));
    button.addEventListener("click", (event) => {
      if (!enabled || event.detail !== 0) return;
      if (button.dataset.move === "Space") {
        jumpQueued = true;
      } else {
        tapDirection = button.dataset.move;
        tapRemaining = .25;
      }
    });
  }

  function groundHeight(x, z) {
    // Match the triangles rendered by PlaneGeometry so feet land on the mesh.
    const cellSize = terrainSize / terrainSegments;
    const u = (x + terrainSize / 2) / cellSize;
    const v = (z + terrainSize / 2) / cellSize;
    const column = Math.floor(u);
    const row = Math.floor(v);
    const dx = u - column;
    const dz = v - row;
    const start = row * (terrainSegments + 1) + column;
    const positions = ground.geometry.attributes.position;
    const topLeft = positions.getY(start);
    const topRight = positions.getY(start + 1);
    const bottomLeft = positions.getY(start + terrainSegments + 1);
    if (dx + dz <= 1) return topLeft * (1 - dx - dz) + topRight * dx + bottomLeft * dz;
    const bottomRight = positions.getY(start + terrainSegments + 2);
    return bottomRight * (dx + dz - 1) + topRight * (1 - dz) + bottomLeft * (1 - dx);
  }

  function simulate(input, dt) {
    const forward = Number(input.has("KeyW")) - Number(input.has("KeyS"));
    const sideways = Number(input.has("KeyD")) - Number(input.has("KeyA"));
    const running = input.has("ShiftLeft") || input.has("ShiftRight");
    desiredVelocity.set(sideways, -forward).clampLength(0, 1).rotateAround(origin2D, -yaw);
    desiredVelocity.multiplyScalar(running ? runSpeed : walkSpeed);

    const airborneControl = desiredVelocity.lengthSq() > 0 ? .45 : 0;
    const response = grounded ? (desiredVelocity.lengthSq() > 0 ? 5 : 4) : airborneControl;
    const blend = 1 - Math.exp(-response * dt);
    velocity.x = THREE.MathUtils.lerp(velocity.x, desiredVelocity.x, blend);
    velocity.z = THREE.MathUtils.lerp(velocity.z, desiredVelocity.y, blend);

    if (jumpQueued && grounded) {
      velocity.y = jumpSpeed;
      grounded = false;
    }
    jumpQueued = false;

    const oldGround = groundHeight(position.x, position.z);
    const nextX = THREE.MathUtils.clamp(position.x + velocity.x * dt, -boundary, boundary);
    const nextZ = THREE.MathUtils.clamp(position.z + velocity.z * dt, -boundary, boundary);
    const floor = groundHeight(nextX, nextZ);
    const travelled = Math.hypot(nextX - position.x, nextZ - position.z);
    if (grounded && floor - oldGround > travelled * .8) {
      velocity.x = velocity.z = 0;
      return;
    }

    position.x = nextX;
    position.z = nextZ;
    if (grounded && oldGround - floor <= travelled * .45 + .015) {
      position.y = floor;
      return;
    }

    grounded = false;
    position.y += velocity.y * dt - .5 * lunarGravity * dt * dt;
    velocity.y -= lunarGravity * dt;
    if (position.y <= floor && velocity.y <= 0) {
      position.y = floor;
      velocity.y = 0;
      grounded = true;
    }
  }

  return {
    scene,
    camera,
    setActive(active) {
      enabled = active;
      stopInput();
    },
    teleport(site) {
      const isApollo11 = site.id === "apollo-11";
      const nextEast = isApollo11 ? 0 : Math.cos(THREE.MathUtils.degToRad(site.lon)) * 64;
      const nextNorth = isApollo11 ? 0 : Math.sin(THREE.MathUtils.degToRad(site.lon + site.lat)) * 64;

      if (eastOffset !== nextEast || northOffset !== nextNorth) {
        eastOffset = nextEast;
        northOffset = nextNorth;
        const positions = ground.geometry.attributes.position;
        for (let i = 0; i < positions.count; i += 1) {
          positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
        }
        positions.needsUpdate = true;
        ground.geometry.computeVertexNormals();
        ground.geometry.computeBoundingSphere();
        scene.remove(rocks);
        rocks.dispose();
        rocks.geometry.dispose();
        rocks.material.dispose();
        rocks = createRocks(heightAt);
        scene.add(rocks);
      }
      flag.visible = isApollo11;
      stopInput();
      position.copy(initialPosition);
      position.y = groundHeight(position.x, position.z);
      velocity.set(0, 0, 0);
      grounded = true;
      yaw = isApollo11 ? Math.atan2(position.x, position.z) : THREE.MathUtils.degToRad(site.lon);
      pitch = -.045;
      lastTime = 0;
      canvas.focus({ preventScroll: true });
    },
    resize(width, height) {
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    },
    update(time) {
      const dt = lastTime ? Math.min((time - lastTime) / 1000, .045) : 0;
      lastTime = time;
      const input = new Set([...pressedKeys, ...heldButtons.values()]);
      yaw += ((input.has("ArrowLeft") ? 1 : 0) - (input.has("ArrowRight") ? 1 : 0)) * dt * 1.4;
      pitch = THREE.MathUtils.clamp(pitch + ((input.has("ArrowUp") ? 1 : 0) -
        (input.has("ArrowDown") ? 1 : 0)) * dt * 1.1, -1.25, 1.25);
      if (tapRemaining > 0) {
        input.add(tapDirection);
        tapRemaining -= dt;
      }
      const substeps = Math.ceil(dt * 120);
      for (let step = 0; step < substeps; step += 1) simulate(input, dt / substeps);
      camera.position.set(position.x, position.y + 1.67, position.z);
      camera.rotation.set(pitch, yaw, 0);
    },
  };
}