"""Replacing a secret's value from CDK.

Raising a stage's `secrets_generation` (infra/app.py) makes its next deploy
write fresh random values into the secret. They are generated inside the Lambda
below and go straight to Secrets Manager, so nobody, the deployer included,
ever sees them.

A consumer's `{{resolve:secretsmanager:…}}` reference is read again only when
that resource itself changes, so every consumer also carries the generation
(SECRETS_GENERATION) and depends on the rotation. The Next.js app inlines the
values at build time (`env` in next.config.ts): a stage switches over with the
first Amplify build after the deploy, and that build signs everyone out.
"""
import textwrap

from aws_cdk import (
    CustomResource,
    Duration,
    Stack,
    aws_iam as iam,
    aws_lambda as lambda_,
    custom_resources as cr,
)
from constructs import Construct

from stacks.log_retention import expire_lambda_logs


def rotate_secret(
    scope: Construct,
    construct_id: str,
    *,
    secret_name: str,
    generation: int,
    json_keys: list[str] | None = None,
) -> CustomResource:
    """A new value whenever `generation` changes (and on create): one random
    hex string, or a JSON object with one per key in `json_keys`."""
    stack = Stack.of(scope)
    fn = lambda_.Function(
        scope, f"{construct_id}Fn",
        runtime=lambda_.Runtime.PYTHON_3_12,
        handler="index.handler",
        timeout=Duration.seconds(30),
        code=lambda_.Code.from_inline(textwrap.dedent('''
            import json, secrets, boto3
            sm = boto3.client("secretsmanager")
            def handler(event, context):
                props = event["ResourceProperties"]
                name = props["SecretName"]
                old = event.get("OldResourceProperties", {}).get("Generation")
                if event["RequestType"] != "Delete" and props["Generation"] != old:
                    keys = props.get("JsonKeys") or []
                    value = (json.dumps({k: secrets.token_hex(32) for k in keys})
                             if keys else secrets.token_hex(32))
                    sm.put_secret_value(SecretId=name, SecretString=value)
                # Delete leaves the secret alone: it belongs to the stack that made it.
                return {"PhysicalResourceId": name}
        ''')),
    )
    fn.add_to_role_policy(iam.PolicyStatement(
        actions=["secretsmanager:PutSecretValue"],
        # Secrets Manager appends six random characters to the name.
        resources=[f"arn:aws:secretsmanager:{stack.region}:{stack.account}:secret:{secret_name}-*"],
    ))
    expire_lambda_logs(fn)

    provider = cr.Provider(scope, f"{construct_id}Provider", on_event_handler=fn)
    expire_lambda_logs(provider.node.find_child("framework-onEvent"))

    return CustomResource(
        scope, construct_id,
        service_token=provider.service_token,
        resource_type="Custom::SecretRotation",
        properties={
            "SecretName": secret_name,
            "Generation": str(generation),
            "JsonKeys": json_keys or [],
        },
    )
