from django.urls import include, path
from rest_framework.routers import SimpleRouter

from accounts.views import LoginView, MeView
from orders.views import OrderViewSet
from payments.views import StripeWebhookView

router = SimpleRouter(trailing_slash=False)
router.register("orders", OrderViewSet, basename="order")

urlpatterns = [
    path("api/auth/login", LoginView.as_view()),
    path("api/users/me", MeView.as_view()),
    path("api/webhooks/stripe", StripeWebhookView.as_view()),
    path("api/", include(router.urls)),
]
