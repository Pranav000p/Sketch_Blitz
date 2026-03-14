import { useEffect, useRef } from "react";

function drawStroke(ctx, stroke) {
  if (!stroke || stroke.points.length < 1) return;
  ctx.strokeStyle = stroke.color;
  ctx.lineWidth = stroke.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.beginPath();
  ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
  stroke.points.forEach((pt) => ctx.lineTo(pt.x, pt.y));
  ctx.stroke();
}

export default function CanvasBoard({
  strokes,
  onStart,
  onMove,
  onEnd,
  isDrawer,
}) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef(strokes);

  const drawAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    strokesRef.current.forEach((stroke) => drawStroke(ctx, stroke));
  };

  useEffect(() => {
    strokesRef.current = strokes;
    drawAll();
  }, [strokes]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      drawAll();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  const getPoint = (event) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (event.clientX - rect.left) * scaleX;
    const y = (event.clientY - rect.top) * scaleY;
    return { x, y };
  };

  const handlePointerDown = (event) => {
    if (!isDrawer) return;
    drawingRef.current = true;
    onStart(getPoint(event));
  };

  const handlePointerMove = (event) => {
    if (!isDrawer || !drawingRef.current) return;
    onMove(getPoint(event));
  };

  const handlePointerUp = () => {
    if (!isDrawer) return;
    drawingRef.current = false;
    onEnd();
  };

  return (
    <canvas
      ref={canvasRef}
      className="draw-canvas"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    />
  );
}

