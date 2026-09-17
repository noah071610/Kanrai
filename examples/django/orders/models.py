import uuid

from django.conf import settings
from django.db import models

from .managers import OrderManager, ProductManager


class Product(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    sku = models.CharField(max_length=32, unique=True)
    name = models.CharField(max_length=200)
    price_cents = models.PositiveIntegerField()
    stock = models.PositiveIntegerField(default=0)

    objects = ProductManager()

    class Meta:
        db_table = "products"


class Order(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending"
        PAID = "paid"
        SHIPPED = "shipped"
        CANCELLED = "cancelled"

    class PaymentMethod(models.TextChoices):
        CARD = "card"
        BANK = "bank"
        POINTS = "points"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey("accounts.User", on_delete=models.PROTECT, related_name="orders")
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.PENDING)
    payment_method = models.CharField(max_length=16, choices=PaymentMethod.choices)
    total_cents = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)

    objects = OrderManager()

    class Meta:
        db_table = "orders"


class OrderItem(models.Model):
    order = models.ForeignKey(Order, on_delete=models.CASCADE, related_name="items")
    product = models.ForeignKey(Product, on_delete=models.PROTECT)
    quantity = models.PositiveSmallIntegerField()
    unit_price_cents = models.PositiveIntegerField()

    class Meta:
        db_table = "order_items"
        constraints = [models.UniqueConstraint(fields=["order", "product"], name="order_item_unique")]
