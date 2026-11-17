from rest_framework.routers import DefaultRouter
from .views import ChitGroupViewSet, CustomerViewSet, ChitPaymentViewSet, HandLoanViewSet
router = DefaultRouter()
router.register("groups", ChitGroupViewSet)
router.register("customers", CustomerViewSet)
router.register("payments", ChitPaymentViewSet)
router.register("hand-loans", HandLoanViewSet)
urlpatterns = router.urls
