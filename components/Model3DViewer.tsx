import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { USDZLoader } from 'three/examples/jsm/loaders/USDZLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Model3DViewerProps {
  url: string;
  kind: 'obj' | 'glb' | 'usdz' | 'ifc';
  className?: string;
  onError?: (info: { code: string; message: string }) => void;
}

const Model3DViewer: React.FC<Model3DViewerProps> = ({ url, kind, className = '', onError }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Group | THREE.Object3D | null>(null);
  const frameIdRef = useRef<number>(0);
  const loadIdRef = useRef<number>(0);
  const fitCameraRef = useRef<(() => void) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !url) return;

    const loadId = ++loadIdRef.current;
    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight || 320;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16181d);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 1000);
    camera.position.set(5, 5, 5);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x16181d, 1);
    container.insertBefore(renderer.domElement, container.firstChild);
    rendererRef.current = renderer;

    const pmremGen = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGen.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambient);
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x444460, 0.45);
    scene.add(hemisphere);
    const directional = new THREE.DirectionalLight(0xffffff, 0.6);
    directional.position.set(10, 10, 10);
    scene.add(directional);
    const fill = new THREE.DirectionalLight(0xffffff, 0.25);
    fill.position.set(-6, 4, -6);
    scene.add(fill);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    const sizeVec = new THREE.Vector3();
    const centerVec = new THREE.Vector3();

    function countRenderableGeometry(root: THREE.Object3D): number {
      let count = 0;
      root.traverse((child: THREE.Object3D) => {
        const geom = (child as THREE.Mesh).geometry;
        const pos = geom?.attributes?.position;
        if (pos && (pos as THREE.BufferAttribute).count > 0) count += 1;
      });
      return count;
    }

    function computeSafeWorldBox(root: THREE.Object3D): THREE.Box3 | null {
      const out = new THREE.Box3();
      let hasAny = false;
      root.updateWorldMatrix(true, true);
      root.traverse((child: THREE.Object3D) => {
        const geom = (child as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
        const pos = geom?.attributes?.position;
        if (!geom || !pos || (pos as THREE.BufferAttribute).count === 0) return;
        if (!geom.boundingBox) geom.computeBoundingBox();
        const bb = geom.boundingBox;
        if (!bb) return;
        const vals = [bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z];
        if (!vals.every(Number.isFinite)) return;
        const worldBB = bb.clone().applyMatrix4(child.matrixWorld);
        if (!hasAny) {
          out.copy(worldBB);
          hasAny = true;
        } else {
          out.union(worldBB);
        }
      });
      return hasAny ? out : null;
    }

    function frameWithBox(box: THREE.Box3): boolean {
      const size = box.getSize(sizeVec);
      const center = box.getCenter(centerVec);
      const maxDim = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(maxDim) || maxDim <= 0) return false;
      const fovRad = (camera.fov * Math.PI) / 180;
      let dist = (maxDim / 2) / Math.tan(fovRad / 2);
      dist *= 1.6;
      camera.near = Math.max(0.01, maxDim / 1000);
      camera.far = maxDim * 1000;
      camera.position.set(center.x + dist, center.y + dist * 0.3, center.z + dist);
      camera.updateProjectionMatrix();
      controls.target.copy(center);
      controls.update();
      return true;
    }

    function centerAndFrame(object: THREE.Object3D): boolean {
      let box = new THREE.Box3().setFromObject(object);
      if (box.isEmpty() || !box.getSize(sizeVec).toArray().every(Number.isFinite)) {
        const safe = computeSafeWorldBox(object);
        if (safe && !safe.isEmpty()) box = safe;
        else return false;
      }
      return frameWithBox(box);
    }

    fitCameraRef.current = () => {
      if (!meshRef.current || !cameraRef.current || !controlsRef.current) return;
      const ok = centerAndFrame(meshRef.current);
      if (ok) setError(null);
      else setError('Кадрування не вдалося — спробуйте обертати камеру.');
    };

    function applyDefaultMaterial(obj: THREE.Object3D) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          let mat: THREE.Material | THREE.Material[] | null = mesh.material;
          if (!mat || (Array.isArray(mat) && mat.length === 0)) {
            mesh.material = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, metalness: 0, roughness: 1 });
            return;
          }
          const mats = Array.isArray(mat) ? mat : [mat];
          for (const m of mats) {
            if (!m) continue;
            m.side = THREE.DoubleSide;
            if (m.map) {
              m.map.colorSpace = THREE.SRGBColorSpace;
              m.map.needsUpdate = true;
            }
            if (!m.map && 'metalness' in m) {
              (m as THREE.MeshStandardMaterial).metalness = 0;
              (m as THREE.MeshStandardMaterial).roughness = 1;
            }
          }
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material[0];
          }
        }
      });
    }

    setError(null);
    setLoading(true);

    const usdzUnsupportedMessage =
      'Цей USDZ містить USDC (crate) і не підтримується у веб-перегляді. Завантажте GLB або OBJ.';

    const onLoaded = (model: THREE.Object3D) => {
      if (loadIdRef.current !== loadId) return;
      const renderableCount = countRenderableGeometry(model);
      if (renderableCount === 0) {
        const msg = kind === 'usdz' ? usdzUnsupportedMessage : 'Модель не містить геометрії';
        setError(msg);
        setLoading(false);
        if (kind === 'usdz') {
          onError?.({ code: 'USDZ_CRATE_UNSUPPORTED', message: usdzUnsupportedMessage });
        } else {
          onError?.({ code: 'MODEL_LOAD_FAILED', message: msg });
        }
        return;
      }
      applyDefaultMaterial(model);
      scene.add(model);
      meshRef.current = model;
      if (!centerAndFrame(model)) {
        setError('Кадрування не вдалося — натисніть Fit камера.');
      } else {
        setError(null);
      }
      setLoading(false);
    };
    const onLoadError = (e: unknown) => {
      if (loadIdRef.current !== loadId) return;
      const errMsg = String((e as Error)?.message ?? e);
      const isUsdcCrate = /usdc|crate/i.test(errMsg);
      const msg = kind === 'usdz' || isUsdcCrate
        ? usdzUnsupportedMessage
        : 'Не вдалося завантажити модель. Закрийте та спробуйте ще раз.';
      setError(msg);
      setLoading(false);
      if (kind === 'usdz' || isUsdcCrate) {
        onError?.({ code: 'USDZ_CRATE_UNSUPPORTED', message: usdzUnsupportedMessage });
      } else {
        onError?.({ code: 'MODEL_LOAD_FAILED', message: msg });
      }
      console.error(e);
    };

    if (kind === 'glb') {
      const loader = new GLTFLoader();
      loader.load(url, (gltf) => onLoaded(gltf.scene), undefined, onLoadError);
    } else if (kind === 'usdz') {
      const loader = new USDZLoader();
      loader.loadAsync(url).then((group) => onLoaded(group)).catch(onLoadError);
    } else if (kind === 'ifc') {
      (async () => {
        try {
          const { IfcAPI } = await import('web-ifc');
          const ifcApi = new IfcAPI();
          ifcApi.SetWasmPath('/web-ifc/');
          await ifcApi.Init();
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const modelID = ifcApi.OpenModel(new Uint8Array(buffer));
          if (modelID === -1) throw new Error('IFC open failed');
          const flatMeshes = ifcApi.LoadAllGeometry(modelID);
          const group = new THREE.Group();
          for (let i = 0; i < flatMeshes.size(); i++) {
            const flatMesh = flatMeshes.get(i);
            for (let g = 0; g < flatMesh.geometries.size(); g++) {
              const placed = flatMesh.geometries.get(g);
              const geom = ifcApi.GetGeometry(modelID, placed.geometryExpressID);
              if (!geom) continue;
              const vPtr = geom.GetVertexData();
              const vSize = geom.GetVertexDataSize();
              const iPtr = geom.GetIndexData();
              const iSize = geom.GetIndexDataSize();
              const vertexFloats = ifcApi.GetVertexArray(vPtr, vSize);
              const indices = ifcApi.GetIndexArray(iPtr, iSize);
              geom.delete();
              if (vertexFloats.length < 3 || indices.length < 3) continue;
              const isInterleaved = vertexFloats.length % 6 === 0 && vertexFloats.length / 6 >= indices.length / 3;
              const positionArray = isInterleaved
                ? new Float32Array((vertexFloats.length / 6) * 3)
                : vertexFloats;
              if (isInterleaved) {
                for (let vi = 0; vi < vertexFloats.length / 6; vi++) {
                  positionArray[vi * 3] = vertexFloats[vi * 6];
                  positionArray[vi * 3 + 1] = vertexFloats[vi * 6 + 1];
                  positionArray[vi * 3 + 2] = vertexFloats[vi * 6 + 2];
                }
              }
              const position = new THREE.BufferAttribute(positionArray, 3);
              const geometry = new THREE.BufferGeometry();
              geometry.setAttribute('position', position);
              geometry.setIndex(new THREE.BufferAttribute(indices, 1));
              geometry.computeVertexNormals();
              const material = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, side: THREE.DoubleSide });
              const mesh = new THREE.Mesh(geometry, material);
              if (placed.flatTransformation && placed.flatTransformation.length >= 16) {
                mesh.matrix.fromArray(placed.flatTransformation);
                mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);
              }
              group.add(mesh);
            }
            flatMesh.delete();
          }
          ifcApi.CloseModel(modelID);
          onLoaded(group);
        } catch (e) {
          onLoadError(e);
        }
      })();
    } else {
      const loader = new OBJLoader();
      loader.load(url, onLoaded, undefined, onLoadError);
    }

    function animate() {
      frameIdRef.current = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || !cameraRef.current || !rendererRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight || 320;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    });
    resizeObserver.observe(container);

    return () => {
      fitCameraRef.current = null;
      resizeObserver.disconnect();
      cancelAnimationFrame(frameIdRef.current);
      envRT?.dispose();
      pmremGen.dispose();
      if (sceneRef.current) sceneRef.current.environment = null;
      if (meshRef.current && sceneRef.current) {
        sceneRef.current.remove(meshRef.current);
        meshRef.current.traverse((child) => {
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            if (mesh.geometry) mesh.geometry.dispose();
            if (mesh.material) {
              const mat = mesh.material as THREE.Material;
              if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
              else mat.dispose();
            }
          }
        });
        meshRef.current = null;
      }
      controlsRef.current?.dispose();
      controlsRef.current = null;
      const renderer = rendererRef.current;
      rendererRef.current = null;
      if (renderer) {
        const canvas = renderer.domElement;
        renderer.dispose();
        if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [url, kind]);

  return (
    <div ref={containerRef} className={`relative bg-[#16181D] ${className}`} style={{ minHeight: 320 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#16181D]/90 z-10">
          <span className="text-gray-300 text-sm">Завантаження 3D…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#16181D]/95 z-10 p-4">
          <p className="text-gray-300 text-sm text-center">{error}</p>
          <p className="text-gray-500 text-xs text-center">Можна закрити модалку та оновити сторінку.</p>
        </div>
      )}
      {!loading && (
        <button
          type="button"
          onClick={() => fitCameraRef.current?.()}
          className="absolute bottom-3 right-3 z-20 px-2.5 py-1.5 rounded text-xs font-medium bg-black/50 text-gray-300 hover:bg-black/70 hover:text-white border border-gray-600/80 transition-colors"
          title="Повернути камеру (Fit / Reset)"
        >
          Fit камера
        </button>
      )}
    </div>
  );
};

export default Model3DViewer;
