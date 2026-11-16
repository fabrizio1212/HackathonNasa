import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const sites = [
  {
    id: "shackleton",
    name: "Cráter Shackleton",
    kind: "artemis",
    label: "REFERENCIA POLAR · ARTEMIS",
    lat: -89.9,
    lon: 0.0,
    description: "Borde del cráter próximo al polo sur; referencia para evaluar iluminación en relieves polares.",
  },
  {
    id: "peak-shackleton",
    name: "Peak Near Shackleton",
    kind: "artemis",
    label: "CANDIDATO ARTEMIS III",
    lat: -89.4,
    lon: 222.6,
    description: "Zona elevada cercana a Shackleton, incluida entre las regiones candidatas de Artemis III.",
  },
  {
    id: "connecting-ridge",
    name: "Connecting Ridge",
    kind: "artemis",
    label: "CANDIDATO ARTEMIS III",
    lat: -88.6,
    lon: 33.3,
    description: "Cresta de referencia al sur, útil para comparar exposición solar y horizonte local.",
  },
  {
    id: "de-gerlache",
    name: "De Gerlache–Kocher",
    kind: "artemis",
    label: "CANDIDATO ARTEMIS III",
    lat: -85.4,
    lon: 156.4,
    description: "Región candidata de latitud alta; su relieve puede alternar áreas iluminadas y en sombra.",
  },
  {
    id: "malapert",
    name: "Macizo Malapert",
    kind: "artemis",
    label: "CANDIDATO ARTEMIS III",
    lat: -85.4,
    lon: 0.0,
    description: "Macizo de referencia para estudiar terreno elevado y posibles enlaces con la Tierra.",
  },
  {
    id: "apollo-11",
    name: "Apollo 11 · Tranquility",
    kind: "apollo",
    label: "SITIO HISTÓRICO · APOLLO",
    lat: 0.674,
    lon: 23.473,
    description: "Sitio histórico de Apollo 11, incluido como punto de referencia fuera de la región polar.",
  },
  {
    id: "apollo-17",
    name: "Apollo 17 · Taurus–Littrow",
    kind: "apollo",
    label: "SITIO HISTÓRICO · APOLLO",
    lat: 20.19,
    lon: 30.77,
    description: "Sitio histórico de Apollo 17, referencia de latitud media para comparar geometría.",
  },
];

const $ = (selector) => document.querySelector(selector);
const viewport = $("#viewport");
const tooltip = $("#hover-tooltip");
const sunRaycaster = new THREE.Raycaster();
const pointerRaycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const clockLabel = $("#utc-clock");
const lightDirection = new THREE.Vector3();
const earthDirection = new THREE.Vector3();
const tempVector = new THREE.Vector3();
const markerMeshes = [];

let renderer;
let camera;
let controls;
let scene;
let moonGroup;
let moon;
let directionalLight;
let activeSiteId = null;
let hoveredPoint = null;
let pointerInside = false;
let ephemerisData = null;
let ephemerisRequest = 0;
let lastPointer = { x: 0, y: 0 };
let hoverFrame = 0;
let frame = 0;
let sunAzimuth = 45;
let sunElevation = 8;
let earthAzimuth = 0;
let earthElevation = 0;

function showError(message) {
  $("#loading-status").classList.add("hidden");
  const error = $("#error-message");
  error.textContent = message;
  error.classList.add("visible");
}

function formatCoordinate(value, axis) {
  const absolute = Math.abs(value).toFixed(3).padStart(6, "0");
  const hemisphere = axis === "lat"
    ? (value >= 0 ? "N" : "S")
    : (value >= 0 ? "E" : "W");
  return `${absolute}° ${hemisphere}`;
}

function normalizeLongitude(longitude) {
  return THREE.MathUtils.euclideanModulo(longitude + 180, 360) - 180;
}

function locationVector(latitude, longitude, radius = 1) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(normalizeLongitude(longitude));
  return new THREE.Vector3(
    -Math.cos(lat) * Math.sin(lon),
    Math.sin(lat),
    Math.cos(lat) * Math.cos(lon),
  ).multiplyScalar(radius);
}

