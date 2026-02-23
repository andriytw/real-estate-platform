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
    const bgColor = 0x0b1220;
    scene.background = new THREE.Color(bgColor);
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
    renderer.setClearColor(bgColor, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.insertBefore(renderer.domElement, container.firstChild);
    rendererRef.current = renderer;

    const pmremGen = new THREE.PMREMGenerator(renderer);
    const envRT = pmremGen.fromScene(new RoomEnvironment(), 0.04);
    scene.environment = envRT.texture;

    const ambient = new THREE.AmbientLight(0xffffff, 0.55);
    scene.add(ambient);
    const hemisphere = new THREE.HemisphereLight(0xffffff, 0x444460, 0.6);
    scene.add(hemisphere);
    const directional = new THREE.DirectionalLight(0xffffff, 0.65);
    directional.position.set(10, 10, 10);
    directional.castShadow = true;
    directional.shadow.mapSize.width = 1024;
    directional.shadow.mapSize.height = 1024;
    const shadowCam = directional.shadow.camera as THREE.OrthographicCamera;
    shadowCam.near = 0.5;
    shadowCam.far = 50;
    shadowCam.left = shadowCam.bottom = -25;
    shadowCam.right = shadowCam.top = 25;
    directional.shadow.bias = -0.0001;
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

    const MAX_VERTICES_FOR_NORMALS = 2_000_000;
    function ensureNormals(root: THREE.Object3D) {
      root.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const geom = mesh.geometry as THREE.BufferGeometry | undefined;
          if (!geom) return;
          const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
          const count = pos?.count ?? 0;
          if (count >= MAX_VERTICES_FOR_NORMALS) return;
          const normals = geom.attributes.normal;
          if (!normals || (normals as THREE.BufferAttribute).count === 0) {
            geom.computeVertexNormals();
          }
        }
      });
    }

    function applyDefaultMaterial(obj: THREE.Object3D) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = false;
          let mat: THREE.Material | THREE.Material[] | null = mesh.material;
          if (!mat || (Array.isArray(mat) && mat.length === 0)) {
            mesh.material = new THREE.MeshStandardMaterial({
              color: 0xf3f4f6,
              metalness: 0,
              roughness: 0.88,
              side: THREE.DoubleSide,
            });
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
              (m as THREE.MeshStandardMaterial).roughness = 0.88;
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

    let groundPlaneMesh: THREE.Mesh | null = null;
    let gridHelper: THREE.GridHelper | null = null;
    const edgeObjects: Array<{ geometry: THREE.BufferGeometry; material: THREE.Material }> = [];
    const MAX_VERTICES_FOR_EDGES = 1_200_000;
    const EDGE_THRESHOLD_DEG = 35;

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
      ensureNormals(model);
      applyDefaultMaterial(model);
      scene.add(model);
      meshRef.current = model;

      const box = new THREE.Box3().setFromObject(model);
      box.getSize(sizeVec);
      const maxDim = Math.max(sizeVec.x, sizeVec.y, sizeVec.z);
      const center = box.getCenter(new THREE.Vector3());

      if (!centerAndFrame(model)) {
        setError('Кадрування не вдалося — натисніть Fit камера.');
      } else {
        setError(null);
      }

      scene.fog = new THREE.Fog(bgColor, Math.max(1, maxDim * 0.15), Math.max(60, maxDim * 8));

      const planeSize = maxDim * 3;
      const groundGeometry = new THREE.PlaneGeometry(planeSize, planeSize);
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 1,
        metalness: 0,
      });
      groundPlaneMesh = new THREE.Mesh(groundGeometry, groundMaterial);
      groundPlaneMesh.rotation.x = -Math.PI / 2;
      groundPlaneMesh.receiveShadow = true;
      groundPlaneMesh.position.set(center.x, box.min.y - maxDim * 0.01, center.z);
      scene.add(groundPlaneMesh);

      const grid = new THREE.GridHelper(planeSize, 30, 0x334155, 0x334155);
      grid.position.set(center.x, groundPlaneMesh.position.y, center.z);
      const gridMat = grid.material as THREE.Material;
      if (gridMat) {
        gridMat.transparent = true;
        gridMat.opacity = 0.2;
      }
      scene.add(grid);
      gridHelper = grid;

      model.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const geom = mesh.geometry as THREE.BufferGeometry | undefined;
          if (!geom) return;
          const pos = geom.attributes.position as THREE.BufferAttribute | undefined;
          const count = pos?.count ?? 0;
          if (count >= MAX_VERTICES_FOR_EDGES) return;
          try {
            const edgeGeom = new THREE.EdgesGeometry(geom, EDGE_THRESHOLD_DEG);
            const edgeMat = new THREE.LineBasicMaterial({
              color: 0x0f172a,
              transparent: true,
              opacity: 0.35,
            });
            const line = new THREE.LineSegments(edgeGeom, edgeMat);
            mesh.add(line);
            edgeObjects.push({ geometry: edgeGeom, material: edgeMat });
          } catch (_) {}
        }
      });

      setLoading(false);
    };
    const onLoadError = (e: unknown) => {
      if (loadIdRef.current !== loadId) return;
      const err = e as Error | undefined;
      const errMsg = String(err?.message ?? e);
      const isUsdcCrate = /usdc|crate/i.test(errMsg);
      const msg = kind === 'usdz' || isUsdcCrate
        ? usdzUnsupportedMessage
        : (err?.message ?? 'Не вдалося завантажити модель.');
      setError(msg);
      setLoading(false);
      if (kind === 'usdz' || isUsdcCrate) {
        onError?.({ code: 'USDZ_CRATE_UNSUPPORTED', message: usdzUnsupportedMessage });
      } else {
        onError?.({ code: 'MODEL_LOAD_FAILED', message: msg });
      }
      if (kind === 'ifc') {
        console.error('[Model3DViewer] IFC load failed', err ?? e);
      } else {
        console.error('[Model3DViewer] load failed', err ?? e);
      }
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
          // DEV-only: fail fast if wasm is not served (e.g. missing postinstall copy or deploy)
          if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            const wasmCheck = await fetch('/web-ifc/web-ifc.wasm', { method: 'HEAD' });
            if (!wasmCheck.ok) {
              throw new Error(
                'web-ifc.wasm not found at /web-ifc/web-ifc.wasm (check postinstall copy + Vercel deploy).'
              );
            }
          }
          const { IfcAPI } = await import('web-ifc');
          const ifcApi = new IfcAPI();
          ifcApi.SetWasmPath('/web-ifc/');
          try {
            if (typeof ifcApi.useWebWorkers === 'function') {
              (ifcApi as { useWebWorkers: (v: boolean) => void }).useWebWorkers(false);
            }
          } catch (_) {
            // ignore if not available
          }
          await ifcApi.Init();
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const buffer = await res.arrayBuffer();
          const modelID = ifcApi.OpenModel(new Uint8Array(buffer));
          if (modelID === -1) throw new Error('IFC open failed');
          const flatMeshes = ifcApi.LoadAllGeometry(modelID);
          const group = new THREE.Group();
          const safeDelete = (obj: unknown) => {
            try {
              if (obj != null && typeof (obj as { delete?: () => void }).delete === 'function') {
                (obj as { delete: () => void }).delete();
              }
            } catch (_) {
              // avoid "delete is not a function" / minified runtime errors
            }
          };
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
              safeDelete(geom);
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
            safeDelete(flatMesh);
          }
          ifcApi.CloseModel(modelID);
          try {
            if (typeof (ifcApi as { dispose?: () => void }).dispose === 'function') {
              (ifcApi as { dispose: () => void }).dispose();
            }
          } catch (_) {}
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
      try {
        envRT?.dispose();
      } catch (_) {}
      try {
        pmremGen.dispose();
      } catch (_) {}
      if (sceneRef.current) {
        try {
          sceneRef.current.environment = null;
        } catch (_) {}
      }
      if (gridHelper && sceneRef.current) {
        try {
          sceneRef.current.remove(gridHelper);
          gridHelper.geometry?.dispose();
          (gridHelper.material as THREE.Material)?.dispose();
        } catch (_) {}
        gridHelper = null;
      }
      edgeObjects.forEach(({ geometry, material }) => {
        try {
          geometry.dispose();
          material.dispose();
        } catch (_) {}
      });
      edgeObjects.length = 0;
      if (groundPlaneMesh && sceneRef.current) {
        try {
          sceneRef.current.remove(groundPlaneMesh);
          groundPlaneMesh.geometry?.dispose();
          (groundPlaneMesh.material as THREE.Material)?.dispose();
        } catch (_) {}
        groundPlaneMesh = null;
      }
      if (meshRef.current && sceneRef.current) {
        try {
          sceneRef.current.remove(meshRef.current);
          meshRef.current.traverse((child) => {
            try {
              if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.geometry) mesh.geometry.dispose();
                if (mesh.material) {
                  const mat = mesh.material as THREE.Material;
                  if (Array.isArray(mat)) mat.forEach((m) => m?.dispose?.());
                  else mat.dispose();
                }
              }
            } catch (_) {}
          });
        } catch (_) {}
        meshRef.current = null;
      }
      try {
        controlsRef.current?.dispose();
      } catch (_) {}
      controlsRef.current = null;
      const renderer = rendererRef.current;
      rendererRef.current = null;
      if (renderer) {
        try {
          const canvas = renderer.domElement;
          renderer.dispose();
          if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        } catch (_) {}
      }
      sceneRef.current = null;
      cameraRef.current = null;
    };
  }, [url, kind]);

  return (
    <div ref={containerRef} className={`relative bg-[#0B1220] ${className}`} style={{ minHeight: 320 }}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0B1220]/90 z-10">
          <span className="text-gray-300 text-sm">Завантаження 3D…</span>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0B1220]/95 z-10 p-4">
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
