from django.urls import path
from . import views

urlpatterns = [
    path('design/', views.design_editor, name='design_editor'),
    path('save-design/', views.save_design, name='save_design'),
    path('list-designs/', views.list_designs, name='list_designs'),
    path('load-design/<int:design_id>/', views.load_design, name='load_design'),
]