function locationFromPoint(point) {
  const direction = point.clone().normalize();
  return {
    lat: THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1))),
    lon: normalizeLongitude(THREE.MathUtils.radToDeg(Math.atan2(-direction.x, direction.z))),
  };
}

function directionFromAzimuthElevation(latitude, longitude, azimuth, elevation) {
  const lat = THREE.MathUtils.degToRad(latitude);
  const lon = THREE.MathUtils.degToRad(normalizeLongitude(longitude));
  const az = THREE.MathUtils.degToRad(azimuth);
  const el = THREE.MathUtils.degToRad(elevation);
  const up = locationVector(latitude, longitude);
  const north = new THREE.Vector3(Math.sin(lat) * Math.sin(lon), Math.cos(lat), -Math.sin(lat) * Math.cos(lon));
  const east = new THREE.Vector3(-Math.cos(lon), 0, -Math.sin(lon));
  return up.multiplyScalar(Math.sin(el))
    .addScaledVector(north, Math.cos(el) * Math.cos(az))
    .addScaledVector(east, Math.cos(el) * Math.sin(az))
    .normalize();
}

function updateSunVector() {
  moonGroup.updateMatrixWorld(true);
  const site = sites.find((item) => item.id === activeSiteId) ?? sites[0];
  if (ephemerisData?.site?.latitude === site.lat && ephemerisData?.site?.longitude === site.lon) {
    sunAzimuth = ephemerisData.sun.atStart.azimuth;
    sunElevation = ephemerisData.sun.atStart.elevation;
    earthAzimuth = ephemerisData.earth.atStart.azimuth;
    earthElevation = ephemerisData.earth.atStart.elevation;
    lightDirection.copy(directionFromAzimuthElevation(site.lat, site.lon, sunAzimuth, sunElevation))
      .transformDirection(moonGroup.matrixWorld);
    earthDirection.copy(directionFromAzimuthElevation(site.lat, site.lon, earthAzimuth, earthElevation))
      .transformDirection(moonGroup.matrixWorld);
  } else {
    lightDirection.copy(directionFromAzimuthElevation(site.lat, site.lon, sunAzimuth, sunElevation))
      .transformDirection(moonGroup.matrixWorld);
    if (!ephemerisData) earthDirection.copy(locationVector(0, 0)).transformDirection(moonGroup.matrixWorld);
  }
  directionalLight.position.copy(lightDirection).multiplyScalar(5);
  directionalLight.target.position.set(0, 0, 0);
  directionalLight.target.updateMatrixWorld();
  $("#sun-azimuth-value").textContent = `${String(Math.round(sunAzimuth)).padStart(3, "0")}°`;
  $("#sun-elevation-value").textContent = `${sunElevation.toFixed(1).padStart(4, "0")}°`;
  $("#elevation-readout").textContent = `${sunElevation.toFixed(1).padStart(4, "0")}°`;
  $("#sun-azimuth").value = String(Math.round(sunAzimuth));
  $("#sun-elevation").value = String(THREE.MathUtils.clamp(sunElevation, 0, 90));
  $("#elevation-marker").style.bottom = `${(THREE.MathUtils.clamp(sunElevation, 0, 90) / 90) * 100}%`;
  $("#mode-label").textContent = ephemerisData ? "JPL HORIZONS" : "SIMULACIÓN";
  $("#mode-subtitle").textContent = ephemerisData ? "EFEMÉRIDES JPL" : "SIMULACIÓN LOCAL";
  if (hoveredPoint) {
    updateHoverReadout(hoveredPoint, lastPointer.x, lastPointer.y);
  } else if (activeSiteId) {
    const site = sites.find((item) => item.id === activeSiteId);
    if (site) updateMissionDetail(site);
  }
}

