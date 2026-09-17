from django.db import models


class Order(models.Model):
    code = models.CharField(max_length=20, primary_key=True)
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE)
    tenant = models.IntegerField()
    status = models.CharField(max_length=10, choices=[("new", "New"), ("paid", "Paid")])
    tags = models.ManyToManyField("Tag")

    class Meta:
        db_table = "orders"
        constraints = [models.UniqueConstraint(fields=["tenant", "user"], name="uniq_tenant_user")]
