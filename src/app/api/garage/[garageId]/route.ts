import { NextRequest, NextResponse } from 'next/server'
import { dynamoDB } from '@/utils/dynamoService'
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'
import { queryIndexOrScan } from '@/utils/indexQuery'
import { requireOwner } from '@/utils/requireAuth'
import { getAuthFromRequest } from '@/utils/auth'
import { withMetrics } from '@/utils/withMetrics'
import { stringList } from '@/utils/stringList'

async function _GET(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    if (!garageId) {
      return NextResponse.json({ 
        error: 'Λείπει το αναγνωριστικό συνεργείου' 
      }, { status: 400 })
    }

    // Get garage data from database
    const result = await dynamoDB.send(new GetCommand({
      TableName: 'Garages',
      Key: { id: garageId }
    }))

    if (!result.Item) {
      return NextResponse.json({
        error: 'Το συνεργείο δεν βρέθηκε'
      }, { status: 404 })
    }

    const garage = result.Item

    // This GET is public (the middleware lets it through without a session and
    // strips any identity headers), because a client reads the shop's card off
    // it when an offer arrives. The account's login email and its ΑΦΜ/ΔΟΥ are
    // for the garage's own settings screen only — garage ids reach every client
    // that gets an offer, so returning them here published every garage's login
    // to anyone who asked. The cookie is checked here directly for that reason.
    const viewer = await getAuthFromRequest(request)
    const isOwner = viewer?.userType === 'garage' && viewer.userId === garageId

    return NextResponse.json({
      success: true,
      garage: {
        id: garage.id,
        companyName: garage.companyName,
        mobile: garage.mobile,
        address: garage.address,
        description: garage.description,
        isActive: garage.isActive,
        activatedAt: garage.activatedAt || null,
        benefits: garage.benefits || [],
        workdayStartTime: garage.workdayStartTime || '',
        workdayEndTime: garage.workdayEndTime || '',
        createdAt: garage.createdAt,
        updatedAt: garage.updatedAt,
        ...(isOwner
          ? { email: garage.email, tin: garage.tin, taxAuthority: garage.taxAuthority }
          : {})
      }
    })

  } catch (error) {
    console.error('Error fetching garage data:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την ανάκτηση των στοιχείων του συνεργείου',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

async function _PUT(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    const ownerAuth = requireOwner(request, garageId)
    if (ownerAuth instanceof NextResponse) return ownerAuth

    const body = await request.json()

    if (!garageId) {
      return NextResponse.json({ 
        error: 'Λείπει το αναγνωριστικό συνεργείου' 
      }, { status: 400 })
    }

    // Validate required fields
    const requiredFields: Record<string, string> = {
      companyName: 'Επωνυμία',
      email: 'Email',
      mobile: 'Κινητό',
      address: 'Διεύθυνση',
      tin: 'ΑΦΜ',
      taxAuthority: 'ΔΟΥ',
    }
    const missing = Object.entries(requiredFields).filter(([field]) => !body[field]).map(([, label]) => label)
    if (missing.length > 0) {
      return NextResponse.json({ error: `Λείπουν: ${missing.join(', ')}` }, { status: 400 })
    }

    // Validate TIN format (should be 9 digits)
    if (!/^\d{9}$/.test(body.tin)) {
      return NextResponse.json({ error: 'Το ΑΦΜ πρέπει να έχει ακριβώς 9 ψηφία' }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (typeof body.email !== 'string' || !emailRegex.test(body.email.trim())) {
      return NextResponse.json({ error: 'Μη έγκυρη διεύθυνση email' }, { status: 400 })
    }

    const email = String(body.email).trim().toLowerCase()

    // Login and password reset both resolve a garage by EmailIndex with
    // Limit 1, so a second row carrying the same address makes it a coin toss
    // which account a sign-in or reset lands on. Same for the ΑΦΜ, which is
    // how a business is told apart.
    // queryIndexOrScan: TINIndex is declared in the CDK stack but missing from
    // the local tables (and from any environment the stack hasn't reached).
    const [emailOwners, tinOwners] = await Promise.all([
      queryIndexOrScan<{ id: string }>({
        table: 'Garages',
        indexName: 'EmailIndex',
        keyConditionExpression: 'email = :email',
        scanFilterExpression: 'email = :email',
        expressionAttributeValues: { ':email': email },
      }),
      queryIndexOrScan<{ id: string }>({
        table: 'Garages',
        indexName: 'TINIndex',
        keyConditionExpression: 'tin = :tin',
        scanFilterExpression: 'tin = :tin',
        expressionAttributeValues: { ':tin': body.tin },
      }),
    ])
    if (emailOwners.some((g) => g.id !== garageId)) {
      return NextResponse.json({ error: 'Το email χρησιμοποιείται ήδη από άλλο συνεργείο.' }, { status: 409 })
    }
    if (tinOwners.some((g) => g.id !== garageId)) {
      return NextResponse.json({ error: 'Το ΑΦΜ είναι ήδη καταχωρημένο σε άλλο συνεργείο.' }, { status: 409 })
    }

    // `isActive` is deliberately absent. Activation is an admin decision
    // (api/admin/users/garages/[garageId]/activate, which also sends the
    // activation email); this route used to set it to true on every save, so a
    // pending or deactivated garage approved itself by editing its profile.
    let result
    try {
      result = await dynamoDB.send(new UpdateCommand({
        TableName: 'Garages',
        Key: { id: garageId },
        UpdateExpression: 'SET companyName = :companyName, email = :email, mobile = :mobile, address = :address, tin = :tin, taxAuthority = :taxAuthority, description = :description, benefits = :benefits, workdayStartTime = :workdayStartTime, workdayEndTime = :workdayEndTime, updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':companyName': body.companyName,
          ':email': email,
          ':mobile': body.mobile,
          ':address': body.address,
          ':tin': body.tin,
          ':taxAuthority': body.taxAuthority,
          ':description': body.description || '',
          ':benefits': body.benefits || [],
          // "HH:MM", or empty when the shop hasn't said — the client UI just omits it then.
          ':workdayStartTime': body.workdayStartTime || '',
          ':workdayEndTime': body.workdayEndTime || '',
          ':updatedAt': new Date().toISOString()
        },
        ReturnValues: 'ALL_NEW'
      }))
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Το συνεργείο δεν βρέθηκε' }, { status: 404 })
      }
      throw err
    }

    return NextResponse.json({
      success: true,
      garage: {
        id: result.Attributes?.id,
        companyName: result.Attributes?.companyName,
        email: result.Attributes?.email,
        mobile: result.Attributes?.mobile,
        address: result.Attributes?.address,
        tin: result.Attributes?.tin,
        taxAuthority: result.Attributes?.taxAuthority,
        description: result.Attributes?.description,
        isActive: result.Attributes?.isActive,
        benefits: result.Attributes?.benefits || [],
        workdayStartTime: result.Attributes?.workdayStartTime || '',
        workdayEndTime: result.Attributes?.workdayEndTime || '',
        createdAt: result.Attributes?.createdAt,
        updatedAt: result.Attributes?.updatedAt
      }
    })

  } catch (error) {
    console.error('Error updating garage data:', error)
    return NextResponse.json(
      { 
        error: 'Σφάλμα κατά την αποθήκευση των στοιχείων του συνεργείου',
        details: 'Internal server error'
      },
      { status: 500 }
    )
  }
}

/**
 * Saves only the garage's benefits (the "Παροχές" clients see next to its
 * offers). The registration flow's extra-services step calls this right after
 * sign-up, when the garage is still pending and has no profile to resubmit.
 */
async function _PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ garageId: string }> }
) {
  try {
    const { garageId } = await params

    const ownerAuth = requireOwner(request, garageId)
    if (ownerAuth instanceof NextResponse) return ownerAuth

    const body = await request.json().catch(() => null)
    if (!body || !Array.isArray(body.benefits)) {
      return NextResponse.json({ error: 'Λείπουν οι παροχές' }, { status: 400 })
    }
    const benefits = stringList(body.benefits)

    try {
      await dynamoDB.send(new UpdateCommand({
        TableName: 'Garages',
        Key: { id: garageId },
        UpdateExpression: 'SET benefits = :benefits, updatedAt = :updatedAt',
        ConditionExpression: 'attribute_exists(id)',
        ExpressionAttributeValues: {
          ':benefits': benefits,
          ':updatedAt': new Date().toISOString(),
        },
      }))
    } catch (err) {
      if (err instanceof Error && err.name === 'ConditionalCheckFailedException') {
        return NextResponse.json({ error: 'Το συνεργείο δεν βρέθηκε' }, { status: 404 })
      }
      throw err
    }

    return NextResponse.json({ success: true, benefits })
  } catch (error) {
    console.error('Error updating garage benefits:', error)
    return NextResponse.json(
      { error: 'Σφάλμα κατά την αποθήκευση των παροχών' },
      { status: 500 }
    )
  }
}

export const GET = withMetrics(_GET)
export const PUT = withMetrics(_PUT)
export const PATCH = withMetrics(_PATCH)
