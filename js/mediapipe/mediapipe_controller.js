import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.181.1/build/three.module.js";
// Arranca un filtro facial: camara + MediaPipe + escena JSON del editor de three.js.
//
// Uso en una pagina HTML:
//   import { startFaceFilter } from "./js/mediapipe/mediapipe_controller.js";
//   startFaceFilter("app.json");
//
// Como se usa la escena:
//   - El objeto llamado "mesh_0" es la mascara: se deforma con la cara.
//   - Todo lo demas (gafas, esferas, luces, ...) sigue la posicion, el giro y el
//     tamaño de la cabeza (ver js/mediapipe/face_mask.js para las unidades).
//   - Los scripts de la escena reciben los eventos faciales (ver js/app.js).

import GUI from "https://cdn.jsdelivr.net/npm/lil-gui@0.20.0/+esm";

import WebCamera from "../webcamera.js";
import ThreePlayer from "../app.js";
import MPFaceTracker from "./mp_face_tracker.js";
import MPFaceRenderer from "./mp_face_renderer.js";
import ThreeFaceRenderer from "./three_face_renderer.js";
import FaceEvents from "./face_events.js";
import MouthDrums from "./mouth_drums.js";

const MASK_NAME = "Mascara folklorica";

export async function startFaceFilter(scenePath, { showGui = true } = {}) {

    const app = document.getElementById("app");
    const video = document.getElementById("video-renderer");
    const canvas = document.getElementById("canvas-renderer");

    // Camara y seguimiento de la cara
    const webCamera = new WebCamera(video);
    await webCamera.startCamera();

    const tracker = new MPFaceTracker(video);
    await tracker.init();

    const faceEvents = new FaceEvents();

    // El redoble se dispara una sola vez al detectar la transición boca cerrada -> abierta.
    // El navegador exige un gesto del usuario para habilitar el audio: primer clic/toque.
    const mouthDrums = new MouthDrums();
    faceEvents.addListener((type) => {
        if (type === "mouthOpen") mouthDrums.play();
    });

    // Ayudas 2D de MediaPipe (malla, puntos, contornos) sobre el video
    const mpRenderer = new MPFaceRenderer(video, canvas);

    // Escena 3D del editor
    const player = new ThreePlayer(app);
    player.face = faceEvents;
    faceEvents.addListener((type, face) => player.dispatch(type, face));
    await player.loadProject(scenePath);

    const faceRenderer = new ThreeFaceRenderer(video, player);
    faceRenderer.alignCamera();

    // La mascara folklorica es un grupo con dos mallas (pieza superior e inferior).
    // Se conserva dentro de la escena para respetar sus materiales y transformaciones.
    // El RootNode completo se ancla al centro de los ojos y sigue la pose de MediaPipe.
    const mask = player.rootNode.getObjectByName(MASK_NAME);
    if (mask) {
        // Correccion de materiales: MeshBasicMaterial conserva las texturas,
        // pero evita que una iluminacion insuficiente vuelva negra toda la mascara.
        const correctedMaterials = new Map();
        mask.traverse((object) => {
            if (!object.isMesh || !object.material) return;
            const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
            const outputMaterials = sourceMaterials.map((source) => {
                if (correctedMaterials.has(source)) return correctedMaterials.get(source);

                const color = source.color?.clone?.() || new THREE.Color(0xffffff);
                if (source.map) {
                    // La textura contiene el color del diseño: blanco evita oscurecerla por multiplicacion.
                    color.set(0xffffff);
                } else {
                    const hsl = {};
                    color.getHSL(hsl);
                    color.setHSL(hsl.h, Math.min(1, hsl.s * 1.12), Math.min(0.98, hsl.l * 1.28 + 0.08));
                }

                const material = new THREE.MeshBasicMaterial({
                    color,
                    map: source.map || null,
                    alphaMap: source.alphaMap || null,
                    transparent: source.transparent,
                    opacity: source.opacity,
                    alphaTest: source.alphaTest,
                    side: source.side,
                    vertexColors: source.vertexColors,
                    wireframe: source.wireframe,
                    depthWrite: source.depthWrite,
                    toneMapped: false
                });
                material.name = source.name || "Mascara_ColorCorregido";
                correctedMaterials.set(source, material);
                return material;
            });

            object.material = Array.isArray(object.material) ? outputMaterials : outputMaterials[0];
        });

        // Calibracion inicial de los huecos oculares del modelo respecto al punto medio
        // entre los landmarks 33 y 263. No cambia el nombre ni la estructura de app.json.
        mask.position.x += 0.012;
        mask.position.y -= 0.106;
    } else {
        console.warn(`No se encontro el grupo "${MASK_NAME}" dentro de app.json.`);
    }

    const settings = { headScale: 1 };

    function update() {

        tracker.update();
        faceEvents.update(tracker);

        const landmarks = tracker.getLandmarks();

        mpRenderer.drawMesh(landmarks);
        mpRenderer.drawPoints(landmarks);
        mpRenderer.drawIrises(landmarks);
        mpRenderer.drawContours(landmarks);

        faceRenderer.drawMesh(landmarks);
        faceRenderer.drawConnectors(landmarks);
        faceRenderer.drawContours(landmarks);
        faceRenderer.drawIrises(landmarks);
        faceRenderer.drawPoints(landmarks);
        if (mask) faceRenderer.syncMaskDeformation(mask, faceEvents);
        faceRenderer.syncMouthOpening(landmarks, faceEvents.jawOpen);

        // La escena sigue la cabeza (solo se oculta la mascara si no hay cara).
        const detected = tracker.getFaceCount() > 0;
        player.rootNode.visible = detected;
        if (mask) mask.visible = detected;

        const pose = detected ? faceRenderer.getHeadPose() : null;
        if (pose) {
            player.rootNode.position.copy(pose.position);
            player.rootNode.quaternion.copy(pose.quaternion);
            player.rootNode.scale.setScalar(pose.scale * settings.headScale);
        }

        player.update();
        requestAnimationFrame(update);

    }

    window.addEventListener("resize", () => {
        mpRenderer.resize();
        player.resize();
        faceRenderer.alignCamera();
    });

    if (showGui) createGui(settings, mpRenderer, faceRenderer);

    update();

    // Para depurar desde la consola del navegador.
    const filter = { webCamera, tracker, faceEvents, mpRenderer, player, faceRenderer, mask, mouthDrums };
    window.faceFilter = filter;
    return filter;

}

