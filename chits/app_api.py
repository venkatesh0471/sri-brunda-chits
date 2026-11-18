"""
Endpoints used by the website (/api/app/...).

They sit on top of the same models as the standard REST endpoints (groups, customers,
payments, hand-loans) but speak the shape the frontend uses (one "pay" map per customer, etc.),
so every number typed in the page is saved in the Django database.
"""
import datetime as dt
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import ChitGroup, ChitPayment, Customer, HandLoan, WeeklyLoan, WeeklyLoanPayment

GCOUNT = 26
MONTH_OPTIONS = (20, 24, 30)
UNASSIGNED = "Unassigned"          # only used for imported records that had no valid group
CUSTOMER_STATUS = [s for s, _ in Customer.STATUS]
LOAN_STATUS = [s for s, _ in HandLoan.STATUS]
MAX_WEEKS = 200


def bad(msg):
    return ValidationError(msg)


def group_name(i):
    return f"Sri Brunda Group {i}"


def ensure_groups():
    names = [group_name(i) for i in range(1, GCOUNT + 1)]
    have = set(ChitGroup.objects.filter(name__in=names).values_list("name", flat=True))
    missing = [ChitGroup(name=n, duration_months=20, capacity=20) for n in names if n not in have]
    if missing:
        ChitGroup.objects.bulk_create(missing)


def receipt_no(customer_pk, month):
    # the frontend builds the same text, so receipts sent on WhatsApp match the database
    return "SBC-%s-%02d" % (str(customer_pk).zfill(4), month)


# ---------------------------------------------------------------- cleaning helpers
def s(v, n=500):
    return ("" if v is None else str(v)).strip()[:n]


def money(v, label):
    try:
        d = Decimal(str(0 if v in (None, "") else v))
    except InvalidOperation:
        raise bad(f"{label} must be a number")
    if not d.is_finite() or d < 0 or d >= Decimal("1e10"):
        raise bad(f"{label} must be a positive number")
    return d.quantize(Decimal("0.01"))


def to_date(v, label):
    t = s(v, 10)
    try:
        if len(t) != 10:
            raise ValueError
        return dt.date.fromisoformat(t)
    except ValueError:
        raise bad(f"{label} must be a valid date (YYYY-MM-DD)")


def paid_datetime(d):
    """Date only -> noon local time (the page only records the day)."""
    return timezone.make_aware(dt.datetime.combine(d, dt.time(12, 0)))


def get_group(name, lenient):
    name = s(name, 80)
    if name:
        g = ChitGroup.objects.filter(name=name).first()
        if g:
            return g
        if not lenient:
            raise bad("Unknown group")
    elif not lenient:
        raise bad("Please select a Sri Brunda group")
    g, _ = ChitGroup.objects.get_or_create(name=UNASSIGNED, defaults={"duration_months": 20, "capacity": 20})
    return g


def clean_customer(d, lenient=False, warnings=None):
    """lenient = importing old data: repair small problems instead of rejecting the record."""
    if not isinstance(d, dict):
        raise bad("Invalid customer data")
    name, phone = s(d.get("name"), 150), s(d.get("phone"), 20)
    if not name:
        raise bad("Name is required")
    if not phone and not lenient:
        raise bad("Phone is required")
    group = get_group(d.get("batch"), lenient)
    status = s(d.get("status"), 12) or "Active"
    if status not in CUSTOMER_STATUS:
        if not lenient:
            raise bad("Invalid status")
        status = "Active"
    try:
        joined = to_date(d.get("joined"), "Join date")
    except ValidationError:
        if not lenient:
            raise
        joined = timezone.localdate()
        if warnings is not None:
            warnings.append(f"{name}: join date missing, set to today – please edit")
    try:
        lifted = int(Decimal(str(d.get("lifted") or 0)))
    except (InvalidOperation, ValueError):
        lifted = 0
    if lifted < 0 or lifted > group.duration_months:
        if not lenient:
            raise bad("Lifted month is outside the chit duration")
        lifted = 0
    return dict(
        name=name, phone=phone, id_number=s(d.get("idno"), 40), address=s(d.get("address"), 1000),
        chit_group=group, chit_plan=s(d.get("group"), 30), joined_on=joined,
        chit_value=money(d.get("value"), "Chit value"), monthly_installment=money(d.get("monthly"), "Monthly installment"),
        lifted_month=lifted or None, status=status, notes=s(d.get("notes"), 2000),
    )


