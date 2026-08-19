import { NextRequest, NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

export async function POST(request: NextRequest) {
  // Verify admin auth
  const adminId = request.headers.get('x-admin-id')
  if (!adminId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json().catch(() => ({}))
    const testFile = body.testFile || '' // Optional: run specific test file

    // The file name lands in a shell command, so it is matched against a strict
    // pattern rather than interpolated as sent. Anything else — a semicolon, a
    // backtick, a path segment — was arbitrary command execution on the server,
    // running as the app with its environment: an admin session was effectively a
    // shell. Names only, from the e2e directory, nothing clever.
    if (testFile && !/^[a-zA-Z0-9_-]+\.spec\.ts$/.test(testFile)) {
      return NextResponse.json(
        { error: 'Invalid test file name' },
        { status: 400 }
      )
    }

    const cmd = testFile
      ? `npx playwright test e2e/${testFile} --reporter=json 2>&1`
      : `npx playwright test --reporter=json 2>&1`

    const { stdout } = await execAsync(cmd, {
      cwd: process.cwd(),
      timeout: 120_000,
      env: { ...process.env, FORCE_COLOR: '0' },
    })

    const results = JSON.parse(stdout)

    return NextResponse.json({
      success: true,
      summary: {
        total: results.stats?.expected || 0,
        passed: results.stats?.expected - (results.stats?.unexpected || 0) - (results.stats?.skipped || 0),
        failed: results.stats?.unexpected || 0,
        skipped: results.stats?.skipped || 0,
        duration: results.stats?.duration || 0,
      },
      suites: results.suites?.map((suite: { title: string; specs: { title: string; ok: boolean; tests: { status: string; duration: number; errors: { message: string }[] }[] }[] }) => ({
        title: suite.title,
        tests: suite.specs?.map((spec) => ({
          title: spec.title,
          status: spec.ok ? 'passed' : 'failed',
          duration: spec.tests?.[0]?.duration || 0,
          error: spec.tests?.[0]?.errors?.[0]?.message || null,
        })),
      })),
    })
  } catch (error) {
    // Playwright exits with code 1 on failures, parse the JSON output anyway
    const errOutput = (error as { stdout?: string; stderr?: string }).stdout || ''
    try {
      const results = JSON.parse(errOutput)
      return NextResponse.json({
        success: false,
        summary: {
          total: results.stats?.expected || 0,
          passed: (results.stats?.expected || 0) - (results.stats?.unexpected || 0) - (results.stats?.skipped || 0),
          failed: results.stats?.unexpected || 0,
          skipped: results.stats?.skipped || 0,
          duration: results.stats?.duration || 0,
        },
        suites: results.suites?.map((suite: { title: string; specs: { title: string; ok: boolean; tests: { status: string; duration: number; errors: { message: string }[] }[] }[] }) => ({
          title: suite.title,
          tests: suite.specs?.map((spec) => ({
            title: spec.title,
            status: spec.ok ? 'passed' : 'failed',
            duration: spec.tests?.[0]?.duration || 0,
            error: spec.tests?.[0]?.errors?.[0]?.message || null,
          })),
        })),
      })
    } catch {
      return NextResponse.json({
        success: false,
        error: 'Failed to run tests',
        output: errOutput.substring(0, 2000),
      }, { status: 500 })
    }
  }
}

export async function GET(request: NextRequest) {
  const adminId = request.headers.get('x-admin-id')
  if (!adminId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Return list of available test files
  try {
    const { stdout } = await execAsync('ls e2e/*.spec.ts', { cwd: process.cwd() })
    const files = stdout.trim().split('\n').map(f => f.replace('e2e/', ''))
    return NextResponse.json({ success: true, testFiles: files })
  } catch {
    return NextResponse.json({ success: true, testFiles: [] })
  }
}
