from django.contrib import admin
from django.urls import include, path
from django.views.decorators.cache import never_cache
from django.views.generic import TemplateView
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView


class LoginView(TokenObtainPairView):
    """POST /api/token/ with username + password. Limited to 10 tries per minute."""
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"


urlpatterns = [
    path("", never_cache(TemplateView.as_view(template_name="chits/app.html")), name="app"),   # the website
    path("admin/", admin.site.urls),
    path("api/token/", LoginView.as_view(), name="token_obtain_pair"),
    path("api/token/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/app/", include("chits.app_urls")),     # used by the website
    path("api/", include("chits.urls")),             # standard REST endpoints
]
