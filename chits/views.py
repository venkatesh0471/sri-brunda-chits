from django.db.models import Count
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import ChitGroup, Customer, ChitPayment, HandLoan
from .serializers import ChitGroupSerializer, CustomerSerializer, ChitPaymentSerializer, HandLoanSerializer

class ChitGroupViewSet(viewsets.ModelViewSet):
    queryset = ChitGroup.objects.annotate(member_count=Count("customers")).order_by("name")
    serializer_class = ChitGroupSerializer
    permission_classes = [IsAuthenticated]

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.select_related("chit_group").prefetch_related("payments").order_by("-created_at")
    serializer_class = CustomerSerializer
    permission_classes = [IsAuthenticated]
    def get_queryset(self):
        qs = super().get_queryset()
        status = self.request.query_params.get("status")
        group = self.request.query_params.get("group")
        search = self.request.query_params.get("search")
        if status: qs = qs.filter(status=status)
        if group: qs = qs.filter(chit_group_id=group)
        if search: qs = qs.filter(name__icontains=search) | qs.filter(phone__icontains=search)
        return qs

class ChitPaymentViewSet(viewsets.ModelViewSet):
    queryset = ChitPayment.objects.select_related("customer").all()
    serializer_class = ChitPaymentSerializer
    permission_classes = [IsAuthenticated]
    def perform_create(self, serializer): serializer.save(created_by=self.request.user)
    def get_queryset(self):
        qs = super().get_queryset()
        customer = self.request.query_params.get("customer")
        if customer: qs = qs.filter(customer_id=customer)
        return qs

class HandLoanViewSet(viewsets.ModelViewSet):
    queryset = HandLoan.objects.all().order_by("-created_at")
    serializer_class = HandLoanSerializer
    permission_classes = [IsAuthenticated]
