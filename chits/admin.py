from django.contrib import admin
from .models import ChitGroup, Customer, ChitPayment, HandLoan, WeeklyLoan, WeeklyLoanPayment
admin.site.register(ChitGroup)
admin.site.register(Customer)
admin.site.register(ChitPayment)
admin.site.register(HandLoan)
admin.site.register(WeeklyLoan)
admin.site.register(WeeklyLoanPayment)
