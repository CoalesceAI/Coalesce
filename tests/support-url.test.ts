import { describe, it, expect } from 'vitest'

// Inline implementation of buildSupportUrl — mirrors what will be in agentmail-api/src/utils/support.ts
// This pure function is tested here (in Apoyo test suite) since agentmail-api has no test framework.
function buildSupportUrl(
    apoyoUrl: string | undefined,
    error: { name: string },
    event: { requestContext: { routeKey: string; http: { method: string } } } | undefined,
    statusCode: number
): string | undefined {
    if (!apoyoUrl || !event) return undefined

    const endpoint = event.requestContext.routeKey.replace(/^[A-Z]+ /, '')
    const method = event.requestContext.http.method
    const error_code = String(statusCode)
    const context = error.name

    const params = new URLSearchParams({ endpoint, error_code, method, context })
    return `${apoyoUrl}/ws/agentmail?${params.toString()}`
}

describe('buildSupportUrl', () => {
    it('Test 1 (AGNT-01): returns a URL string when APOYO_URL is set', () => {
        const result = buildSupportUrl(
            'ws://localhost:3000',
            { name: 'NotFoundError' },
            {
                requestContext: {
                    routeKey: 'GET /v0/threads',
                    http: { method: 'GET' },
                },
            },
            404
        )

        expect(result).toBeDefined()
        expect(typeof result).toBe('string')
        expect(result!.startsWith('ws://localhost:3000/ws/agentmail?')).toBe(true)
    })

    it('Test 2 (AGNT-01): returns undefined when APOYO_URL is not set', () => {
        const result = buildSupportUrl(
            undefined,
            { name: 'NotFoundError' },
            {
                requestContext: {
                    routeKey: 'GET /v0/threads',
                    http: { method: 'GET' },
                },
            },
            404
        )

        expect(result).toBeUndefined()
    })

    it('Test 3 (AGNT-02): URL includes correct query params (endpoint, error_code, method, context)', () => {
        const result = buildSupportUrl(
            'ws://localhost:3000',
            { name: 'NotFoundError' },
            {
                requestContext: {
                    routeKey: 'POST /v0/inboxes/{inbox_id}/messages',
                    http: { method: 'POST' },
                },
            },
            404
        )

        expect(result).toBeDefined()
        const url = new URL(result!)
        expect(url.searchParams.get('endpoint')).toBe('/v0/inboxes/{inbox_id}/messages')
        expect(url.searchParams.get('error_code')).toBe('404')
        expect(url.searchParams.get('method')).toBe('POST')
        expect(url.searchParams.get('context')).toBe('NotFoundError')
    })

    it('Test 4 (AGNT-02): URL-encodes special chars in endpoint (braces, slashes)', () => {
        const result = buildSupportUrl(
            'ws://localhost:3000',
            { name: 'NotFoundError' },
            {
                requestContext: {
                    routeKey: 'POST /v0/inboxes/{inbox_id}/messages',
                    http: { method: 'POST' },
                },
            },
            404
        )

        expect(result).toBeDefined()
        // URLSearchParams encodes { as %7B, } as %7D, / as %2F
        expect(result!).toContain('endpoint=%2Fv0%2Finboxes%2F%7Binbox_id%7D%2Fmessages')
        expect(result!).toContain('error_code=404')
        expect(result!).toContain('method=POST')
        expect(result!).toContain('context=NotFoundError')
    })

    it('Test 5 (AGNT-03): returns undefined when APOYO_URL is absent (feature gate)', () => {
        const result = buildSupportUrl(
            undefined,
            { name: 'ValidationError' },
            {
                requestContext: {
                    routeKey: 'POST /v0/inboxes',
                    http: { method: 'POST' },
                },
            },
            400
        )

        expect(result).toBeUndefined()
    })
})
