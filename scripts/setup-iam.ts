/**
 * Attach the S3 inline policy to the Amplify service role so the deployed
 * app can read/write photos to the uploads bucket without long-lived keys.
 *
 * Run once, locally, with credentials that have IAM write permission
 * (iam:PutRolePolicy, iam:GetRole). Safe to re-run — PutRolePolicy is
 * idempotent (creates or overwrites).
 *
 * Usage:
 *   npx tsx scripts/setup-iam.ts
 *
 * Environment variables (optional):
 *   AMPLIFY_ROLE_NAME   - IAM role attached to the Amplify app (default: nextservice-amplify-role)
 *   S3_BUCKET_NAME      - bucket to grant access to (default: nextservice-uploads-staging)
 *   IAM_POLICY_NAME     - name of the inline policy (default: nextservice-s3-access)
 *   REGION              - AWS region (default: eu-central-1)
 */
import {
  IAMClient,
  GetRoleCommand,
  PutRolePolicyCommand,
  NoSuchEntityException,
} from '@aws-sdk/client-iam'
import { fromIni } from '@aws-sdk/credential-provider-ini'
import path from 'path'

const ROLE_NAME = process.env.AMPLIFY_ROLE_NAME || 'nextservice-amplify-role'
const BUCKET = process.env.S3_BUCKET_NAME || 'nextservice-uploads-staging'
const POLICY_NAME = process.env.IAM_POLICY_NAME || 'nextservice-s3-access'
const REGION = process.env.REGION || 'eu-central-1'

const policyDocument = {
  Version: '2012-10-17',
  Statement: [
    {
      Effect: 'Allow',
      Action: [
        's3:PutObject',
        's3:GetObject',
        's3:DeleteObject',
        's3:ListBucket',
      ],
      Resource: [
        `arn:aws:s3:::${BUCKET}`,
        `arn:aws:s3:::${BUCKET}/*`,
      ],
    },
  ],
}

async function main() {
  const iam = new IAMClient({
    region: REGION,
    credentials: fromIni({
      filepath: path.join(process.cwd(), '.aws', 'credentials'),
      configFilepath: path.join(process.cwd(), '.aws', 'config'),
      profile: process.env.AWS_PROFILE || 'default',
    }),
  })

  console.log(`Verifying role '${ROLE_NAME}' exists...`)
  try {
    const res = await iam.send(new GetRoleCommand({ RoleName: ROLE_NAME }))
    console.log(`  Found: ${res.Role?.Arn}`)
  } catch (err) {
    if (err instanceof NoSuchEntityException) {
      console.error(`Role '${ROLE_NAME}' not found in this account/region.`)
      console.error(`Check the Amplify app's service role name and try again.`)
      process.exit(1)
    }
    throw err
  }

  console.log(`Attaching inline policy '${POLICY_NAME}' for bucket '${BUCKET}'...`)
  await iam.send(new PutRolePolicyCommand({
    RoleName: ROLE_NAME,
    PolicyName: POLICY_NAME,
    PolicyDocument: JSON.stringify(policyDocument),
  }))

  console.log(`Done. Redeploy the Amplify app for the new permissions to take effect.`)
}

main().catch((err) => {
  console.error('Failed:', err)
  process.exit(1)
})