def clean_loan(d):
    if not isinstance(d, dict):
        raise bad("Invalid loan data")
    name = s(d.get("name"), 150)
    if not name:
        raise bad("Name is required")
    amount = money(d.get("amount"), "Amount")
    if amount <= 0:
        raise bad("Loan amount must be greater than zero")
    rate = money(d.get("rate"), "Rate of interest")
    if rate >= Decimal("10000"):
        raise bad("Rate of interest is too large")
    start, end = to_date(d.get("start"), "Start date"), to_date(d.get("end"), "End date")
    if end < start:
        raise bad("End date cannot be before the start date")
    status = s(d.get("status"), 10) or "Running"
    if status not in LOAN_STATUS:
        raise bad("Invalid status")
    return dict(name=name, phone=s(d.get("phone"), 20), amount=amount, interest_rate_monthly=rate,
                start_date=start, end_date=end, status=status, notes=s(d.get("notes"), 2000))


def weekly_installment(amount, rate, weeks):
    """(principal + simple interest of rate % per week for all weeks) / weeks, rounded to whole rupees."""
    total = amount + amount * rate * weeks / Decimal(100)
    return (total / weeks).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def clean_weekly(d):
    if not isinstance(d, dict):
        raise bad("Invalid weekly loan data")
    name = s(d.get("name"), 150)
    if not name:
        raise bad("Name is required")
    amount = money(d.get("amount"), "Amount")
    if amount <= 0:
        raise bad("Loan amount must be greater than zero")
    rate = money(d.get("rate"), "Rate of interest")
    if rate >= Decimal("1000"):
        raise bad("Rate of interest is too large")
    try:
        weeks = int(Decimal(str(d.get("weeks") or 0)))
    except (InvalidOperation, ValueError):
        weeks = 0
    if not 1 <= weeks <= MAX_WEEKS:
        raise bad(f"Number of weeks must be between 1 and {MAX_WEEKS}")
    status = s(d.get("status"), 10) or "Running"
    if status not in LOAN_STATUS:
        raise bad("Invalid status")
    return dict(name=name, phone=s(d.get("phone"), 20), amount=amount, interest_rate_weekly=rate, weeks=weeks,
                weekly_installment=weekly_installment(amount, rate, weeks), start_date=to_date(d.get("start"), "Start date"),
                status=status, notes=s(d.get("notes"), 2000))


# ---------------------------------------------------------------- output shapes
def customer_json(c):
    months = c.chit_group.duration_months
    pay = {
        str(p.installment_no): {"d": timezone.localtime(p.paid_at).date().isoformat(), "a": float(p.amount)}
        for p in c.payments.all()
    }
    return {
        "id": str(c.pk), "name": c.name, "phone": c.phone, "idno": c.id_number, "address": c.address,
        "group": c.chit_plan, "batch": c.chit_group.name, "joined": c.joined_on.isoformat(),
        "value": float(c.chit_value), "monthly": float(c.monthly_installment), "total": months,
        "lifted": c.lifted_month or 0, "status": c.status, "notes": c.notes,
        "pay": pay, "paid": sum(1 for k in pay if int(k) <= months),
        "updated": int(c.updated_at.timestamp() * 1000),
    }


def loan_json(l):
    return {
        "id": str(l.pk), "name": l.name, "phone": l.phone, "amount": float(l.amount),
        "rate": float(l.interest_rate_monthly), "start": l.start_date.isoformat(), "end": l.end_date.isoformat(),
        "status": l.status, "notes": l.notes,
    }


def weekly_json(l):
    return {
        "id": str(l.pk), "name": l.name, "phone": l.phone, "amount": float(l.amount),
        "rate": float(l.interest_rate_weekly), "weeks": l.weeks, "installment": float(l.weekly_installment),
        "start": l.start_date.isoformat(), "status": l.status, "notes": l.notes,
        "pay": {str(p.week_no): {"d": p.paid_on.isoformat(), "a": float(p.amount)} for p in l.payments.all()},
    }


def weekly_qs():
    return WeeklyLoan.objects.prefetch_related("payments")


def customers_qs():
    return Customer.objects.select_related("chit_group").prefetch_related("payments")


def group_settings():
    return {g.name: {"months": g.duration_months} for g in ChitGroup.objects.all()}


def snapshot():
    return {
        "customers": [customer_json(c) for c in customers_qs().order_by("name")],
        "loans": [loan_json(l) for l in HandLoan.objects.order_by("end_date")],
        "weekly": [weekly_json(l) for l in weekly_qs().order_by("start_date", "id")],
        "groupSettings": group_settings(),
    }


def customer_or_404(pk):
    c = customers_qs().filter(pk=pk).first()
    if not c:
        raise NotFound("Customer not found")
    return c


# ---------------------------------------------------------------- views
class Bootstrap(APIView):
    def get(self, request):
        ensure_groups()
        return Response(snapshot())


class CustomerCreate(APIView):
    def post(self, request):
        c = Customer.objects.create(**clean_customer(request.data))
        return Response(customer_json(customer_or_404(c.pk)), status=201)


