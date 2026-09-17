from rest_framework.exceptions import APIException


class PaymentRequired(APIException):
    status_code = 402
    default_detail = "payment required"
    default_code = "payment_required"


class Conflict(APIException):
    status_code = 409
    default_detail = "conflict"
    default_code = "conflict"
