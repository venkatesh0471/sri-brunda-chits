from django.apps import AppConfig
from django.db.models.signals import post_migrate


def _seed_groups(sender, **kwargs):
    from .app_api import ensure_groups
    ensure_groups()


class ChitsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "chits"

    def ready(self):
        # after "migrate", make sure Sri Brunda Group 1..26 exist
        post_migrate.connect(_seed_groups, sender=self)
