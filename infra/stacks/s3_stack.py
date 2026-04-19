from aws_cdk import (
    Stack,
    RemovalPolicy,
    CfnOutput,
    Duration,
    aws_s3 as s3,
)
from constructs import Construct


class S3Stack(Stack):
    """S3 bucket for photo uploads."""

    def __init__(self, scope: Construct, construct_id: str, *, bucket_name: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        self.uploads_bucket = s3.Bucket(
            self, "UploadsBucket",
            bucket_name=bucket_name,
            removal_policy=RemovalPolicy.RETAIN,
            # Block all public access — photos served via presigned URLs
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            object_ownership=s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
            cors=[
                s3.CorsRule(
                    allowed_headers=["*"],
                    allowed_methods=[
                        s3.HttpMethods.GET,
                        s3.HttpMethods.PUT,
                        s3.HttpMethods.POST,
                        s3.HttpMethods.HEAD,
                    ],
                    allowed_origins=[
                        "https://nextservice.gr",
                        "https://www.nextservice.gr",
                        "http://localhost:3000",
                    ],
                    exposed_headers=["ETag"],
                    max_age=3000,
                )
            ],
            # Lifecycle: move old photos to cheaper storage after 90 days
            lifecycle_rules=[
                s3.LifecycleRule(
                    id="ArchiveOldPhotos",
                    transitions=[
                        s3.Transition(
                            storage_class=s3.StorageClass.INFREQUENT_ACCESS,
                            transition_after=Duration.days(90),
                        ),
                    ],
                ),
            ],
            versioned=False,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )

        # No public access — photos are served via presigned URLs

        # ── Outputs ─────────────────────────────────────────────
        CfnOutput(self, "BucketName",
                  value=self.uploads_bucket.bucket_name,
                  export_name="NextService-S3BucketName")
        CfnOutput(self, "BucketArn",
                  value=self.uploads_bucket.bucket_arn,
                  export_name="NextService-S3BucketArn")
        CfnOutput(self, "BucketDomainName",
                  value=self.uploads_bucket.bucket_regional_domain_name,
                  export_name="NextService-S3BucketDomain")
