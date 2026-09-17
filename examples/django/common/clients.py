import json

import requests
import stripe
from django.conf import settings

stripe.api_key = settings.STRIPE_SECRET_KEY


def send_template(template, to, variables):
    response = requests.post(
        f"https://api.mailgun.net/v3/{settings.MAILGUN_DOMAIN}/messages",
        auth=("api", settings.MAILGUN_API_KEY),
        data={"to": to, "template": template, "h:X-Mailgun-Variables": json.dumps(variables)},
        timeout=10,
    )
    response.raise_for_status()