class CustomerDetail(APIView):
    def put(self, request, pk):
        customer_or_404(pk)
        data = clean_customer(request.data)
        Customer.objects.filter(pk=pk).update(**data, updated_at=timezone.now())
        return Response(customer_json(customer_or_404(pk)))

    def delete(self, request, pk):
        c = customer_or_404(pk)
        c.delete()
        return Response({"ok": True})


class PaymentDetail(APIView):
    def put(self, request, pk, month):
        c = customer_or_404(pk)
        if not 1 <= month <= c.chit_group.duration_months:
            raise bad(f"Month must be between 1 and {c.chit_group.duration_months}")
        body = request.data if isinstance(request.data, dict) else {}
        day = to_date(body.get("d"), "Payment date") if s(body.get("d")) else timezone.localdate()
        amount = money(body.get("a"), "Amount")
        rno = receipt_no(c.pk, month)
        ChitPayment.objects.update_or_create(
            customer=c, installment_no=month,
            defaults={"amount": amount, "paid_at": paid_datetime(day)},
            create_defaults={"amount": amount, "paid_at": paid_datetime(day), "receipt_number": rno,
                             "created_by": request.user},
        )
        Customer.objects.filter(pk=pk).update(updated_at=timezone.now())
        return Response({"month": month, "d": day.isoformat(), "a": float(amount), "r": rno})

    def delete(self, request, pk, month):
        customer_or_404(pk)
        ChitPayment.objects.filter(customer_id=pk, installment_no=month).delete()
        Customer.objects.filter(pk=pk).update(updated_at=timezone.now())
        return Response({"ok": True})


class GroupMonths(APIView):
    """Set a group to 20/24/30 months; members' monthly installment becomes chit value / months."""

    @transaction.atomic
    def put(self, request, name):
        ensure_groups()
        g = ChitGroup.objects.filter(name=name).first()
        if not g:
            raise NotFound("Group not found")
        try:
            months = int((request.data or {}).get("months"))
        except (TypeError, ValueError):
            months = 0
        if months not in MONTH_OPTIONS:
            raise bad("Months must be one of " + ", ".join(map(str, MONTH_OPTIONS)))
        g.duration_months, g.capacity = months, months
        g.save(update_fields=["duration_months", "capacity"])
        members = list(g.customers.all())
        for c in members:
            if c.chit_value > 0:
                c.monthly_installment = (c.chit_value / months).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
        Customer.objects.bulk_update(members, ["monthly_installment"])
        return Response({"batch": g.name, "months": months})


class LoanCreate(APIView):
    def post(self, request):
        return Response(loan_json(HandLoan.objects.create(**clean_loan(request.data))), status=201)


class LoanDetail(APIView):
    def _get(self, pk):
        l = HandLoan.objects.filter(pk=pk).first()
        if not l:
            raise NotFound("Loan not found")
        return l

    def put(self, request, pk):
        l = self._get(pk)
        for k, v in clean_loan(request.data).items():
            setattr(l, k, v)
        l.save()
        return Response(loan_json(l))

    def delete(self, request, pk):
        self._get(pk).delete()
        return Response({"ok": True})


def weekly_or_404(pk):
    l = weekly_qs().filter(pk=pk).first()
    if not l:
        raise NotFound("Weekly loan not found")
    return l


class WeeklyCreate(APIView):
    def post(self, request):
        l = WeeklyLoan.objects.create(**clean_weekly(request.data))
        return Response(weekly_json(weekly_or_404(l.pk)), status=201)


class WeeklyDetail(APIView):
    @transaction.atomic
    def put(self, request, pk):
        weekly_or_404(pk)
        data = clean_weekly(request.data)
        WeeklyLoan.objects.filter(pk=pk).update(**data)
        WeeklyLoanPayment.objects.filter(loan_id=pk, week_no__gt=data["weeks"]).delete()  # weeks were reduced
        return Response(weekly_json(weekly_or_404(pk)))

    def delete(self, request, pk):
        weekly_or_404(pk).delete()
        return Response({"ok": True})


class WeeklyPayment(APIView):
    def put(self, request, pk, week):
        l = weekly_or_404(pk)
        if not 1 <= week <= l.weeks:
            raise bad(f"Week must be between 1 and {l.weeks}")
        body = request.data if isinstance(request.data, dict) else {}
        day = to_date(body.get("d"), "Payment date") if s(body.get("d")) else timezone.localdate()
        amount = money(body.get("a") if s(body.get("a")) else l.weekly_installment, "Amount")
        WeeklyLoanPayment.objects.update_or_create(loan=l, week_no=week, defaults={"amount": amount, "paid_on": day})
        return Response({"week": week, "d": day.isoformat(), "a": float(amount)})

    def delete(self, request, pk, week):
        weekly_or_404(pk)
        WeeklyLoanPayment.objects.filter(loan_id=pk, week_no=week).delete()
        return Response({"ok": True})