function getSurfaceMetrics(point, normal) {
  const sunDot = normal.dot(lightDirection);
  let lit = sunDot > 0;
  if (lit) {
    sunRaycaster.set(point.clone().addScaledVector(normal, 0.002), lightDirection);
    const obstruction = sunRaycaster.intersectObject(moon, false).find((hit) => hit.distance > 0.004);
    if (obstruction) lit = false;
  }

  if (!ephemerisData) earthDirection.copy(locationVector(0, 0)).transformDirection(moonGroup.matrixWorld);
  const earthVisible = normal.dot(earthDirection) > 0;
  if (earthVisible) {
    sunRaycaster.set(point.clone().addScaledVector(normal, 0.002), earthDirection);
    const obstruction = sunRaycaster.intersectObject(moon, false).find((hit) => hit.distance > 0.004);
    if (obstruction) return { illumination: lit ? Math.max(0, sunDot) * 100 : 0, earthVisible: false };
  }
  return { illumination: lit ? Math.max(0, sunDot) * 100 : 0, earthVisible };
}

function formatAzimuth(value) {
  return `${String(Math.round(value)).padStart(3, "0")}°`;
}

function formatElevation(value) {
  return `${value.toFixed(1)}°`;
}

function visibleHours(samples) {
  let hours = 0;
  for (let index = 0; index < samples.length - 1; index += 1) {
    const first = samples[index].elevation;
    const second = samples[index + 1].elevation;
    if (first > 0 && second > 0) hours += 1;
    else if ((first > 0) !== (second > 0)) {
      const crossing = Math.abs(first) / (Math.abs(first) + Math.abs(second));
      hours += first > 0 ? crossing : 1 - crossing;
    }
  }
  return hours;
}

function renderWindowTimeline(samples, trackId, durationId, colorClass) {
  const track = $(`#${trackId}`);
  track.replaceChildren();
  for (const sample of samples.slice(0, -1)) {
    const segment = document.createElement("span");
    segment.className = `window-segment${sample.aboveHorizon ? ` ${colorClass}` : ""}`;
    segment.title = `${new Date(sample.time).toISOString().slice(11, 16)} UTC · elevación ${formatElevation(sample.elevation)}`;
    segment.setAttribute("aria-label", segment.title);
    track.append(segment);
  }
  $(`#${durationId}`).textContent = `${visibleHours(samples).toFixed(1)} h`;
}

function clearWindowTimeline() {
  $("#window-period").textContent = "—";
  $("#sun-timeline").replaceChildren();
  $("#earth-timeline").replaceChildren();
  $("#sun-duration").textContent = "—";
  $("#earth-duration").textContent = "—";
}

function setEphemerisStatus(message, state = "idle") {
  const status = $("#ephemeris-status");
  status.dataset.state = state;
  $("#ephemeris-status-text").textContent = message;
}

function updateEphemerisUI(data) {
  const start = new Date(data.start);
  const end = new Date(data.stop);
  const dateOptions = { day: "2-digit", month: "short", timeZone: "UTC" };
  const startLabel = `${start.toLocaleDateString("es-ES", dateOptions)} ${start.toISOString().slice(11, 16)}`;
  const endLabel = `${end.toLocaleDateString("es-ES", dateOptions)} ${end.toISOString().slice(11, 16)}`;
  $("#window-period").textContent = `${startLabel} — ${endLabel} UTC`;
  renderWindowTimeline(data.sun.samples, "sun-timeline", "sun-duration", "sun-visible");
  renderWindowTimeline(data.earth.samples, "earth-timeline", "earth-duration", "earth-visible");
}

