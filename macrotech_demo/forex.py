from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal


SUPPORTED = {"PHP", "USD", "EUR"}


def current_php_rate(currency: str) -> dict[str, str]:
    currency = str(currency or "").upper()
    if currency not in SUPPORTED:
        raise ValueError("Currency must be PHP, USD, or EUR.")
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    if currency == "PHP":
        return {"currency": "PHP", "rate": "1", "source": "PHP base currency", "retrievedAt": now}
    providers = [
        (f"https://open.er-api.com/v6/latest/{currency}", "Open Exchange Rate API", lambda data: data.get("rates", {}).get("PHP")),
        (f"https://api.frankfurter.app/latest?from={currency}&to=PHP", "Frankfurter / ECB reference", lambda data: data.get("rates", {}).get("PHP")),
    ]
    errors = []
    for url, source, extractor in providers:
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "Macrotech-Quotation-Pilot/0.6"})
            with urllib.request.urlopen(request, timeout=8) as response:
                data = json.loads(response.read().decode("utf-8"))
            rate = Decimal(str(extractor(data)))
            if not rate.is_finite() or rate <= 0:
                raise ValueError("non-positive rate")
            return {"currency": currency, "rate": str(rate.quantize(Decimal("0.000001"))).rstrip("0").rstrip("."), "source": source, "retrievedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"), "providerUpdatedAt": str(data.get("time_last_update_utc") or data.get("date") or "Not provided")}
        except Exception as exc:
            errors.append(f"{source}: {exc}")
    raise RuntimeError("Online forex is temporarily unavailable. Enter the rate manually; quotation work remains available. " + " | ".join(errors))