class Backup(APIView):
    def get(self, request):
        ensure_groups()
        snap = snapshot()
        resp = Response({"version": 2, "exportedAt": timezone.now().isoformat(), "customers": snap["customers"],
                         "handloans": snap["loans"], "weeklyloans": snap["weekly"], "groupSettings": snap["groupSettings"]})
        resp["Content-Disposition"] = 'attachment; filename="sri-brunda-backup-%s.json"' % timezone.localdate().isoformat()
        return resp


class Restore(APIView):
    """
    Replaces ALL customers, payments, hand loans and group durations with the backup.
    Accepts the current backup format, the old browser backup ({customers, handloans}) or a bare list.
    """

    @transaction.atomic
    def post(self, request):
        d = request.data
        if isinstance(d, list):
            cu, hl, gs, wl = d, [], {}, None
        elif isinstance(d, dict):
            cu, hl, gs = d.get("customers"), d.get("handloans") or [], d.get("groupSettings") or {}
            wl = d.get("weeklyloans")      # None = old backup without weekly loans -> keep the existing ones
        else:
            cu, wl = None, None
        if not isinstance(cu, list) or not isinstance(hl, list) or not isinstance(gs, dict) or not (wl is None or isinstance(wl, list)):
            raise bad("That file is not a valid backup")

        ensure_groups()
        warnings = []
        ChitPayment.objects.all().delete()
        Customer.objects.all().delete()
        HandLoan.objects.all().delete()
        ChitGroup.objects.update(duration_months=20, capacity=20)
        for name, st in gs.items():
            try:
                m = int((st or {}).get("months"))
            except (TypeError, ValueError, AttributeError):
                continue
            if m in MONTH_OPTIONS:
                ChitGroup.objects.filter(name=str(name)).update(duration_months=m, capacity=m)

        payments, made = [], 0
        for raw in cu:
            try:
                c = Customer.objects.create(**clean_customer(raw, lenient=True, warnings=warnings))
            except ValidationError as e:
                warnings.append("A customer was skipped: " + "; ".join(str(x) for x in e.detail))
                continue
            made += 1
            months = c.chit_group.duration_months
            pay = raw.get("pay") if isinstance(raw.get("pay"), dict) else None
            if pay is None:       # very old data: "N months paid" -> months 1..N ticked
                try:
                    n = min(int(Decimal(str(raw.get("paid") or 0))), months)
                except (InvalidOperation, ValueError):
                    n = 0
                pay = {str(i): {"d": "", "a": float(c.monthly_installment)} for i in range(1, n + 1)}
            for m, p in pay.items():
                try:
                    mm = int(m)
                    if not 1 <= mm <= months:
                        continue
                    p = p if isinstance(p, dict) else {}
                    try:
                        day = to_date(p.get("d"), "Payment date")
                        when = paid_datetime(day)
                    except ValidationError:
                        when = timezone.now()
                    payments.append(ChitPayment(customer=c, installment_no=mm, amount=money(p.get("a"), "Amount"),
                                                paid_at=when, receipt_number=receipt_no(c.pk, mm),
                                                created_by=request.user))
                except (ValueError, TypeError, ValidationError):
                    continue
        ChitPayment.objects.bulk_create(payments)

        loans = 0
        for raw in hl:
            try:
                HandLoan.objects.create(**clean_loan(raw))
                loans += 1
            except ValidationError as e:
                warnings.append("A hand loan was skipped: " + "; ".join(str(x) for x in e.detail))

        weekly = 0
        if wl is not None:
            WeeklyLoan.objects.all().delete()
            for raw in wl:
                try:
                    loan = WeeklyLoan.objects.create(**clean_weekly(raw))
                except ValidationError as e:
                    warnings.append("A weekly loan was skipped: " + "; ".join(str(x) for x in e.detail))
                    continue
                weekly += 1
                pay = raw.get("pay") if isinstance(raw.get("pay"), dict) else {}
                rows = []
                for w, p in pay.items():
                    try:
                        ww = int(w)
                        p = p if isinstance(p, dict) else {}
                        if not 1 <= ww <= loan.weeks:
                            continue
                        try:
                            day = to_date(p.get("d"), "Payment date")
                        except ValidationError:
                            day = timezone.localdate()
                        rows.append(WeeklyLoanPayment(loan=loan, week_no=ww, paid_on=day,
                                                      amount=money(p.get("a") or loan.weekly_installment, "Amount")))
                    except (ValueError, TypeError, ValidationError):
                        continue
                WeeklyLoanPayment.objects.bulk_create(rows)
        return Response({"ok": True, "customers": made, "loans": loans, "weekly": weekly, "warnings": warnings})