async function requestEphemeris(site) {
  const requestId = ++ephemerisRequest;
  const date = $("#analysis-date").value;
  const time = $("#analysis-time").value;
  const button = $("#analyze-button");
  if (!date || !time) {
    setEphemerisStatus("Indica una fecha y una hora UTC válidas.", "error");
    return;
  }

  button.disabled = true;
  button.classList.add("loading");
  ephemerisData = null;
  clearWindowTimeline();
  updateSunVector();
  setEphemerisStatus(`Consultando JPL Horizons · ${site.name}…`, "loading");
  const params = new URLSearchParams({
    lat: String(site.lat),
    lon: String(normalizeLongitude(site.lon)),
    date,
    time,
  });

  try {
    const response = await fetch(`/api/ephemeris?${params}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `Error HTTP ${response.status}`);
    if (requestId !== ephemerisRequest) return;
    ephemerisData = payload;
    updateSunVector();
    updateEphemerisUI(payload);
    const siteLabel = site.name;
    setEphemerisStatus(`JPL Horizons · ${siteLabel} · posiciones aparentes`, "success");
  } catch (error) {
    if (requestId !== ephemerisRequest) return;
    console.error("No se pudieron cargar las efemérides:", error);
    ephemerisData = null;
    updateSunVector();
    clearWindowTimeline();
    setEphemerisStatus(`No se pudo consultar JPL Horizons: ${error.message}`, "error");
  } finally {
    if (requestId === ephemerisRequest) {
      button.disabled = false;
      button.classList.remove("loading");
    }
  }
}

function updateLatitudeGauge(latitude) {
  const clamped = THREE.MathUtils.clamp(latitude, -90, 90);
  $("#latitude-marker").style.top = `${((90 - clamped) / 180) * 100}%`;
  $("#latitude-readout").textContent = `${Math.abs(clamped).toFixed(1).padStart(4, "0")}°${clamped >= 0 ? "N" : "S"}`;
}

function updateCoordinateCard(point, normal, coordinates = locationFromPoint(moonGroup.worldToLocal(point.clone()))) {
  const metrics = getSurfaceMetrics(point, normal);
  $("#coord-lat").textContent = formatCoordinate(coordinates.lat, "lat");
  $("#coord-lon").textContent = formatCoordinate(coordinates.lon, "lon");
  $("#coord-light").textContent = `${Math.round(metrics.illumination)}%`;
  $("#coord-los").textContent = metrics.earthVisible ? "VISTA" : "BLOQUEADA";
  $("#coord-los").style.color = metrics.earthVisible ? "var(--green)" : "var(--red)";
  $(".panel-footnote").textContent = ephemerisData
    ? "Horizons JPL · análisis topocéntrico"
    : "Simulación geométrica · sin efemérides";
  updateLatitudeGauge(coordinates.lat);
}

function setDefaultReadout() {
  $("#coord-lat").textContent = "—";
  $("#coord-lon").textContent = "—";
  $("#coord-light").textContent = "—";
  $("#coord-los").textContent = "—";
  $("#coord-los").style.color = "";
  $(".panel-footnote").textContent = "Simulación geométrica · sin efemérides";
  updateLatitudeGauge(-90);
}

function updateHoverReadout(hit, x, y) {
  const localPoint = moonGroup.worldToLocal(hit.point.clone());
  const coordinates = locationFromPoint(localPoint);
  const normal = hit.face.normal.clone().applyMatrix3(
    new THREE.Matrix3().getNormalMatrix(moon.matrixWorld),
  ).normalize();
  const metrics = getSurfaceMetrics(hit.point, normal);
  $("#hover-lat").textContent = formatCoordinate(coordinates.lat, "lat");
  $("#hover-lon").textContent = formatCoordinate(coordinates.lon, "lon");
  $("#hover-light").textContent = `LUZ ${Math.round(metrics.illumination)}%`;
  $("#hover-los").textContent = metrics.earthVisible ? "LOS VISTA" : "LOS BLOQUEADA";
  tooltip.style.left = `${Math.min(x + 16, window.innerWidth - 205)}px`;
  tooltip.style.top = `${Math.min(y + 16, window.innerHeight - 92)}px`;
  tooltip.classList.add("visible");
  updateCoordinateCard(hit.point, normal, coordinates);
}

function updateMissionDetail(site) {
  activeSiteId = site.id;
  document.querySelectorAll(".mission-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.siteId === site.id);
  });
  const { point: worldPoint, normal } = getSiteSurface(site);
  const metrics = getSurfaceMetrics(worldPoint, normal);
  const elevation = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(normal.dot(lightDirection), -1, 1)));
  const liveSite = ephemerisData
    && Math.abs(ephemerisData.site.latitude - site.lat) < 1e-6
    && Math.abs(ephemerisData.site.longitude - normalizeLongitude(site.lon)) < 1e-6;
  const sun = liveSite ? ephemerisData.sun.atStart : { azimuth: sunAzimuth, elevation };
  const earth = liveSite ? ephemerisData.earth.atStart : null;
  $("#mission-detail").innerHTML = `
    <div class="detail-content">
      <div class="detail-top">
        <div><h2>${site.name}</h2><div class="detail-type">${site.label}</div></div>
        <div class="detail-coordinates">${formatCoordinate(site.lat, "lat")}<br>${formatCoordinate(normalizeLongitude(site.lon), "lon")}</div>
      </div>
      <div class="detail-grid">
        <div class="detail-metric"><span>SOL · AZ / EL</span><strong>${formatAzimuth(sun.azimuth)} / ${formatElevation(sun.elevation)}</strong></div>
        <div class="detail-metric"><span>POTENCIAL SOLAR</span><strong>${Math.round(metrics.illumination)}%</strong></div>
        <div class="detail-metric"><span>TIERRA · AZ / EL</span><strong>${earth ? `${formatAzimuth(earth.azimuth)} / ${formatElevation(earth.elevation)}` : "SIMULACIÓN"}</strong></div>
        <div class="detail-metric"><span>ENLACE GEOMÉTRICO</span><strong class="${metrics.earthVisible ? "metric-good" : "metric-bad"}">${metrics.earthVisible ? "EN VISTA" : "BAJO HORIZONTE"}</strong></div>
      </div>
      <div class="detail-note">${liveSite ? "Posiciones aparentes para la hora indicada · el relieve local puede bloquear el enlace." : "Estimación de escena · consulta JPL Horizons para efemérides del sitio y la fecha."}</div>
    </div>`;
  updateCoordinateCard(worldPoint, normal, { lat: site.lat, lon: normalizeLongitude(site.lon) });
}

function getSiteSurface(site) {
  moonGroup.updateMatrixWorld(true);
  const localDirection = locationVector(site.lat, site.lon).normalize();
  const worldDirection = localDirection.clone().transformDirection(moonGroup.matrixWorld);
  pointerRaycaster.set(worldDirection.clone().multiplyScalar(2), worldDirection.clone().negate());
  const hit = pointerRaycaster.intersectObject(moon, false)[0];
  if (!hit) {
    const point = moonGroup.localToWorld(localDirection.clone());
    return { point, normal: worldDirection };
  }
  const normal = hit.face.normal.clone().applyMatrix3(
    new THREE.Matrix3().getNormalMatrix(moon.matrixWorld),
  ).normalize();
  return { point: hit.point, normal };
}

function selectSite(site, focus = true) {
  const changedSite = activeSiteId !== site.id;
  if (focus) {
    const localDirection = locationVector(site.lat, site.lon).normalize();
    const cameraDirection = camera.position.clone().sub(controls.target).normalize();
    moonGroup.quaternion.setFromUnitVectors(localDirection, cameraDirection);
    moonGroup.updateMatrixWorld(true);
  }
  activeSiteId = site.id;
  hoveredPoint = null;
  tooltip.classList.remove("visible");
  if (changedSite) {
    ephemerisData = null;
    clearWindowTimeline();
  }
  updateSunVector();
  if (changedSite) requestEphemeris(site);
}

function createMissionList() {
  $("#site-count").textContent = String(sites.length).padStart(2, "0");
  const list = $("#mission-list");
  for (const site of sites) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "mission-item";
    item.dataset.siteId = site.id;
    item.dataset.kind = site.kind;
    item.innerHTML = `<span class="pin-symbol">⌖</span><span><span class="mission-name">${site.name}</span><span class="mission-type">${site.label}</span></span><span class="mission-coord">${Math.abs(site.lat).toFixed(1)}°${site.lat < 0 ? "S" : "N"}</span>`;
    item.addEventListener("click", () => selectSite(site));
    list.append(item);
  }
}

function createPins() {
  const pinGeometry = new THREE.SphereGeometry(0.012, 12, 10);
  for (const site of sites) {
    const material = new THREE.MeshBasicMaterial({
      color: site.kind === "apollo" ? 0xf2bf6a : 0x73d8df,
      depthTest: true,
    });
    const pin = new THREE.Mesh(pinGeometry, material);
    pin.position.copy(locationVector(site.lat, site.lon, 1.035));
    pin.userData.site = site;
    moonGroup.add(pin);
    markerMeshes.push(pin);
  }
}

function createCompass() {
  const tape = $("#compass-tape");
  const directions = new Map([
    [0, "N"], [90, "E"], [180, "S"], [270, "W"],
  ]);
  tape.replaceChildren();
  for (let offset = -6; offset <= 6; offset += 1) {
    const mark = document.createElement("div");
    const value = THREE.MathUtils.euclideanModulo(Math.round((getCameraAzimuth() + offset * 10) / 10) * 10, 360);
    const major = value % 30 === 0;
    const cardinal = directions.has(value);
    mark.className = `compass-mark${major ? " major" : ""}${cardinal ? " cardinal" : ""}`;
    mark.style.left = `calc(50% + ${offset * 25}px)`;
    if (major) {
      const label = document.createElement("span");
      label.textContent = directions.get(value) ?? String(value).padStart(3, "0");
      mark.append(label);
    }
    tape.append(mark);
  }
}

function getCameraAzimuth() {
  const direction = camera.position.clone().sub(controls.target);
  return THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(Math.atan2(direction.x, direction.z)), 360);
}

function updateCompass() {
  const azimuth = getCameraAzimuth();
  $("#heading-readout").textContent = `${String(Math.round(azimuth)).padStart(3, "0")}°`;
  createCompass();
}

function createTerrainGeometry(heightImage) {
  const canvas = document.createElement("canvas");
  canvas.width = heightImage.naturalWidth;
  canvas.height = heightImage.naturalHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No se pudo preparar el mapa de relieve.");
  context.drawImage(heightImage, 0, 0);
  const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
  const geometry = new THREE.SphereGeometry(1, 256, 192);
  const positions = geometry.getAttribute("position");
  const uvs = geometry.getAttribute("uv");
  const displacementScale = 0.018;
  const poleMean = (row) => {
    let sum = 0;
    for (let x = 0; x < width; x += 1) sum += data[(row * width + x) * 4] / 255;
    return sum / width;
  };
  const northPoleHeight = poleMean(0);
  const southPoleHeight = poleMean(height - 1);

  // Bake elevation into the mesh so rendered shadows and ray hits follow the terrain.
  for (let index = 0; index < positions.count; index += 1) {
    const u = THREE.MathUtils.clamp(uvs.getX(index), 0, 1);
    const v = THREE.MathUtils.clamp(uvs.getY(index), 0, 1);
    const baseY = positions.getY(index);
    const px = Math.min(width - 1, Math.floor(u * (width - 1)));
    const py = Math.min(height - 1, Math.floor((1 - v) * (height - 1)));
    const brightness = baseY > 0.9999
      ? northPoleHeight
      : baseY < -0.9999
        ? southPoleHeight
        : data[(py * width + px) * 4] / 255;
    const radius = 1 + (brightness - 0.5) * displacementScale;
    tempVector.fromBufferAttribute(positions, index).normalize().multiplyScalar(radius);
    positions.setXYZ(index, tempVector.x, tempVector.y, tempVector.z);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function loadImage(path) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar el recurso local: ${path}`));
    image.src = path;
  });
}

function createRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  viewport.append(renderer.domElement);
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);
  renderer.domElement.addEventListener("click", onClick);
}

function createScene() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070b10);
  camera = new THREE.PerspectiveCamera(36, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 0, 3.35);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.minDistance = 1.3;
  controls.maxDistance = 5.2;
  controls.rotateSpeed = 0.48;

  moonGroup = new THREE.Group();
  moonGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  scene.add(moonGroup);
  scene.add(new THREE.AmbientLight(0x9caab5, 0.16));
  const fillLight = new THREE.HemisphereLight(0x8497a4, 0x0a0d11, 0.23);
  scene.add(fillLight);
  directionalLight = new THREE.DirectionalLight(0xfff0d7, 3.2);
  directionalLight.castShadow = true;
  directionalLight.shadow.mapSize.set(2048, 2048);
  directionalLight.shadow.camera.near = 0.1;
  directionalLight.shadow.camera.far = 10;
  directionalLight.shadow.camera.left = -1.5;
  directionalLight.shadow.camera.right = 1.5;
  directionalLight.shadow.camera.top = 1.5;
  directionalLight.shadow.camera.bottom = -1.5;
  directionalLight.shadow.bias = -0.0002;
  directionalLight.shadow.normalBias = 0.008;
  directionalLight.shadow.radius = 3;
  scene.add(directionalLight);
  scene.add(directionalLight.target);

  controls.addEventListener("change", updateCompass);
  controls.addEventListener("end", () => {
    if (pointerInside) updatePointerHit();
  });
  updateCompass();
}

