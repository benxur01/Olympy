"""Custom DRF pagination classes.

Default `PageNumberPagination` does not honor the `?page_size=` query
parameter (the frontend silently capped at server default of 50). For
list endpoints that need bigger pages (olympiads index — frontend asks
for 200 to render the full grid in one shot) we expose a configurable
page size with a hard ceiling.
"""

from rest_framework.pagination import PageNumberPagination


class LargePageNumberPagination(PageNumberPagination):
    """Page size driven by `?page_size=` up to ``max_page_size``.

    Used for endpoints where the frontend renders the full list (e.g.
    olympiad cards) and so wants to avoid multiple round-trips.
    """

    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200
