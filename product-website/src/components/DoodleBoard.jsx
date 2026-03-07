import { useRef, useEffect, useState, useCallback } from 'react';
import './DoodleBoard.css';

const TENDER_COLORS = [
    { name: 'Ink', value: '#1A1A1A' },
    { name: 'Pure Silence', value: '#FFFFFF' },
    { name: 'Lavender Mist', value: '#E6E6FA' },
    { name: 'Deep Sea', value: '#004D4D' },
    { name: 'Soft Rose', value: '#F4C2C2' },
    { name: 'Golden Hour', value: '#FFD700' },
];

const BRUSH_SIZES = [2, 5, 10, 20];

export default function DoodleBoard({ socket, roomId, recipientId, onClose }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [color, setColor] = useState(TENDER_COLORS[0].value);
    const [brushSize, setBrushSize] = useState(5);
    const [partnerCursor, setPartnerCursor] = useState(null);
    const prevPosRef = useRef({ x: 0, y: 0 });

    // Draw local or remote line
    const drawLine = useCallback((x1, y1, x2, y2, lineColor, lineWidth) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        ctx.beginPath();
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.closePath();
    }, []);

    // Handle Socket Events
    useEffect(() => {
        if (!socket) return;

        const handleRemoteDraw = (data) => {
            // Data is in normalized coordinates (0-1) to handle different screen sizes
            const canvas = canvasRef.current;
            if (!canvas) return;

            const x1 = data.x1 * canvas.width;
            const y1 = data.y1 * canvas.height;
            const x2 = data.x2 * canvas.width;
            const y2 = data.y2 * canvas.height;

            drawLine(x1, y1, x2, y2, data.color, data.width);

            // Update partner cursor position
            setPartnerCursor({ x: x2, y: y2, name: data.name });

            // Clear cursor after 2 seconds of inactivity
            clearTimeout(window.partnerCursorTimer);
            window.partnerCursorTimer = setTimeout(() => setPartnerCursor(null), 2000);
        };

        const handleRemoteClear = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };

        socket.on('random:doodle:draw', handleRemoteDraw);
        socket.on('random:doodle:clear', handleRemoteClear);
        socket.on('friend:doodle:draw', handleRemoteDraw);
        socket.on('friend:doodle:clear', handleRemoteClear);

        return () => {
            socket.off('random:doodle:draw', handleRemoteDraw);
            socket.off('random:doodle:clear', handleRemoteClear);
            socket.off('friend:doodle:draw', handleRemoteDraw);
            socket.off('friend:doodle:clear', handleRemoteClear);
        };
    }, [socket, drawLine]);

    // Handle Responsive Canvas
    useEffect(() => {
        const resizeCanvas = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const container = canvas.parentElement;

            // Backup current content
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = canvas.width;
            tempCanvas.height = canvas.height;
            tempCanvas.getContext('2d').drawImage(canvas, 0, 0);

            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;

            // Restore content (will be stretched, but better than nothing)
            const ctx = canvas.getContext('2d');
            ctx.drawImage(tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height, 0, 0, canvas.width, canvas.height);
        };

        window.addEventListener('resize', resizeCanvas);
        resizeCanvas();
        return () => window.removeEventListener('resize', resizeCanvas);
    }, []);

    const getCoordinates = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();

        // Support Touch and Mouse
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        const pos = getCoordinates(e);
        prevPosRef.current = pos;
        setIsDrawing(true);
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        if (!canvas) return;

        const currentPos = getCoordinates(e);
        const prevPos = prevPosRef.current;

        drawLine(prevPos.x, prevPos.y, currentPos.x, currentPos.y, color, brushSize);

        // Send to partner (normalized)
        if (socket) {
            if (roomId) {
                socket.emit('random:doodle:draw', {
                    roomId,
                    x1: prevPos.x / canvas.width,
                    y1: prevPos.y / canvas.height,
                    x2: currentPos.x / canvas.width,
                    y2: currentPos.y / canvas.height,
                    color,
                    width: brushSize
                });
            } else if (recipientId) {
                socket.emit('friend:doodle:draw', {
                    recipientId,
                    x1: prevPos.x / canvas.width,
                    y1: prevPos.y / canvas.height,
                    x2: currentPos.x / canvas.width,
                    y2: currentPos.y / canvas.height,
                    color,
                    width: brushSize
                });
            }
        }

        prevPosRef.current = currentPos;
    };

    const handleClear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (socket) {
            if (roomId) {
                socket.emit('random:doodle:clear', { roomId });
            } else if (recipientId) {
                socket.emit('friend:doodle:clear', { recipientId });
            }
        }
    };

    const handleDownload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const dataUrl = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `muhdikhai-memory-${Date.now()}.png`;
        link.href = dataUrl;
        link.click();
    };

    return (
        <div className="doodle-overlay">
            <div className="doodle-container">
                <div className="doodle-toolbar">
                    <div className="toolbar-section">
                        <span className="toolbar-label">Palette</span>
                        <div className="color-grid">
                            {TENDER_COLORS.map((c) => (
                                <button
                                    key={c.value}
                                    className={`color-swatch ${color === c.value ? 'active' : ''}`}
                                    style={{ backgroundColor: c.value }}
                                    onClick={() => setColor(c.value)}
                                    title={c.name}
                                />
                            ))}
                        </div>
                    </div>

                    <div className="toolbar-section">
                        <span className="toolbar-label">Brush</span>
                        <div className="brush-grid">
                            {BRUSH_SIZES.map((size) => (
                                <button
                                    key={size}
                                    className={`brush-opt ${brushSize === size ? 'active' : ''}`}
                                    onClick={() => setBrushSize(size)}
                                >
                                    <div style={{ width: size, height: size, background: 'currentColor', borderRadius: '50%' }} />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="toolbar-section actions">
                        <button className="doodle-action-btn" onClick={handleClear} title="Clear Canvas">
                            <span>🗑</span>
                        </button>
                        <button className="doodle-action-btn" onClick={handleDownload} title="Save Memory">
                            <span>💾</span>
                        </button>
                        <button className="doodle-action-btn close" onClick={onClose} title="Close Scratch Pad">
                            <span>✕</span>
                        </button>
                    </div>
                </div>

                <div className="canvas-wrap">
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startDrawing}
                        onMouseMove={draw}
                        onMouseUp={stopDrawing}
                        onMouseOut={stopDrawing}
                        onTouchStart={startDrawing}
                        onTouchMove={draw}
                        onTouchEnd={stopDrawing}
                    />

                    {partnerCursor && (
                        <div
                            className="partner-cursor"
                            style={{ left: partnerCursor.x, top: partnerCursor.y }}
                        >
                            <div className="cursor-dot" />
                            <div className="cursor-label">{partnerCursor.name} is drawing...</div>
                        </div>
                    )}

                    <div className="doodle-hint">Collaborative Scratch Pad · Real-time</div>
                </div>
            </div>
        </div>
    );
}
