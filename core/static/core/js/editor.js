/**
 * Minecraft Blueprint Editor - Global Fixed Version
 */

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

const BLOCK_DEFS = {
    'wall':   { label: '壁', color: '#333333' },
    'floor':  { label: '床', color: '#b29966' },
    'stairs': { label: '階段', color: '#996633' },
    'roof':   { label: '屋根', color: '#cc3333' },
    'ladder': { label: 'ハシゴ', color: '#ffcc33' }
};

// --- 初期化 ---
window.onload = () => {
    initBlockControls();
    resizeCanvas();
    fetchDesignList();
    draw();
};

function initBlockControls() {
    const container = document.getElementById('block-controls');
    if (!container) return;
    container.innerHTML = ""; // 重複防止

    Object.keys(BLOCK_DEFS).forEach(key => {
        const def = BLOCK_DEFS[key];
        const btn = document.createElement('div');
        btn.innerText = def.label;
        btn.className = 'block-btn';
        btn.style.cssText = `background-color:${def.color}; color:${key==='ladder'?'black':'white'}; padding:5px; cursor:pointer; margin:2px; border-radius:3px; text-align:center; min-width:40px; border:2px solid transparent;`;
        btn.onclick = () => setElement(key);
        btn.id = `btn-${key}`;
        container.appendChild(btn);
    });
    updateSelectedUI();
}

// --- 描画 ---
function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#FFFFFF"; // 背景白
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    drawGrid();

    const ghost = document.getElementById('ghost-layer-toggle');
    if (ghost && ghost.checked && currentLayer > 0) {
        ctx.save(); ctx.globalAlpha = 0.2;
        drawLayer(currentLayer - 1);
        ctx.restore();
    }
    drawLayer(currentLayer);
}

function drawLayer(z) {
    if (!designData[z]) return;
    for (const x in designData[z]) {
        for (const y in designData[z][x]) {
            const el = designData[z][x][y];
            if (BLOCK_DEFS[el]) {
                ctx.fillStyle = BLOCK_DEFS[el].color;
                ctx.fillRect(parseInt(x)*scale + offsetX, parseInt(y)*scale + offsetY, scale, scale);
            }
        }
    }
}

function drawGrid() {
    ctx.strokeStyle = "#DDD"; ctx.lineWidth = 0.5;
    const sX = offsetX % scale; const sY = offsetY % scale;
    for (let x = sX; x < canvas.width; x += scale) {
        const gX = Math.round((x-offsetX)/scale);
        ctx.strokeStyle = (gX===0) ? '#00ffcc' : (gX%5===0 ? '#888' : '#EEE');
        ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
    }
    for (let y = sY; y < canvas.height; y += scale) {
        const gY = Math.round((y-offsetY)/scale);
        ctx.strokeStyle = (gY===0) ? '#ff3366' : (gY%5===0 ? '#888' : '#EEE');
        ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
    }
}

// --- サーバー通信 ---

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
    if (!name) { alert("名前を入力してください"); return; }

    try {
        const response = await fetch('/save-design/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken') },
            body: JSON.stringify({ name: name, cells: designData })
        });
        if (response.ok) { alert("保存成功"); fetchDesignList(); }
        else { alert("保存失敗"); }
    } catch (e) { alert("通信エラー"); }
}

async function fetchDesignList() {
    const select = document.getElementById('design-select');
    if (!select) return;
    const response = await fetch('/list-designs/');
    const designs = await response.json();
    select.innerHTML = '<option value="">-- 設計図を選択 --</option>';
    designs.forEach(d => {
        const opt = document.createElement('option');
        opt.value = d.id; opt.textContent = d.name;
        select.appendChild(opt);
    });
}

async function loadDesignFromServer() {
    const id = document.getElementById('design-select').value;
    if (!id) return;
    const response = await fetch(`/load-design/${id}/`);
    const data = await response.json();
    designData = data.cells;
    currentLayer = 0;
    document.getElementById('layer-display').innerText = currentLayer;
    draw();
    alert("読込完了");
}

