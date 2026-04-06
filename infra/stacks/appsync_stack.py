import datetime

from aws_cdk import (
    Stack,
    CfnOutput,
    Fn,
    aws_appsync as appsync,
)
from constructs import Construct


class AppSyncStack(Stack):
    """AppSync Events API for real-time chat."""

    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # AppSync Events API (pub/sub channels, not GraphQL)
        self.events_api = appsync.CfnApi(
            self, "ChatEventsApi",
            name="nextservice-chat-events",
            event_config=appsync.CfnApi.EventConfigProperty(
                auth_providers=[
                    appsync.CfnApi.AuthProviderProperty(
                        auth_type="API_KEY",
                    ),
                ],
                connection_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
                default_publish_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
                default_subscribe_auth_modes=[
                    appsync.CfnApi.AuthModeProperty(auth_type="API_KEY"),
                ],
            ),
        )

        # API Key (valid for 365 days)
        expires_at = datetime.datetime.now() + datetime.timedelta(days=365)
        self.api_key = appsync.CfnApiKey(
            self, "ChatApiKey",
            api_id=self.events_api.attr_api_id,
            description="NextService chat events API key",
            expires=int(expires_at.timestamp()),
        )

        # Channel namespace — all channels go under /default/*
        self.channel_namespace = appsync.CfnChannelNamespace(
            self, "DefaultNamespace",
            api_id=self.events_api.attr_api_id,
            name="default",
        )

        # DNS endpoints are derived from API ID:
        #   HTTP:      {apiId}.appsync-api.{region}.amazonaws.com
        #   Realtime:  {apiId}.appsync-realtime-api.{region}.amazonaws.com
        api_id = self.events_api.attr_api_id
        region = self.region

        self.http_endpoint = f"{api_id}.appsync-api.{region}.amazonaws.com"
        self.realtime_endpoint = f"{api_id}.appsync-realtime-api.{region}.amazonaws.com"

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "AppSyncApiId",
                  value=api_id,
                  export_name="NextService-AppSyncApiId")
        CfnOutput(self, "AppSyncHttpEndpoint",
                  value=self.http_endpoint,
                  export_name="NextService-AppSyncHttpEndpoint")
        CfnOutput(self, "AppSyncRealtimeEndpoint",
                  value=self.realtime_endpoint,
                  export_name="NextService-AppSyncRealtimeEndpoint")
        CfnOutput(self, "AppSyncApiKey",
                  value=self.api_key.attr_api_key,
                  export_name="NextService-AppSyncApiKey")