function addStars() {
  const positions = [];
  for (let index = 0; index < 550; index += 1) {
    const theta = Math.random() * Math.PI * 2;
    const y = Math.random() * 2 - 1;
    const radius = 13 + Math.random() * 8;
    const horizontal = Math.sqrt(1 - y * y);
    positions.push(
      radius * horizontal * Math.cos(theta),
      radius * y,
      radius * horizontal * Math.sin(theta),
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  scene.add(new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x94b6c3, size: 0.035, transparent: true, opacity: 0.55, sizeAttenuation: true })));
}

function onPointerMove(event) {
  lastPointer = { x: event.clientX, y: event.clientY };
  pointerInside = true;
  if (!hoverFrame) {
    hoverFrame = requestAnimationFrame(() => {
      hoverFrame = 0;
      updatePointerHit();
    });
  }
}

function onPointerLeave() {
  pointerInside = false;
  hoveredPoint = null;
  tooltip.classList.remove("visible");
  if (activeSiteId) {
    const site = sites.find((item) => item.id === activeSiteId);
    if (site) updateMissionDetail(site);
  } else {
    setDefaultReadout();
  }
}

function updatePointerHit() {
  if (!pointerInside || !moon) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((lastPointer.x - rect.left) / rect.width) * 2 - 1,
    -((lastPointer.y - rect.top) / rect.height) * 2 + 1,
  );
  pointerRaycaster.setFromCamera(pointer, camera);
  const hits = pointerRaycaster.intersectObjects([moon, ...markerMeshes], false);
  const hit = hits[0];
  if (!hit) {
    hoveredPoint = null;
    tooltip.classList.remove("visible");
    return;
  }
  if (hit.object.userData.site) {
    const site = hit.object.userData.site;
    const { point, normal } = getSiteSurface(site);
    const coordinates = { lat: site.lat, lon: normalizeLongitude(site.lon) };
    const metrics = getSurfaceMetrics(point, normal);
    $("#hover-lat").textContent = formatCoordinate(coordinates.lat, "lat");
    $("#hover-lon").textContent = formatCoordinate(coordinates.lon, "lon");
    $("#hover-light").textContent = `LUZ ${Math.round(metrics.illumination)}%`;
    $("#hover-los").textContent = metrics.earthVisible ? "LOS VISTA" : "LOS BLOQUEADA";
    tooltip.style.left = `${Math.min(lastPointer.x + 16, window.innerWidth - 205)}px`;
    tooltip.style.top = `${Math.min(lastPointer.y + 16, window.innerHeight - 92)}px`;
    tooltip.classList.add("visible");
    updateCoordinateCard(point, normal, coordinates);
    hoveredPoint = null;
    return;
  }
  hoveredPoint = hit;
  updateHoverReadout(hit, lastPointer.x, lastPointer.y);
}