function createGui(settings, mpRenderer, faceRenderer) {

    const gui = new GUI({ title: "Controles" });
    gui.close();

    const helpers2D = gui.addFolder("Ayudas 2D (MediaPipe)");
    helpers2D.add(mpRenderer, "showHelpers").name("Mostrar");
    helpers2D.add(mpRenderer, "showMesh").name("Malla");
    helpers2D.add(mpRenderer, "showPoints").name("Puntos");
    helpers2D.add(mpRenderer, "showContours").name("Contornos");
    helpers2D.add(mpRenderer, "showIrises").name("Iris");

    const helpers3D = gui.addFolder("Ayudas 3D (three.js)");
    helpers3D.add(faceRenderer, "showHelpers").name("Mostrar");
    helpers3D.add(faceRenderer, "showMesh").name("Malla");
    helpers3D.add(faceRenderer, "showConnectors").name("Conexiones");
    helpers3D.add(faceRenderer, "showPoints").name("Puntos");
    helpers3D.add(faceRenderer, "showContours").name("Contornos");
    helpers3D.add(faceRenderer, "showIrises").name("Iris");

    const scene = gui.addFolder("Escena");
    scene.add(settings, "headScale", 0.1, 5).name("Escala de la cabeza");
    scene.add(faceRenderer, "exportAndDownloadMesh").name("Exportar malla capturada (.glb)");

}
