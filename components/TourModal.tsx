import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { X, Maximize2, Home, BedDouble, Utensils, Bath, Loader2 } from 'lucide-react';
import Model3DViewer from './Model3DViewer';

export type Tour3dCandidate = { kind: 'glb' | 'ifc' | 'obj'; url: string };

interface TourModalProps {
  isOpen: boolean;
  onClose: () => void;
  propertyTitle: string;
  tourUrl?: string | null;
  tour3dCandidates?: Tour3dCandidate[];
  /** When true, show loading overlay only (no 360 demo). From marketplace. */
  isLoading?: boolean;
}

// Using equirectangular panoramic images for proper 360 projection
const TOUR_ROOMS = [
  { 
    id: 'living', 
    name: 'Living Room', 
    icon: Home, 
    image: 'https://images.unsplash.com/photo-1557971370-e7298ee473fb?q=80&w=3000&auto=format&fit=crop' // Panoramic Living Room
  },
  { 
    id: 'kitchen', 
    name: 'Kitchen', 
    icon: Utensils, 
    image: 'https://images.unsplash.com/photo-1556909212-d5b604d0c90d?q=80&w=3000&auto=format&fit=crop' // Wide Kitchen
  },
  { 
    id: 'bedroom', 
    name: 'Bedroom', 
    icon: BedDouble, 
    image: 'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?q=80&w=3000&auto=format&fit=crop' // Bedroom
  },
  { 
    id: 'bathroom', 
    name: 'Bathroom', 
    icon: Bath, 
    image: 'https://images.unsplash.com/photo-1620626012053-1c1e1c967653?q=80&w=3000&auto=format&fit=crop' // Bathroom
  },
];

