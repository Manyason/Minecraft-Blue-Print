from django.db import models
from django.contrib.auth.models import User

class Profile(models.Model):
    # Django標準のUserモデルと1対1で紐付け
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    
    # 追加したい属性
    nickname = models.CharField(max_length=50, blank=True, verbose_name="ニックネーム")
    bio = models.TextField(max_length=500, blank=True, verbose_name="自己紹介")
    affiliation = models.CharField(max_length=100, blank=True, verbose_name="所属")
    is_researcher = models.BooleanField(default=False, verbose_name="研究者フラグ")
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.user.username}'s profile"
    
class Design(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    name = models.CharField(max_length=100, verbose_name="設計図名")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

class Cell(models.Model):
    design = models.ForeignKey(Design, on_delete=models.CASCADE, related_name='cells')
    x = models.IntegerField()
    y = models.IntegerField()
    z = models.IntegerField() # 階層
    element_type = models.CharField(max_length=20)

    class Meta:
        unique_together = ('design', 'x', 'y', 'z')
