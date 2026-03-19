import { useEffect, useMemo, useRef } from 'react';
import createGlobe from 'cobe';

const GlobalInteractiveGlobe = ({ locations = [] }) => {
  const canvasRef = useRef();
  const pointerInteracting = useRef(null);
  const pointerInteractionMovement = useRef(0);
  const r = useRef(0);
  const markers = useMemo(
    () => (Array.isArray(locations)
      ? locations
        .map((loc) => ({
          lat: Number(loc?.location?.[0]),
          lng: Number(loc?.location?.[1]),
          size: Number(loc?.size) || 0.05,
        }))
        .filter((loc) =>
          Number.isFinite(loc.lat) &&
          Number.isFinite(loc.lng) &&
          Math.abs(loc.lat) <= 90 &&
          Math.abs(loc.lng) <= 180
        )
      : []),
    [locations]
  );

  useEffect(() => {
    if (!canvasRef.current) return undefined;

    let phi = 0;
    let width = 0;
    const onResize = () => {
      if (!canvasRef.current) return;
      width = Math.max(canvasRef.current.offsetWidth || 0, 320);
    };
    window.addEventListener('resize', onResize);
    onResize();
    const resizeTick = window.requestAnimationFrame(onResize);

    const globe = createGlobe(canvasRef.current, {
      devicePixelRatio: 2,
      width: width * 2,
      height: width * 2,
      phi: 0,
      theta: 0,
      dark: 1,
      diffuse: 1.2,
      mapSamples: 16000,
      mapBrightness: 6,
      baseColor: [0.01, 0.04, 0.05],
      markerColor: [0, 1, 1], // Neon Cyan
      glowColor: [0, 0.5, 0.5],
      markers: markers.map((loc) => ({
        location: [loc.lat, loc.lng],
        size: Math.max(0.03, Math.min(0.12, loc.size)),
      })),
      onRender: (state) => {
        // This Baby rotates!
        if (!pointerInteracting.current) {
          phi += 0.005;
        }
        state.phi = phi + r.current;
        state.width = width * 2;
        state.height = width * 2;
      },
    });

    setTimeout(() => {
      if (canvasRef.current) canvasRef.current.style.opacity = '1';
    });
    return () => {
      window.cancelAnimationFrame(resizeTick);
      globe.destroy();
      window.removeEventListener('resize', onResize);
    };
  }, [markers]);

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1/1',
        maxWidth: 600,
        margin: '0 auto',
        position: 'relative',
        cursor: 'grab',
      }}
      onPointerDown={(e) => {
        pointerInteracting.current = e.clientX - pointerInteractionMovement.current;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      }}
      onPointerUp={() => {
        pointerInteracting.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }}
      onPointerOut={() => {
        pointerInteracting.current = null;
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }}
      onMouseMove={(e) => {
        if (pointerInteracting.current !== null) {
          const delta = e.clientX - pointerInteracting.current;
          pointerInteractionMovement.current = delta;
          r.current = delta / 200;
        }
      }}
      onTouchMove={(e) => {
        if (pointerInteracting.current !== null && e.touches[0]) {
          const delta = e.touches[0].clientX - pointerInteracting.current;
          pointerInteractionMovement.current = delta;
          r.current = delta / 100;
        }
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          contain: 'layout paint size',
          opacity: 0,
          transition: 'opacity 1s ease',
        }}
      />
    </div>
  );
};

export default GlobalInteractiveGlobe;
