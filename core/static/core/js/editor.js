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
    // 1. 基本の線のスタイル
    ctx.strokeStyle = '#333'; // 通常の線の色
    ctx.lineWidth = 0.5;

    // 画面外までループが回らないよう、表示範囲を計算
    // offsetX, offsetY は Canvas上の「グリッドの(0,0)」がどこにあるかを示す
    const startX = offsetX % scale;
    const startY = offsetY % scale;

    // 縦線の描画
    for (let x = startX; x < canvas.width; x += scale) {
        // 現在描画しようとしている線が、グリッド上の「何マス目」か逆算
        const gridX = Math.round((x - offsetX) / scale);

        // 線の強弱設定
        if (gridX === 0) {
            ctx.strokeStyle = '#00ffcc'; // 原点(0)は目立つ色
            ctx.lineWidth = 2;
        } else if (gridX % 5 === 0) {
            ctx.strokeStyle = '#555';    // 5マスおきは少し濃く
            ctx.lineWidth = 1.5;
        } else {
            ctx.strokeStyle = '#333';    // 通常
            ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }

    // 横線の描画
    for (let y = startY; y < canvas.height; y += scale) {
        const gridY = Math.round((y - offsetY) / scale);

        // 線の強弱設定
        if (gridY === 0) {
            ctx.strokeStyle = '#ff3366'; // 原点(0)は目立つ色
            ctx.lineWidth = 2;
        } else if (gridY % 5 === 0) {
            ctx.strokeStyle = '#555';
            ctx.lineWidth = 1.5;
        } else {
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 0.5;
        }

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
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

function editCell(mouseX, mouseY) {
    const rect = canvas.getBoundingClientRect();
    const canvasX = mouseX - rect.left;
    const canvasY = mouseY - rect.top;

    const gridX = Math.floor((canvasX - offsetX) / scale);
    const gridY = Math.floor((canvasY - offsetY) / scale);

    if (!designData[currentLayer]) designData[currentLayer] = {};
    if (!designData[currentLayer][gridX]) designData[currentLayer][gridX] = {};

    if (currentElement === 'eraser') {
        // 消しゴムの場合はデータを削除
        delete designData[currentLayer][gridX][gridY];
    } else {
        // 壁や床を塗る
        designData[currentLayer][gridX][gridY] = currentElement;
    }
    draw();
}

function setElement(t) { currentElement = t; }
function changeLayer(v) {
    currentLayer = Math.max(0, currentLayer + v);
    document.getElementById('layer-display').innerText = currentLayer;
    draw();
}

async function exportToPDF() {
    // 1. まず現在の状態を確実にSQLへ保存する
    await saveDesignToServer(); 

    const select = document.getElementById('design-select');
    let designId = select.value;

    // もし新規保存直後でセレクトボックスにIDがない場合、
    // 名前が入力されていればリストを再取得して一致するものを探す
    if (!designId) {
        await fetchDesignList(); // 一覧を再読み込み
        const nameInput = document.getElementById('design-name').value;
        const options = Array.from(select.options);
        const found = options.find(opt => opt.textContent === nameInput);
        if (found) {
            designId = found.value;
            select.value = designId;
        }
    }

    if (!designId) {
        alert("保存された設計図のIDが見つかりません。一度保存ボタンを押してください。");
        return;
    }

    // 2. GETリクエストによる直接ダウンロード
    // これがブラウザにとって最も標準的なダウンロードフローです
    window.location.href = `/export-pdf/${designId}/`;
}

// CSRFトークン取得用のヘルパー関数
function getCookie(name) {
    let cookieValue = null;
    if (document.cookie && document.cookie !== '') {
        const cookies = document.cookie.split(';');
        for (let i = 0; i < cookies.length; i++) {
            const cookie = cookies[i].trim();
            if (cookie.substring(0, name.length + 1) === (name + '=')) {
                cookieValue = decodeURIComponent(cookie.substring(name.length + 1));
                break;
            }
        }
    }
    return cookieValue;
}

async function saveDesignToServer() {
    const name = document.getElementById('design-name').value;
    const select = document.getElementById('design-select');
    
    // すでに同じ名前の選択肢があるかチェック
    const exists = Array.from(select.options).some(opt => opt.textContent === name);
    
    if (exists) {
        if (!confirm(`「${name}」は既に存在します。上書きしますか？`)) {
            return; // キャンセルなら処理を中断
        }
    }

    if (!name) {
        alert("名前を入力してください");
        return;
    }

    const response = await fetch('/save-design/', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: name,
            cells: designData
        })
    });

    if (response.ok) {
        alert("保存が完了しました！");
    } else {
        alert("保存に失敗しました");
    }
}

window.onload = fetchDesignList;

async function fetchDesignList() {
    const response = await fetch('/list-designs/');
    const designs = await response.json();
    const select = document.getElementById('design-select');
    
    select.innerHTML = '<option value="">-- 設計図を選択 --</option>';
    designs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id;
        opt.textContent = d.name;
        select.appendChild(opt);
    });
}

async function loadDesignFromServer() {
    const designId = document.getElementById('design-select').value;
    if (!designId) return;

    const response = await fetch(`/load-design/${designId}/`);
    const data = await response.json();

    // グローバル変数の designData を上書き
    designData = data.cells;
    currentLayer = 0; // 0階から表示
    
    alert("読み込みが完了しました");
    draw(); // 再描画
}