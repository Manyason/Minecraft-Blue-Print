from django.urls import path
from . import views

urlpatterns = [
    path('design/', views.design_editor, name='design_editor'),
]