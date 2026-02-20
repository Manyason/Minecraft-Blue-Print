import json
import io

# Django関連のインポート
from django.shortcuts import render
from django.http import JsonResponse, FileResponse, HttpResponse  # HttpResponseを追加
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth.models import User

# アプリ内モデルのインポート
from .models import Design, Cell

# PDF生成関連（ReportLab）のインポート
from reportlab.pdfgen import canvas as pdf_canvas
from reportlab.lib.pagesizes import A4, landscape  

# --- 拡張用の設定変数 ---
# PDFに描画し、寸法計算の対象とするブロックの種類
VALID_BLOCK_TYPES = ['wall', 'floor', 'stairs', 'roof', 'ladder']

# 各ブロックの描画色 (RGB: 0.0 ~ 1.0)
BLOCK_COLORS = {
    'wall': (0.2, 0.2, 0.2),    # 濃いグレー
    'floor': (0.7, 0.6, 0.4),   # 木材色（茶）
    'stairs': (0.6, 0.4, 0.2),  # 階段（少し濃い茶）
    'roof': (0.8, 0.2, 0.2),    # 屋根（テラコッタ風の赤）
    'ladder': (1.0, 0.8, 0.2),  # ハシゴ（目立つ黄色）
}

def get_current_user(request):
    """ログインしていればそのユーザーを、してなければ最初のユーザーを返す(開発用)"""
    if request.user.is_authenticated:
        return request.user
    return User.objects.first()

@csrf_exempt
def save_design(request):
    if request.method == 'POST':
        user = get_current_user(request)
        data = json.loads(request.body)
        design_name = data.get('name')
        cells = data.get('cells', {})

        design, created = Design.objects.get_or_create(
            user=user,
            name=design_name
        )

        # 既存のセルを一旦削除
        Cell.objects.filter(design=design).delete()

        cell_instances = []
        for z, x_map in cells.items():
            for x, y_map in x_map.items():
                for y, elem_type in y_map.items():
                    # --- ここが重要：elem_type が空（消しゴム）なら保存しない ---
                    if not elem_type or elem_type == "":
                        continue
                    
                    cell_instances.append(Cell(
                        design=design,
                        x=int(x),
                        y=int(y),
                        z=int(z),
                        element_type=elem_type
                    ))

        Cell.objects.bulk_create(cell_instances)
        return JsonResponse({'status': 'success', 'design_id': design.id})
    
# 設計図一覧を取得
def list_designs(request):
    user = get_current_user(request)
    designs = Design.objects.filter(user=user).values('id', 'name')
    return JsonResponse(list(designs), safe=False)

# 特定の設計図のセルデータを取得
def load_design(request, design_id):
    cells = Cell.objects.filter(design_id=design_id)
    
    # フロントエンドの {z: {x: {y: type}}} 形式に変換
    data = {}
    for cell in cells:
        z, x, y = str(cell.z), str(cell.x), str(cell.y)
        if z not in data: data[z] = {}
        if x not in data[z]: data[z][x] = {}
        data[z][x][y] = cell.element_type
        
    return JsonResponse({'cells': data, 'current_layer': 0})

def design_editor(request):
    return render(request, 'core/design_editor.html')
# Create your views here.

