from django.shortcuts import render
import json
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from .models import Design, Cell

@csrf_exempt # 今回は簡略化のため。本来はCSRFトークンを送るのが望ましいです
def save_design(request):
    if request.method == 'POST':
        data = json.loads(request.body)
        design_name = data.get('name')
        cells = data.get('cells') # { "z": { "x": { "y": "type" } } }

        # 設計図を新規作成または更新
        design, created = Design.objects.get_or_create(
            user=request.user, 
            name=design_name
        )

        # 既存のセルを一旦削除して書き直し（シンプルにするため）
        Cell.objects.filter(design=design).delete()

        # データをフラットにして一括保存
        cell_instances = []
        for z, x_map in cells.items():
            for x, y_map in x_map.items():
                for y, elem_type in y_map.items():
                    cell_instances.append(Cell(
                        design=design, x=x, y=y, z=z, element_type=elem_type
                    ))
        Cell.objects.bulk_create(cell_instances)

        return JsonResponse({'status': 'success'})
    
# 設計図一覧を取得
def list_designs(request):
    designs = Design.objects.filter(user=request.user).values('id', 'name')
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
