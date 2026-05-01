"""Phone normalization helpers — must mirror the frontend rules in store.jsx.

The platform rule: one phone number = one account. The same number written in
many shapes must be treated as identical.

Examples that all collapse to ``+998901234567``:
    +998 90 123 45 67
    +998901234567
    998901234567
    90 123 45 67
    (90) 123-45-67
"""
import re


def normalize_phone(raw):
    """Return canonical ``+998<9 digits>`` form, or ``''`` if invalid."""
    if raw is None:
        return ''
    digits = re.sub(r'\D', '', str(raw))
    if not digits:
        return ''
    last9 = digits[-9:]
    if len(last9) != 9:
        return ''
    return '+998' + last9