@csrf_exempt
def export_pdf_server(request, design_id):
    try:
        user = get_current_user(request)
        design = Design.objects.get(id=design_id, user=user)
    except Design.DoesNotExist:
        return HttpResponse("Design not found", status=404)

    # 動的な高さの取得 (デフォルト3)
    try:
        floor_h = int(request.GET.get('height', 3))
    except ValueError:
        floor_h = 3

    cells = Cell.objects.filter(design=design)
    design_data = {}
    material_counts = {k: 0 for k in VALID_BLOCK_TYPES}

    for cell in cells:
        if not cell.element_type or cell.element_type not in VALID_BLOCK_TYPES:
            continue
            
        # 1. 描画データの整理
        z_k, x_k, y_k = str(cell.z), str(cell.x), str(cell.y)
        if z_k not in design_data: design_data[z_k] = {}
        if x_k not in design_data[z_k]: design_data[z_k][x_k] = {}
        design_data[z_k][x_k][y_k] = cell.element_type

        # 2. 資材計算 (高さ考慮)
        b_type = cell.element_type
        if b_type == 'wall' or b_type == 'ladder':
            material_counts[b_type] += floor_h
        else:
            material_counts[b_type] += 1

    buffer = io.BytesIO()
    p = pdf_canvas.Canvas(buffer, pagesize=landscape(A4))
    width, height = landscape(A4)
    scale, origin_x, origin_y = 15, width / 2, height / 2

    layers = sorted([int(k) for k in design_data.keys()])
    
    for z in layers:
        current_layer_cells = design_data.get(str(z), {})
        if not current_layer_cells: continue
        if z != layers[0]: p.showPage()

        # --- グリッドと基準線 ---
        p.setStrokeColorRGB(0.85, 0.85, 0.85)
        for i in range(-30, 31):
            p.setLineWidth(0.8 if i % 5 == 0 else 0.2)
            p.line(origin_x + i*scale, 0, origin_x + i*scale, height)
            p.line(0, origin_y + i*scale, width, origin_y + i*scale)
        p.setLineWidth(1.5)
        p.setStrokeColorRGB(0, 1, 1); p.line(origin_x, 0, origin_x, height)
        p.setStrokeColorRGB(1, 0, 1); p.line(0, origin_y, width, origin_y)

        # --- セル描画 ---
        for x_str, y_map in current_layer_cells.items():
            for y_str, elem_type in y_map.items():
                try:
                    p.setFillColorRGB(*BLOCK_COLORS.get(elem_type, (0.5, 0.5, 0.5)))
                    p.rect(origin_x + int(x_str)*scale, origin_y - (int(y_str)+1)*scale, scale, scale, fill=1, stroke=0)
                except: continue

        # --- 寸法入力 ---
        p.setFont("Helvetica-Bold", 10); p.setFillColorRGB(0.1, 0.1, 0.8)
        def is_b(cx, cy): return current_layer_cells.get(str(cx), {}).get(str(cy)) in VALID_BLOCK_TYPES
        
        # 横方向
        y_coords = sorted(set(int(y) for xm in current_layer_cells.values() for y in xm.keys()))
        for y in y_coords:
            xs = sorted([int(x) for x in current_layer_cells.keys() if str(y) in current_layer_cells[x]])
            for edges, off_y in [([x for x in xs if not is_b(x, y-1)], 3), ([x for x in xs if not is_b(x, y+1)], -scale-11)]:
                if not edges: continue
                idx = 0
                while idx < len(edges):
                    start = edges[idx]
                    while idx + 1 < len(edges) and edges[idx+1] == edges[idx] + 1: idx += 1
                    if edges[idx] - start + 1 > 1:
                        p.drawString(origin_x + (start + edges[idx])/2 * scale + 2, origin_y - y*scale + off_y, f"{edges[idx]-start+1}")
                    idx += 1

        # 縦方向
        for x_str in current_layer_cells.keys():
            ys = sorted([int(y) for y in current_layer_cells[x_str].keys()])
            for edges, off_x in [([y for y in ys if not is_b(int(x_str)-1, y)], -15), ([y for y in ys if not is_b(int(x_str)+1, y)], scale+4)]:
                if not edges: continue
                idx = 0
                while idx < len(edges):
                    start = edges[idx]
                    while idx + 1 < len(edges) and edges[idx+1] == edges[idx] + 1: idx += 1
                    if edges[idx] - start + 1 > 1:
                        p.drawString(origin_x + int(x_str)*scale + off_x, origin_y - (start + edges[idx]+1)/2 * scale - 4, f"{edges[idx]-start+1}")
                    idx += 1

        # --- 集計リスト & 凡例 ---
        p.setFillColorRGB(0.97, 0.97, 0.97); p.rect(width - 145, height - 140, 130, 125, fill=1)
        p.setFillColorRGB(0, 0, 0); p.setFont("Helvetica-Bold", 10)
        p.drawString(width - 135, height - 30, f"Material (H:{floor_h})")
        p.setFont("Helvetica", 9)
        cur_y = height - 45
        for b, c in material_counts.items():
            if c > 0:
                p.drawString(width - 135, cur_y, f"{b.capitalize()}: {c}")
                cur_y -= 12
        
        p.setFont("Helvetica-Bold", 14); p.drawString(30, height - 30, f"Design: {design.name} ({z}F)")

    p.save(); buffer.seek(0)
    return FileResponse(buffer, as_attachment=True, filename=f"blueprint_{design.name}.pdf")