async function exportToPDF() {
    // 1. セレクトボックスから現在選択中のIDを取得
    const select = document.getElementById('design-select');
    let dId = select ? select.value : null;

    // 2. もし選択されていない場合、現在の入力欄の名前からIDを探す
    if (!dId) {
        const nameInput = document.getElementById('design-name');
        if (nameInput && nameInput.value) {
            await saveDesignToServer(); // 保存してリストを更新
            await fetchDesignList();
            const found = Array.from(select.options).find(opt => opt.textContent === nameInput.value);
            if (found) dId = found.value;
        }
    }

    // 3. IDがまだ空ならエラーを出して中断
    if (!dId) {
        alert("保存済みの設計図を選択するか、名前を入力して一度保存してください。");
        return;
    }

    // 4. 正しいURLを組み立てる (ハイフンかアンダースコアかもDjangoのurls.pyに合わせて修正)
    const floorH = document.getElementById('floor-height') ? document.getElementById('floor-height').value : 3;
    
    // Djangoのurls.pyが 'export-pdf/<int:design_id>/' なので、それに合わせます
    window.location.href = `/export-pdf/${dId}/?height=${floorH}`;
}

// --- UI操作 ---
function setElement(el) {
    currentElement = el;
    updateSelectedUI();
    Object.keys(BLOCK_DEFS).forEach(k => {
        const b = document.getElementById(`btn-${k}`);
        if(b) b.style.borderColor = (k===el) ? '#00ffcc' : 'transparent';
    });
}

function updateSelectedUI() {
    const label = document.getElementById('selected-label');
    if (currentElement === 'eraser') { label.innerText = '消しゴム'; label.style.color = '#ff4444'; }
    else { label.innerText = BLOCK_DEFS[currentElement].label; label.style.color = '#00ffcc'; }
}

function changeLayer(v) {
    currentLayer = Math.max(0, currentLayer + v);
    document.getElementById('layer-display').innerText = currentLayer;
    draw();
}

// --- キャンバスイベント (既存) ---
function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); }
function handleWheel(e) { e.preventDefault(); const z = e.deltaY>0?0.9:1.1; const mX=e.clientX-offsetX; const mY=e.clientY-offsetY; offsetX-=mX*(z-1); offsetY-=mY*(z-1); scale*=z; draw(); }
canvas.addEventListener('wheel', handleWheel, {passive:false});
canvas.addEventListener('mousedown', (e) => { isDragging=true; [lastMouseX, lastMouseY]=[e.clientX, e.clientY]; if(!isMoveMode) editCell(e.clientX,e.clientY); });
window.addEventListener('mousemove', (e) => { if(!isDragging) return; if(isMoveMode){ offsetX+=e.clientX-lastMouseX; offsetY+=e.clientY-lastMouseY; } else { editCell(e.clientX,e.clientY); } [lastMouseX, lastMouseY]=[e.clientX, e.clientY]; draw(); });
window.addEventListener('mouseup', () => isDragging=false);
function editCell(mX, mY) {
    const rect = canvas.getBoundingClientRect();
    const gX = Math.floor((mX - rect.left - offsetX) / scale);
    const gY = Math.floor((mY - rect.top - offsetY) / scale);
    if(!designData[currentLayer]) designData[currentLayer]={};
    if(!designData[currentLayer][gX]) designData[currentLayer][gX]={};
    if(currentElement==='eraser') delete designData[currentLayer][gX][gY];
    else designData[currentLayer][gX][gY] = currentElement;
    draw();
}
window.addEventListener('keydown', (e) => {
    if(e.key.toLowerCase()==='m') { isMoveMode=!isMoveMode; document.getElementById('current-mode').innerText = isMoveMode?'移動':'編集'; canvas.style.cursor=isMoveMode?'move':'crosshair'; }
    if(e.key.toLowerCase()==='e') changeLayer(1);
    if(e.key.toLowerCase()==='q') changeLayer(-1);
});