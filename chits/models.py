from django.conf import settings
from django.db import models

class ChitGroup(models.Model):
    name = models.CharField(max_length=80, unique=True)  # e.g. Sri Brunda Group 1
    duration_months = models.PositiveSmallIntegerField(default=20, choices=[(20, "20 months"), (24, "24 months"), (30, "30 months")])
    capacity = models.PositiveSmallIntegerField(default=20)
    is_active = models.BooleanField(default=True)
    def __str__(self): return self.name

class Customer(models.Model):
    STATUS = [("Active", "Active"), ("Defaulter", "Defaulter"), ("Completed", "Completed")]
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20)
    id_number = models.CharField(max_length=40, blank=True)  # Optional ID; restrict access in production.
    address = models.TextField(blank=True)
    chit_group = models.ForeignKey(ChitGroup, on_delete=models.PROTECT, related_name="customers")
    chit_plan = models.CharField(max_length=30, blank=True)  # e.g. 1 Lakh, 2 Lakhs
    joined_on = models.DateField()
    chit_value = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    monthly_installment = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    lifted_month = models.PositiveSmallIntegerField(null=True, blank=True)
    status = models.CharField(max_length=12, choices=STATUS, default="Active")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    def __str__(self): return f"{self.name} ({self.phone})"

class ChitPayment(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE, related_name="payments")
    installment_no = models.PositiveSmallIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_at = models.DateTimeField()
    receipt_number = models.CharField(max_length=40, unique=True)
    notes = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True)
    class Meta:
        ordering = ["installment_no"]
        constraints = [models.UniqueConstraint(fields=["customer", "installment_no"], name="unique_customer_installment")]
    def __str__(self): return self.receipt_number

class HandLoan(models.Model):
    STATUS = [("Running", "Running"), ("Closed", "Closed")]
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    interest_rate_monthly = models.DecimalField(max_digits=6, decimal_places=2)
    status = models.CharField(max_length=10, choices=STATUS, default="Running")
    start_date = models.DateField()
    end_date = models.DateField()
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f"{self.name} - {self.amount}"


class WeeklyLoan(models.Model):
    """Loan repaid in equal weekly installments (simple interest: rate % per week on the principal)."""
    STATUS = [("Running", "Running"), ("Closed", "Closed")]
    name = models.CharField(max_length=150)
    phone = models.CharField(max_length=20, blank=True)
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    interest_rate_weekly = models.DecimalField(max_digits=6, decimal_places=2, default=0)
    weeks = models.PositiveSmallIntegerField(default=10)
    weekly_installment = models.DecimalField(max_digits=12, decimal_places=2, default=0)  # (amount + interest) / weeks
    start_date = models.DateField()  # week 1 is due 7 days after this date
    status = models.CharField(max_length=10, choices=STATUS, default="Running")
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    def __str__(self): return f"{self.name} - {self.amount} ({self.weeks} weeks)"


class WeeklyLoanPayment(models.Model):
    loan = models.ForeignKey(WeeklyLoan, on_delete=models.CASCADE, related_name="payments")
    week_no = models.PositiveSmallIntegerField()
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    paid_on = models.DateField()
    class Meta:
        ordering = ["week_no"]
        constraints = [models.UniqueConstraint(fields=["loan", "week_no"], name="unique_weekly_loan_week")]
    def __str__(self): return f"{self.loan_id} week {self.week_no}"
