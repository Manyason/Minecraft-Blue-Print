const canvas = document.getElementById('editorCanvas');
const ctx = canvas.getContext('2d');

let isMoveMode = false;
let currentLayer = 0;
let currentElement = 'wall';
let designData = {}; 

let scale = 30; 
let offsetX = window.innerWidth / 2;
let offsetY = window.innerHeight / 2;

let isDragging = false;
let lastMouseX = 0;
let lastMouseY = 0;

window.addEventListener('resize', resizeCanvas);
function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    draw();
}
resizeCanvas();

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (document.getElementById('ghost-layer-toggle').checked && currentLayer > 0) {
        ctx.globalAlpha = 0.2;
        drawLayer(currentLayer - 1);
        ctx.globalAlpha = 1.0;
    }
    drawLayer(currentLayer);
    drawGrid();
}

function drawLayer(z) {
    if (!designData[z]) return;
    for (let x in designData[z]) {
        for (let y in designData[z][x]) {
            ctx.fillStyle = getElementColor(designData[z][x][y]);
            ctx.fillRect(x * scale + offsetX, y * scale + offsetY, scale, scale);
        }
    }
}

function getElementColor(type) {
    const colors = { 'wall': '#777', 'floor': '#864', 'space': 'transparent' };
    return colors[type] || '#444';
}

function drawGrid() {
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 0.5;
    const sX = offsetX % scale;
    const sY = offsetY % scale;
    for (let x = sX; x < canvas.width; x += scale) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
    }
    for (let y = sY; y < canvas.height; y += scale) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
}

window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() === 'm') {
        isMoveMode = !isMoveMode;
        document.getElementById('current-mode').innerText = isMoveMode ? '移動' : '編集';
        canvas.style.cursor = isMoveMode ? 'move' : 'crosshair';
    }
    if (e.key.toLowerCase() === 'e') changeLayer(1);
    if (e.key.toLowerCase() === 'q') changeLayer(-1);
    draw();
});

canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoom = e.deltaY > 0 ? 0.9 : 1.1;
    const mX = e.clientX - offsetX;
    const mY = e.clientY - offsetY;
    offsetX -= mX * (zoom - 1);
    offsetY -= mY * (zoom - 1);
    scale *= zoom;
    draw();
}, { passive: false });

canvas.addEventListener('mousedown', (e) => {
    isDragging = true;
    [lastMouseX, lastMouseY] = [e.clientX, e.clientY];
    if (!isMoveMode) editCell(e.clientX, e.clientY);
});

window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    if (isMoveMode) {
        offsetX += e.clientX - lastMouseX;
        offsetY += e.clientY - lastMouseY;
    } else { editCell(e.clientX, e.clientY); }
    [lastMouseX, lastMouseY] = [e.clientX, e.clientY];
    draw();
});

window.addEventListener('mouseup', () => isDragging = false);

function editCell(mX, mY) {
    const gX = Math.floor((mX - offsetX) / scale);
    const gY = Math.floor((mY - offsetY) / scale);
    if (!designData[currentLayer]) designData[currentLayer] = {};
    if (!designData[currentLayer][gX]) designData[currentLayer][gX] = {};
    designData[currentLayer][gX][gY] = currentElement;
}

function setElement(t) { currentElement = t; }
function changeLayer(v) {
    currentLayer = Math.max(0, currentLayer + v);
    document.getElementById('layer-display').innerText = currentLayer;
    draw();
}

async function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('landscape'); 

    // Canvasを画像データ(PNG)に変換
    const imageData = canvas.toDataURL("image/png");

    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    doc.addImage(imageData, 'PNG', 0, 0, width, height);

    doc.save(`blueprint-layer-${currentLayer}.pdf`);
}