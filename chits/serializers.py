from rest_framework import serializers
from .models import ChitGroup, Customer, ChitPayment, HandLoan

class ChitGroupSerializer(serializers.ModelSerializer):
    member_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = ChitGroup
        fields = "__all__"

class ChitPaymentSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChitPayment
        fields = "__all__"
        read_only_fields = ["created_by"]

class CustomerSerializer(serializers.ModelSerializer):
    paid_count = serializers.SerializerMethodField()
    paid_total = serializers.SerializerMethodField()
    due_balance = serializers.SerializerMethodField()
    class Meta:
        model = Customer
        fields = "__all__"
    def get_paid_count(self, obj): return obj.payments.count()
    def get_paid_total(self, obj):
        return sum((p.amount for p in obj.payments.all()), start=0)
    def get_due_balance(self, obj):
        from decimal import Decimal
        return max(Decimal("0"), obj.monthly_installment * obj.chit_group.duration_months - sum((p.amount for p in obj.payments.all()), start=Decimal("0")))

class HandLoanSerializer(serializers.ModelSerializer):
    interest_amount = serializers.SerializerMethodField()
    total_payable = serializers.SerializerMethodField()
    class Meta:
        model = HandLoan
        fields = "__all__"
    def get_interest_amount(self, obj):
        months = max(0, (obj.end_date.year - obj.start_date.year) * 12 + obj.end_date.month - obj.start_date.month)
        return obj.amount * obj.interest_rate_monthly * months / 100
    def get_total_payable(self, obj): return obj.amount + self.get_interest_amount(obj)