function onClick(event) {
  if (!moon) return;
  lastPointer = { x: event.clientX, y: event.clientY };
  pointerInside = true;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.set(
    ((lastPointer.x - rect.left) / rect.width) * 2 - 1,
    -((lastPointer.y - rect.top) / rect.height) * 2 + 1,
  );
  pointerRaycaster.setFromCamera(pointer, camera);
  const hit = pointerRaycaster.intersectObjects([moon, ...markerMeshes], false)[0];
  if (hit?.object.userData.site) selectSite(hit.object.userData.site);
}

function onResize() {
  if (!renderer || !camera) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  updateCompass();
}

function updateClock() {
  clockLabel.textContent = `${new Date().toISOString().slice(11, 19)} UTC`;
}

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
  frame += 1;
  if (frame % 120 === 0) updateClock();
}

async function initialize() {
  try {
    createRenderer();
    createScene();
    addStars();
    createMissionList();
    const [albedoImage, heightImage] = await Promise.all([
      loadImage("./lroc_color_4k.jpg"),
      loadImage("./ldem_3_8bit.jpg"),
    ]);

    const albedo = new THREE.Texture(albedoImage);
    albedo.colorSpace = THREE.SRGBColorSpace;
    albedo.anisotropy = renderer.capabilities.getMaxAnisotropy();
    albedo.needsUpdate = true;
    const heightMap = new THREE.Texture(heightImage);
    heightMap.anisotropy = renderer.capabilities.getMaxAnisotropy();
    heightMap.needsUpdate = true;

    const geometry = createTerrainGeometry(heightImage);
    const material = new THREE.MeshStandardMaterial({
      map: albedo,
      bumpMap: heightMap,
      bumpScale: 0.006,
      roughness: 0.93,
      metalness: 0,
    });
    moon = new THREE.Mesh(geometry, material);
    moon.castShadow = true;
    moon.receiveShadow = true;
    moonGroup.add(moon);
    createPins();
    const now = new Date();
    $("#analysis-date").value = now.toISOString().slice(0, 10);
    $("#analysis-time").value = now.toISOString().slice(11, 16);
    updateSunVector();
    $("#loading-status").classList.add("hidden");
    setDefaultReadout();
    updateClock();
    animate();
    selectSite(sites[0], false);
  } catch (error) {
    console.error(error);
    showError(`${error.message} Comprueba que la app se sirve desde una carpeta local y que los archivos de imagen están junto a index.html.`);
  }
}

