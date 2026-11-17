from rest_framework.views import exception_handler


def _flatten(data):
    if isinstance(data, dict):
        parts = []
        for k, v in data.items():
            msg = _flatten(v)
            parts.append(msg if k in ("detail", "non_field_errors") else f"{k}: {msg}")
        return "; ".join(parts)
    if isinstance(data, (list, tuple)):
        return "; ".join(_flatten(x) for x in data)
    return str(data)


def api_exception_handler(exc, context):
    """Adds a single human-readable "error" string to every API error (the frontend shows it)."""
    response = exception_handler(exc, context)
    if response is not None:
        original = response.data
        message = _flatten(original)
        response.data = {**original, "error": message} if isinstance(original, dict) else {"error": message}
    return response
