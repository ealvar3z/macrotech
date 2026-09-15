"""Private, explicit-input standard ACTUAL profit worksheet.
No import, Tracker write, customer-price change, or commission payout.
Manual exceptions must be reconciled before calling a result actual profit.
"""
from decimal import Decimal
from .domain import money

INPUTS = ("sale_vat_in", "landed_cost", "trucking", "manpower", "gas_toll", "other_costs", "abc_total", "sr_percent", "override_percent", "admin_percent")

def calculate_profit(values):
    amounts = {}
    for name in INPUTS:
        if name not in values or str(values[name]).strip() == "":
            raise ValueError(f"Enter {name}; use 0 only when confirmed not applicable.")
        try:
            value = Decimal(str(values[name]))
        except Exception:
            raise ValueError(f"{name} must be numeric.") from None
        if not value.is_finite() or value < 0:
            raise ValueError(f"{name} must be finite and nonnegative.")
        if name.endswith("_percent") and value > 100:
            raise ValueError("Commission percentages cannot exceed 100%.")
        amounts[name] = value
    gp = amounts["sale_vat_in"] - amounts["landed_cost"]
    tax = amounts["sale_vat_in"] * Decimal(".12")
    subnet = gp - tax - sum(amounts[k] for k in ("trucking", "manpower", "gas_toll", "other_costs", "abc_total"))
    sr = subnet * amounts["sr_percent"] / 100
    override = subnet * amounts["override_percent"] / 100
    admin = subnet * amounts["admin_percent"] / 100
    net = subnet - sr - override - admin
    return {k: str(money(v)) for k,v in dict(gross_profit=gp,tracker_tax_allowance=tax,subnet=subnet,sales_commission=sr,overriding_commission=override,admin_commission=admin,net=net).items()}
