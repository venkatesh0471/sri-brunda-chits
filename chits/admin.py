from django.contrib import admin
from .models import ChitGroup, Customer, ChitPayment, HandLoan
admin.site.register(ChitGroup)
admin.site.register(Customer)
admin.site.register(ChitPayment)
admin.site.register(HandLoan)
