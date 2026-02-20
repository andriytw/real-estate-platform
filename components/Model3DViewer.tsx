import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface Model3DViewerProps {
  url: string;
  kind: 'obj' | 'glb';
  className?: string;
}

const Model3DViewer: React.FC<Model3DViewerProps> = ({ url, kind, className = '' }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const meshRef = useRef<THREE.Group | THREE.Object3D | null>(null);
  const frameIdRef = useRef<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!containerRef.current || !url) return;

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
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x16181d);
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);
    const directional = new THREE.DirectionalLight(0xffffff, 0.8);
    directional.position.set(10, 10, 10);
    scene.add(directional);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controlsRef.current = controls;

    function centerAndFrame(object: THREE.Object3D) {
      const box = new THREE.Box3().setFromObject(object);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      object.position.sub(center);
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = Math.max(maxDim * 1.5, 4);
      camera.position.set(distance, distance * 0.7, distance);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();
    }

    function applyDefaultMaterial(obj: THREE.Object3D) {
      obj.traverse((child) => {
        if ((child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          if (!mesh.material || (Array.isArray(mesh.material) && mesh.material.length === 0)) {
            mesh.material = new THREE.MeshLambertMaterial({ color: 0x9ca3af });
          }
          if (Array.isArray(mesh.material)) {
            mesh.material = mesh.material[0] ?? new THREE.MeshLambertMaterial({ color: 0x9ca3af });
          }
        }
      });
    }

    setError(null);
    setLoading(true);

    if (kind === 'glb') {
      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const model = gltf.scene;
          applyDefaultMaterial(model);
          scene.add(model);
          meshRef.current = model;
          centerAndFrame(model);
          setLoading(false);
        },
        undefined,
        (e) => {
          setError('Не вдалося завантажити модель');
          setLoading(false);
          console.error(e);
        }
      );
    } else {
      const loader = new OBJLoader();
      loader.load(
        url,
        (object) => {
          applyDefaultMaterial(object);
          scene.add(object);
          meshRef.current = object;
          centerAndFrame(object);
          setLoading(false);
        },
        undefined,
        (e) => {
          setError('Не вдалося завантажити модель');
          setLoading(false);
          console.error(e);
        }
      );
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
      resizeObserver.disconnect();
      cancelAnimationFrame(frameIdRef.current);
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
        <div className="absolute inset-0 flex items-center justify-center text-gray-400 text-sm">
          Завантаження…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center text-gray-500 text-sm">
          {error}
        </div>
      )}
    </div>
  );
};

export default Model3DViewer;
