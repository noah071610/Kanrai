from django.db import models
from django.db.models import F


class ProductManager(models.Manager):
    # [POST: /api/orders flow-4 db:products:read] Loads price and stock for every cart item
    def for_cart(self, product_ids):
        return self.select_for_update().in_bulk(list(product_ids))

    # [POST: /api/orders flow-11 db:products:update] Decrements stock for the ordered items
    def reserve(self, items):
        for item in items:
            self.filter(pk=item["product_id"]).update(stock=F("stock") - item["quantity"])

    # [POST: /api/orders/:id/cancel flow-8 db:products:update] Puts the cancelled items back in stock
    def release(self, order_items):
        for item in order_items:
            self.filter(pk=item.product_id).update(stock=F("stock") + item.quantity)


class OrderManager(models.Manager):
    # [POST: /api/orders/:id/cancel flow-3 db:orders:read] Loads the caller's order with its payment
    def owned_by(self, user, order_id):
        return self.select_related("payment", "user").filter(pk=order_id, user=user).first()