function switchToSimulation() {
  const requestInProgress = $("#analyze-button").disabled;
  if (!ephemerisData && !requestInProgress) return;
  ephemerisRequest += 1;
  ephemerisData = null;
  $("#analyze-button").disabled = false;
  $("#analyze-button").classList.remove("loading");
  clearWindowTimeline();
  setEphemerisStatus("Simulación manual · calcula de nuevo para volver a JPL Horizons", "idle");
}

$("#sun-azimuth").addEventListener("input", (event) => {
  switchToSimulation();
  sunAzimuth = Number(event.currentTarget.value);
  updateSunVector();
});
$("#sun-elevation").addEventListener("input", (event) => {
  switchToSimulation();
  sunElevation = Number(event.currentTarget.value);
  updateSunVector();
});
$("#ephemeris-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const site = sites.find((item) => item.id === activeSiteId);
  if (site) requestEphemeris(site);
});
$("#reset-view").addEventListener("click", () => {
  controls.reset();
  moonGroup.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1));
  controls.target.set(0, 0, 0);
  camera.position.set(0, 0, 3.35);
  controls.update();
  activeSiteId = null;
  ephemerisRequest += 1;
  ephemerisData = null;
  $("#analyze-button").disabled = false;
  $("#analyze-button").classList.remove("loading");
  clearWindowTimeline();
  setEphemerisStatus("Selecciona un sitio para consultar JPL Horizons", "idle");
  document.querySelectorAll(".mission-item").forEach((button) => button.classList.remove("active"));
  $("#mission-detail").innerHTML = '<div class="detail-empty"><span>⌖</span><div>SELECCIONA UN SITIO<br />PARA VER SU ANÁLISIS</div></div>';
  updateSunVector();
  setDefaultReadout();
});
window.addEventListener("resize", onResize);
initialize();
