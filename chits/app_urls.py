from django.urls import path
from . import app_api as v

urlpatterns = [
    path("bootstrap/", v.Bootstrap.as_view()),
    path("customers/", v.CustomerCreate.as_view()),
    path("customers/<int:pk>/", v.CustomerDetail.as_view()),
    path("customers/<int:pk>/payments/<int:month>/", v.PaymentDetail.as_view()),
    path("groups/<str:name>/", v.GroupMonths.as_view()),
    path("loans/", v.LoanCreate.as_view()),
    path("loans/<int:pk>/", v.LoanDetail.as_view()),
    path("weekly/", v.WeeklyCreate.as_view()),
    path("weekly/<int:pk>/", v.WeeklyDetail.as_view()),
    path("weekly/<int:pk>/payments/<int:week>/", v.WeeklyPayment.as_view()),
    path("backup/", v.Backup.as_view()),
    path("restore/", v.Restore.as_view()),
]
