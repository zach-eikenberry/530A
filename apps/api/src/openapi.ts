/**
 * OpenAPI 3.1 document served at /openapi.json (§7A.2). Hand-maintained and
 * asserted against the zod schema in tests so it cannot silently drift.
 */
export const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: '530A Model public API',
    version: '1.0.0',
    description:
      'Free, stateless projection API for 530A custodial accounts ("Trump Accounts"). ' +
      'Deterministic: identical requests return identical results (and cache at the edge). ' +
      'No auth, no PII, nothing stored. Please attribute results to https://530amodel.com.',
  },
  servers: [{ url: 'https://api.530amodel.com' }],
  paths: {
    '/v1/project': {
      post: {
        summary: 'Project a 530A scenario',
        description:
          'Accepts either an explicit scenario or {"s": "<state>"} using the share-link encoding. ' +
          'Money is integer cents serialized as strings. Returns the deterministic expected path ' +
          'plus Monte-Carlo percentile bands (10/25/50/75/90) for fixed seeds.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/Scenario' },
              example: {
                asOf: '2026-07-12',
                birthDate: '2026-01-15',
                includeSeed: true,
                targetAgeMonths: 864,
                sources: [
                  {
                    id: 'family',
                    kind: 'family',
                    schedule: {
                      type: 'monthly',
                      amountCents: '10000',
                      startAgeMonths: 6,
                      endAgeMonths: 216,
                    },
                  },
                ],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Projection with percentiles, assumptions, disclaimer, sourceUrl' },
          '400': { description: 'Validation error' },
          '413': { description: 'Payload too large' },
        },
      },
    },
    '/v1/rules': {
      get: {
        summary: 'Verified 530A legal facts with sources',
        responses: {
          '200': { description: 'Facts, unverified-item flags, and primary-source URLs' },
        },
      },
    },
  },
  components: {
    schemas: {
      Scenario: {
        type: 'object',
        required: ['asOf', 'birthDate', 'targetAgeMonths'],
        properties: {
          asOf: { type: 'string', format: 'date' },
          birthDate: { type: 'string', format: 'date' },
          includeSeed: { type: 'boolean', default: true },
          annualReturn: { type: 'number', default: 0.07, minimum: -0.5, maximum: 0.2 },
          returnIsReal: { type: 'boolean', default: true },
          annualInflation: { type: 'number', default: 0.025, minimum: 0, maximum: 0.2 },
          annualFee: { type: 'number', default: 0.0003, minimum: 0, maximum: 0.05 },
          annualVolatility: { type: 'number', default: 0.15, minimum: 0, maximum: 0.6 },
          targetAgeMonths: { type: 'integer', minimum: 1, maximum: 1428 },
          mcSeed: { type: 'integer', default: 530 },
          mcPaths: { type: 'integer', default: 2000, minimum: 100, maximum: 5000 },
          sources: {
            type: 'array',
            maxItems: 8,
            items: {
              type: 'object',
              required: ['id', 'kind', 'schedule'],
              properties: {
                id: { type: 'string' },
                kind: { type: 'string', enum: ['family', 'relative', 'charity', 'employer'] },
                stepUpRate: { type: 'number', minimum: 0, maximum: 1 },
                schedule: {
                  oneOf: [
                    {
                      type: 'object',
                      required: ['type', 'amountCents', 'startAgeMonths', 'endAgeMonths'],
                      properties: {
                        type: { const: 'monthly' },
                        amountCents: { type: 'string', pattern: '^\\d{1,12}$' },
                        startAgeMonths: { type: 'integer' },
                        endAgeMonths: { type: 'integer' },
                      },
                    },
                    {
                      type: 'object',
                      required: [
                        'type',
                        'amountCents',
                        'monthOfYear',
                        'startAgeMonths',
                        'endAgeMonths',
                      ],
                      properties: {
                        type: { const: 'annual' },
                        amountCents: { type: 'string', pattern: '^\\d{1,12}$' },
                        monthOfYear: { type: 'integer', minimum: 1, maximum: 12 },
                        startAgeMonths: { type: 'integer' },
                        endAgeMonths: { type: 'integer' },
                      },
                    },
                    {
                      type: 'object',
                      required: ['type', 'amountCents', 'atAgeMonths'],
                      properties: {
                        type: { const: 'once' },
                        amountCents: { type: 'string', pattern: '^\\d{1,12}$' },
                        atAgeMonths: { type: 'integer' },
                      },
                    },
                  ],
                },
              },
            },
          },
        },
      },
    },
  },
} as const