const TourModal: React.FC<TourModalProps> = ({
  isOpen,
  onClose,
  propertyTitle,
  tourUrl = null,
  tour3dCandidates = [],
  isLoading: isLoadingProp = false,
}) => {
  // When tour3dCandidates is provided (e.g. from marketplace), use only it; ignore tourUrl. Never 360 demo; never USDZ.
  const candidates = tour3dCandidates !== undefined
    ? (tour3dCandidates ?? [])
    : (tourUrl ? [{ kind: (tourUrl.match(/\.(glb|ifc|obj)(\?|$)/i)?.[1]?.toLowerCase() ?? 'glb') as 'glb' | 'ifc' | 'obj', url: tourUrl }] : []);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [viewerError, setViewerError] = useState<{ code: string; message: string } | null>(null);
  const [activeRoomIndex, setActiveRoomIndex] = useState(0);
  useEffect(() => {
    if (isOpen) {
      setSelectedIndex(0);
      setViewerError(null);
    }
  }, [isOpen]);
  const [isLoading, setIsLoading] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Three.js refs
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sphereRef = useRef<THREE.Mesh | null>(null);
  
  // Interaction state
  const isDragging = useRef(false);
  const onPointerDownMouseX = useRef(0);
  const onPointerDownMouseY = useRef(0);
  const lon = useRef(0);
  const onPointerDownLon = useRef(0);
  const lat = useRef(0);
  const onPointerDownLat = useRef(0);
  const phi = useRef(0);
  const theta = useRef(0);

  // Initialize Scene
  useEffect(() => {
    if (!isOpen || !containerRef.current) return;

    // Scene setup
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Camera setup
    const camera = new THREE.PerspectiveCamera(75, containerRef.current.clientWidth / containerRef.current.clientHeight, 1, 1100);
    camera.target = new THREE.Vector3(0, 0, 0);
    cameraRef.current = camera;

    // Renderer setup
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Geometry (Sphere)
    const geometry = new THREE.SphereGeometry(500, 60, 40);
    // Invert the geometry on the x-axis so that all of the faces point inward
    geometry.scale(-1, 1, 1);

    // Material & Texture Placeholder
    const material = new THREE.MeshBasicMaterial({ color: 0x111111 }); // Dark background initially
    
    const sphere = new THREE.Mesh(geometry, material);
    scene.add(sphere);
    sphereRef.current = sphere;

    // Animation Loop
    const animate = () => {
      if (!isOpen) return;
      requestAnimationFrame(animate);
      update();
    };
    
    const update = () => {
      if(!cameraRef.current) return;

      lat.current = Math.max(-85, Math.min(85, lat.current));
      phi.current = THREE.MathUtils.degToRad(90 - lat.current);
      theta.current = THREE.MathUtils.degToRad(lon.current);

      const x = 500 * Math.sin(phi.current) * Math.cos(theta.current);
      const y = 500 * Math.cos(phi.current);
      const z = 500 * Math.sin(phi.current) * Math.sin(theta.current);

      cameraRef.current.lookAt(x, y, z);
      renderer.render(scene, cameraRef.current);
    };

    animate();

    // Handle window resize
    const handleResize = () => {
      if (cameraRef.current && rendererRef.current && containerRef.current) {
        cameraRef.current.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (rendererRef.current && containerRef.current) {
        containerRef.current.removeChild(rendererRef.current.domElement);
        rendererRef.current.dispose();
      }
    };
  }, [isOpen]);

  // Load Texture when active room changes
  useEffect(() => {
    if (!isOpen || !sphereRef.current) return;

    setIsLoading(true);
    const textureLoader = new THREE.TextureLoader();
    const room = TOUR_ROOMS[activeRoomIndex];

    textureLoader.load(
      room.image,
      (texture) => {
        // Texture loaded
        if (sphereRef.current) {
          // Dispose old texture/material if necessary to free memory
          if (sphereRef.current.material instanceof THREE.Material) {
             // @ts-ignore
             if (sphereRef.current.material.map) sphereRef.current.material.map.dispose();
          }
          
          sphereRef.current.material = new THREE.MeshBasicMaterial({ map: texture });
          setIsLoading(false);
        }
      },
      undefined, // onProgress
      (err) => {
        console.error("Error loading texture", err);
        setIsLoading(false);
      }
    );

  }, [activeRoomIndex, isOpen]);

  // Event Handlers for Dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    isDragging.current = true;
    onPointerDownMouseX.current = e.clientX;
    onPointerDownMouseY.current = e.clientY;
    onPointerDownLon.current = lon.current;
    onPointerDownLat.current = lat.current;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging.current) {
      lon.current = (onPointerDownMouseX.current - e.clientX) * 0.1 + onPointerDownLon.current;
      lat.current = (e.clientY - onPointerDownMouseY.current) * 0.1 + onPointerDownLat.current;
    }
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (cameraRef.current) {
      const fov = cameraRef.current.fov + e.deltaY * 0.05;
      cameraRef.current.fov = THREE.MathUtils.clamp(fov, 30, 90);
      cameraRef.current.updateProjectionMatrix();
    }
  };

  if (!isOpen) return null;

  const modalShell = (
    <div className="absolute top-0 left-0 right-0 p-4 z-20 flex justify-between items-center bg-gradient-to-b from-black/80 to-transparent">
      <h2 className="text-white text-lg font-bold drop-shadow-md">{propertyTitle}</h2>
      <button
        onClick={onClose}
        className="bg-black/50 hover:bg-white/20 text-white p-2 rounded-full transition-colors backdrop-blur-md"
      >
        <X className="w-6 h-6" />
      </button>
    </div>
  );

  if (isLoadingProp) {
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans">
        {modalShell}
        <div className="flex-1 pt-14 flex items-center justify-center min-h-0">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-gray-400 text-sm">Loading 3D…</p>
          </div>
        </div>
      </div>
    );
  }

  if (candidates.length > 0) {
    const current = candidates[selectedIndex];
    const isModel = current && ['glb', 'ifc', 'obj'].includes(current.kind);
    const handleViewerError = (info: { code: string; message: string }) => setViewerError(info);
    return (
      <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans">
        {modalShell}
        {candidates.length > 1 && (
          <div className="absolute top-14 left-0 right-0 px-4 py-2 z-20 flex justify-center gap-1">
            {(['glb', 'ifc', 'obj'] as const).map((k) => {
              if (!candidates.some((c) => c.kind === k)) return null;
              const isActive = current?.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => { setSelectedIndex(candidates.findIndex((c) => c.kind === k)); setViewerError(null); }}
                  className={`px-3 py-1.5 rounded text-xs font-medium ${isActive ? 'bg-white/20 text-white' : 'bg-black/40 text-gray-400 hover:text-white'}`}
                >
                  {k.toUpperCase()}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex-1 pt-14 min-h-0">
          {isModel ? (
            <Model3DViewer
              key={`${current.url}-${current.kind}`}
              url={current.url}
              kind={current.kind}
              className="w-full h-full min-h-[300px]"
              onError={handleViewerError}
            />
          ) : (
            <iframe
              src={current.url}
              title="3D Tour"
              className="w-full h-full border-0"
              allowFullScreen
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col font-sans">
      {modalShell}
      <div className="flex-1 pt-14 flex items-center justify-center min-h-0">
        <div className="flex flex-col items-center gap-2 text-center px-4">
          <p className="text-gray-300 text-sm">3D model not available. Upload OBJ.</p>
        </div>
      </div>
    </div>
  );
};

export default TourModal;
