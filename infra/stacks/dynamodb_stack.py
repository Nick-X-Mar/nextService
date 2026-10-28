from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    aws_dynamodb as dynamodb,
)
from constructs import Construct


class DynamoDBStack(Stack):
    """All DynamoDB tables for NextService."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── Clients ──────────────────────────────────────────────
        self.clients_table = dynamodb.Table(
            self, "ClientsTable",
            table_name="Clients",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.clients_table.add_global_secondary_index(
            index_name="EmailIndex",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.clients_table.add_global_secondary_index(
            index_name="PhoneIndex",
            partition_key=dynamodb.Attribute(
                name="phoneNumber", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── Garages ──────────────────────────────────────────────
        self.garages_table = dynamodb.Table(
            self, "GaragesTable",
            table_name="Garages",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.garages_table.add_global_secondary_index(
            index_name="TINIndex",
            partition_key=dynamodb.Attribute(
                name="tin", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.garages_table.add_global_secondary_index(
            index_name="MobileIndex",
            partition_key=dynamodb.Attribute(
                name="mobile", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        # Garage login and email-existence checks look users up by email. Without
        # this index they fall back to a full table scan on every attempt, which
        # is both a latency cost and an unauthenticated cost-amplification lever.
        # Clients already has the equivalent EmailIndex.
        #
        # NOTE: the code paths in `api/auth/login` and `api/auth/check-email`
        # still scan the Garages table — switch them to query this index once
        # the stack has been deployed and the index is ACTIVE.
        self.garages_table.add_global_secondary_index(
            index_name="EmailIndex",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── Vehicles ────────────────────────────────────────────
        self.vehicles_table = dynamodb.Table(
            self, "VehiclesTable",
            table_name="Vehicles",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.vehicles_table.add_global_secondary_index(
            index_name="ClientVehiclesIndex",
            partition_key=dynamodb.Attribute(
                name="clientId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.vehicles_table.add_global_secondary_index(
            index_name="VINIndex",
            partition_key=dynamodb.Attribute(
                name="vinNumber", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── ServiceRequests ─────────────────────────────────────
        # Stream is consumed by the NotificationsStack Lambda to broadcast
        # new requests to active garages. NEW_IMAGE is enough — we only need
        # the newly inserted row.
        self.service_requests_table = dynamodb.Table(
            self, "ServiceRequestsTable",
            table_name="ServiceRequests",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
            stream=dynamodb.StreamViewType.NEW_IMAGE,
        )
        self.service_requests_table.add_global_secondary_index(
            index_name="ClientRequestsIndex",
            partition_key=dynamodb.Attribute(
                name="clientId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.service_requests_table.add_global_secondary_index(
            index_name="VehicleRequestsIndex",
            partition_key=dynamodb.Attribute(
                name="vehicleId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.service_requests_table.add_global_secondary_index(
            index_name="StatusIndex",
            partition_key=dynamodb.Attribute(
                name="status", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── Offers ──────────────────────────────────────────────
        self.offers_table = dynamodb.Table(
            self, "OffersTable",
            table_name="Offers",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.offers_table.add_global_secondary_index(
            index_name="ServiceRequestOffersIndex",
            partition_key=dynamodb.Attribute(
                name="serviceRequestId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.offers_table.add_global_secondary_index(
            index_name="GarageOffersIndex",
            partition_key=dynamodb.Attribute(
                name="garageId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.offers_table.add_global_secondary_index(
            index_name="StatusIndex",
            partition_key=dynamodb.Attribute(
                name="status", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="createdAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── ChatMessages ────────────────────────────────────────
        self.chat_messages_table = dynamodb.Table(
            self, "ChatMessagesTable",
            table_name="ChatMessages",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.chat_messages_table.add_global_secondary_index(
            index_name="RequestMessagesIndex",
            partition_key=dynamodb.Attribute(
                name="requestId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        self.chat_messages_table.add_global_secondary_index(
            index_name="SenderMessagesIndex",
            partition_key=dynamodb.Attribute(
                name="senderId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )
        # "Every thread this garage is in" — the garage chats list and the
        # notification summary both need it. Without this index they fall back to
        # a filtered scan of the whole ChatMessages table, which was already the
        # slowest read in the app (p95 ~3.5s on a near-empty dataset) and gets
        # worse with every message anyone sends.
        #
        # Note `garageId` is absent on some older client-authored rows; those
        # simply do not appear in the index, which is correct — a message with no
        # garage does not belong to any garage's thread list.
        self.chat_messages_table.add_global_secondary_index(
            index_name="GarageMessagesIndex",
            partition_key=dynamodb.Attribute(
                name="garageId", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="timestamp", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── AdminUsers ──────────────────────────────────────────
        self.admin_users_table = dynamodb.Table(
            self, "AdminUsersTable",
            table_name="AdminUsers",
            partition_key=dynamodb.Attribute(
                name="adminId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.admin_users_table.add_global_secondary_index(
            index_name="EmailIndex",
            partition_key=dynamodb.Attribute(
                name="email", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── ErrorResolutions ────────────────────────────────────
        # Stores resolution state for grouped error fingerprints surfaced
        # in the admin Errors page. Raw error events stay in CloudWatch;
        # this table just records which fingerprints have been marked
        # resolved/ignored so they can be hidden from the open list.
        self.error_resolutions_table = dynamodb.Table(
            self, "ErrorResolutionsTable",
            table_name="ErrorResolutions",
            partition_key=dynamodb.Attribute(
                name="fingerprint", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
        )
        self.error_resolutions_table.add_global_secondary_index(
            index_name="StatusIndex",
            partition_key=dynamodb.Attribute(
                name="status", type=dynamodb.AttributeType.STRING
            ),
            sort_key=dynamodb.Attribute(
                name="resolvedAt", type=dynamodb.AttributeType.STRING
            ),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── Tables the app used to create itself ────────────────
        # These were created at runtime by src/utils/ensure*Table.ts, so they
        # had no backups and nothing kept them in step with the code. The ones
        # that existed were imported into this stack as they stood
        # (`cdk import`, 2026-10-28); their shape here must keep matching the
        # code's. In AWS the app can no longer create tables (see the Amplify
        # role) — the ensure*Table helpers create them for DynamoDB Local only.
        S = dynamodb.AttributeType.STRING
        N = dynamodb.AttributeType.NUMBER

        self.event_logs_table = self._app_table(
            "EventLogsTable", "EventLogs", ("eventId", S), ttl="expiresAt",
            indexes=[
                ("GarageTimelineIndex", ("garageId", S), ("timestamp", S)),
                ("RequestTimelineIndex", ("requestId", S), ("timestamp", S)),
                ("ClientTimelineIndex", ("clientId", S), ("timestamp", S)),
                ("EventNameIndex", ("eventName", S), ("timestamp", S)),
            ],
        )
        self.email_logs_table = self._app_table(
            "EmailLogsTable", "EmailLogs", ("emailId", S), ttl="expiresAt",
            indexes=[
                ("StatusIndex", ("status", S), ("sentAt", S)),
                ("TemplateIndex", ("templateName", S), ("sentAt", S)),
                ("RecipientIndex", ("to", S), ("sentAt", S)),
            ],
        )
        self.hot_deals_table = self._app_table("HotDealsTable", "HotDeals", ("dealId", S))
        self.payments_table = self._app_table(
            "PaymentsTable", "Payments", ("paymentId", S), ttl="expiresAt",
            indexes=[
                ("ClientPaymentsIndex", ("clientId", S), ("createdAt", S)),
                ("RequestPaymentIndex", ("requestId", S), ("createdAt", S)),
                ("GaragePaymentsIndex", ("garageId", S), ("createdAt", S)),
            ],
        )
        self.performance_table = self._app_table(
            "PerformanceMetricsTable", "PerformanceMetrics", ("endpoint", S), sort=("timestamp", S),
            indexes=[("StatusCodeIndex", ("statusCode", N), ("timestamp", S))],
        )
        self.site_content_table = self._app_table("SiteContentTable", "SiteContent", ("pageKey", S))
        # Never created in AWS before payments were switched on; the stack makes it.
        self.wallet_transactions_table = self._app_table(
            "WalletTransactionsTable", "WalletTransactions", ("transactionId", S), ttl="expiresAt",
            indexes=[("ClientWalletIndex", ("clientId", S), ("createdAt", S))],
        )
        self.reviews_table = self._app_table(
            "ReviewsTable", "Reviews", ("reviewId", S),
            indexes=[
                ("RequestReviewsIndex", ("requestId", S), ("createdAt", S)),
                ("ClientReviewsIndex", ("clientId", S), ("createdAt", S)),
                ("GarageReviewsIndex", ("garageId", S), ("createdAt", S)),
            ],
        )

        # ── Outputs ─────────────────────────────────────────────
        tables = {
            "Clients": self.clients_table,
            "Garages": self.garages_table,
            "Vehicles": self.vehicles_table,
            "ServiceRequests": self.service_requests_table,
            "Offers": self.offers_table,
            "ChatMessages": self.chat_messages_table,
            "AdminUsers": self.admin_users_table,
            "ErrorResolutions": self.error_resolutions_table,
        }
        for name, table in tables.items():
            CfnOutput(self, f"{name}TableArn",
                       value=table.table_arn,
                       export_name=f"NextService-{name}TableArn")

        CfnOutput(self, "ServiceRequestsStreamArn",
                  value=self.service_requests_table.table_stream_arn or "",
                  export_name="NextService-ServiceRequestsStreamArn")

    def _app_table(
        self,
        construct_id: str,
        table_name: str,
        partition: tuple,
        *,
        sort: tuple | None = None,
        indexes: list | None = None,
        ttl: str | None = None,
    ) -> dynamodb.Table:
        """One of the tables the app used to create for itself, as it exists."""
        table = dynamodb.Table(
            self, construct_id,
            table_name=table_name,
            partition_key=dynamodb.Attribute(name=partition[0], type=partition[1]),
            sort_key=dynamodb.Attribute(name=sort[0], type=sort[1]) if sort else None,
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
            # DynamoDB itself refuses DeleteTable until this is switched off —
            # by console, CLI or code alike.
            deletion_protection=True,
            point_in_time_recovery_specification=dynamodb.PointInTimeRecoverySpecification(
                point_in_time_recovery_enabled=True,
            ),
            time_to_live_attribute=ttl,
        )
        for name, pk, sk in indexes or []:
            table.add_global_secondary_index(
                index_name=name,
                partition_key=dynamodb.Attribute(name=pk[0], type=pk[1]),
                sort_key=dynamodb.Attribute(name=sk[0], type=sk[1]),
                projection_type=dynamodb.ProjectionType.ALL,
            )
        return table
