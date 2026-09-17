from rest_framework import serializers

from .models import Order


class CartItemSerializer(serializers.Serializer):
    product_id = serializers.UUIDField()
    quantity = serializers.IntegerField(min_value=1, max_value=99)


class CheckoutSerializer(serializers.Serializer):
    items = CartItemSerializer(many=True, allow_empty=False)
    payment_method = serializers.ChoiceField(choices=Order.PaymentMethod.choices)
    card_token = serializers.CharField(required=False)

    def validate(self, attrs):
        # [POST: /api/orders flow-3 fail:400] Card payment without a card token
        if attrs["payment_method"] == Order.PaymentMethod.CARD and not attrs.get("card_token"):
            raise serializers.ValidationError({"card_token": "required for card payments"})
        return attrs


class OrderSerializer(serializers.ModelSerializer):
    payment_status = serializers.CharField(source="payment.status", default=None)

    class Meta:
        model = Order
        fields = ["id", "status", "payment_method", "total_cents", "payment_status", "created_at"]
