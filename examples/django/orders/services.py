from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound

from common.exceptions import Conflict
from payments import services as payments

from .models import Order, OrderItem, Product


@transaction.atomic
def place_order(user, checkout):
    items = checkout["items"]
    products = Product.objects.for_cart(item["product_id"] for item in items)

    for item in items:
        product = products.get(item["product_id"])
        # [POST: /api/orders flow-4 fail:404] A cart item points at a product that does not exist
        if product is None:
            raise NotFound(f"product {item['product_id']} not found")
        # [POST: /api/orders flow-4 fail:409] Not enough stock for a cart item
        if product.stock < item["quantity"]:
            raise Conflict(f"{product.sku} is out of stock")

    total_cents = sum(products[item["product_id"]].price_cents * item["quantity"] for item in items)

    # [POST: /api/orders flow-5 db:orders:create] Inserts the order as pending with its total
    order = Order.objects.create(user=user, payment_method=checkout["payment_method"], total_cents=total_cents)

    # [POST: /api/orders flow-6 db:order_items:create] Inserts one row per cart item at the current price
    OrderItem.objects.bulk_create(
        OrderItem(
            order=order,
            product_id=item["product_id"],
            quantity=item["quantity"],
            unit_price_cents=products[item["product_id"]].price_cents,
        )
        for item in items
    )

    payments.charge(order, checkout.get("card_token"))
    Product.objects.reserve(items)
    return order


@transaction.atomic
def cancel_order(user, order_id):
    order = Order.objects.owned_by(user, order_id)

    # [POST: /api/orders/:id/cancel flow-3 fail:404] Order does not exist or belongs to someone else
    if order is None:
        raise NotFound("order not found")
    # [POST: /api/orders/:id/cancel flow-3 fail:409] Order already shipped or cancelled
    if order.status in (Order.Status.SHIPPED, Order.Status.CANCELLED):
        raise Conflict(f"order is {order.status}")

    payments.refund(order)

    # [POST: /api/orders/:id/cancel flow-7 db:orders:update] Marks the order cancelled
    order.status = Order.Status.CANCELLED
    order.cancelled_at = timezone.now()
    order.save(update_fields=["status", "cancelled_at"])

    Product.objects.release(order.items.all())
    return order
