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

        # ── Vehicles ────────────────────────────────────────────
        self.vehicles_table = dynamodb.Table(
            self, "VehiclesTable",
            table_name="Vehicles",
            partition_key=dynamodb.Attribute(
                name="id", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
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

        # ── AdminUsers ──────────────────────────────────────────
        self.admin_users_table = dynamodb.Table(
            self, "AdminUsersTable",
            table_name="AdminUsers",
            partition_key=dynamodb.Attribute(
                name="adminId", type=dynamodb.AttributeType.STRING
            ),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
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

        # ── Outputs ─────────────────────────────────────────────
        tables = {
            "Clients": self.clients_table,
            "Garages": self.garages_table,
            "Vehicles": self.vehicles_table,
            "ServiceRequests": self.service_requests_table,
            "Offers": self.offers_table,
            "ChatMessages": self.chat_messages_table,
            "AdminUsers": self.admin_users_table,
        }
        for name, table in tables.items():
            CfnOutput(self, f"{name}TableArn",
                       value=table.table_arn,
                       export_name=f"NextService-{name}TableArn")

        CfnOutput(self, "ServiceRequestsStreamArn",
                  value=self.service_requests_table.table_stream_arn or "",
                  export_name="NextService-ServiceRequestsStreamArn")
