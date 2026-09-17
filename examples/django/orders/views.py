from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from . import services
from .serializers import CheckoutSerializer, OrderSerializer


class OrderViewSet(viewsets.GenericViewSet):
    serializer_class = OrderSerializer
    lookup_value_regex = "[0-9a-f-]{36}"

    # [POST: /api/orders flow-1] Checkout: turns a cart into a paid (or pending) order
    def create(self, request):
        # [POST: /api/orders flow-3] Validates cart items and the payment method
        checkout = CheckoutSerializer(data=request.data)
        # [POST: /api/orders flow-3 fail:400] Empty cart, bad quantity or unknown payment method
        checkout.is_valid(raise_exception=True)

        order = services.place_order(request.user, checkout.validated_data)

        # [POST: /api/orders flow-12] Answers 201 with the order and its payment status
        return Response(OrderSerializer(order).data, status=status.HTTP_201_CREATED)

    # [POST: /api/orders/:id/cancel flow-1] Cancels an order that has not shipped
    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        order = services.cancel_order(request.user, pk)

        # [POST: /api/orders/:id/cancel flow-9] Returns the cancelled order
        return Response(OrderSerializer(order).data)
