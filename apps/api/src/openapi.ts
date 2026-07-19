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
      'No auth, no PII, nothing stored. Please attribute results to https://530amodel.com. ' +
      'Privacy policy: https://530amodel.com/privacy',
    termsOfService: 'https://530amodel.com/terms',
    contact: {
      name: '530A Model',
      email: 'api@530amodel.com',
      url: 'https://github.com/zach-eikenberry/530A/issues',
    },
    license: {
      name: 'MIT',
      url: 'https://github.com/zach-eikenberry/530A/blob/main/LICENSE',
    },
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
          '200': {
            description: 'Projection with percentiles, assumptions, disclaimer, sourceUrl',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Projection' },
                example: {
                  schemaVersion: 1,
                  sourceUrl: 'https://530amodel.com',
                  shareUrl: 'https://530amodel.com/model',
                  disclaimer: 'Educational estimates, not financial advice.',
                  rulesVerifiedAt: '2026-07-12',
                  assumptions: {
                    annualReturn: 0.07,
                    returnIsReal: true,
                    annualInflation: 0.025,
                    annualFee: 0.0003,
                    annualVolatility: 0.15,
                    mcSeed: 530,
                    mcPathsRequested: 300,
                    mcPathsSimulated: 300,
                  },
                  deterministic: {
                    months: 210,
                    startAgeMonths: 6,
                    finalNominalCents: '4587218',
                    finalRealCents: '2967155',
                    contributedCents: '2100000',
                    seedCents: '100000',
                    growthCents: '2387218',
                    milestones: [{ ageMonths: 216, nominalCents: '4587218', realCents: '2967155' }],
                    capWarnings: 0,
                  },
                  percentiles: {
                    ages: [216],
                    nominalCents: [['3120000'], ['3810000'], ['4520000'], ['5390000'], ['6410000']],
                    realCents: [['2010000'], ['2460000'], ['2920000'], ['3480000'], ['4140000']],
                  },
                },
              },
            },
          },
          '400': { description: 'Validation error' },
          '413': { description: 'Payload too large' },
        },
      },
    },
    '/v1/rules': {
      get: {
        summary: 'Verified 530A legal facts with sources',
        responses: {
          '200': {
            description: 'Facts, unverified-item flags, and primary-source URLs',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Rules' },
                example: {
                  sourceUrl: 'https://530amodel.com',
                  rulesVerifiedAt: '2026-07-12',
                  disclaimer: 'Educational estimates, not financial advice.',
                  facts: {
                    what: 'IRC §530A custodial investment account for minors ("Trump Account").',
                    federalSeed: '$1,000 one-time for eligible children born 2025–2028.',
                  },
                  unverified: {
                    rollover529At18: { enabled: false, note: 'No statutory basis found.' },
                  },
                  sources: { statute: 'https://uscode.house.gov/...' },
                },
              },
            },
          },
        },
      },
    },
    '/v1/returns': {
      get: {
        summary: 'Live trailing returns for the eligible funds',
        description:
          'Nominal annualized returns (CAGR, dividends reinvested) over the trailing 1, 5, and ' +
          '10 years for each statute-eligible fund, from public market data. Cached ~6h. ' +
          'Periods without enough history are null. Past performance does not predict results.',
        responses: {
          '200': {
            description: 'asOf date, data source, and per-ticker {1y,5y,10y} decimals',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/Returns' },
                example: {
                  asOf: '2026-07-19',
                  source: 'Yahoo Finance monthly adjusted close (dividends reinvested)',
                  note: 'Nominal annualized returns (CAGR). Past performance does not predict future results.',
                  funds: { SPYM: { '1y': 0.1656, '5y': 0.1206, '10y': 0.1501 } },
                },
              },
            },
          },
          '503': { description: 'Upstream market data temporarily unavailable' },
        },
      },
    },
  },
  components: {
    schemas: {
      CentString: {
        type: 'string',
        pattern: '^-?[0-9]+$',
        description: 'Exact money amount in integer cents, serialized as a string.',
      },
      Projection: {
        type: 'object',
        description: 'Deterministic projection plus seeded Monte-Carlo percentile bands.',
        required: [
          'schemaVersion',
          'sourceUrl',
          'disclaimer',
          'assumptions',
          'deterministic',
          'percentiles',
        ],
        properties: {
          schemaVersion: { type: 'integer', const: 1 },
          sourceUrl: { type: 'string', format: 'uri' },
          shareUrl: { type: 'string', format: 'uri' },
          disclaimer: { type: 'string' },
          rulesVerifiedAt: { type: 'string', format: 'date' },
          assumptions: {
            type: 'object',
            properties: {
              annualReturn: { type: 'number' },
              returnIsReal: { type: 'boolean' },
              annualInflation: { type: 'number' },
              annualFee: { type: 'number' },
              annualVolatility: { type: 'number' },
              mcSeed: { type: 'integer' },
              mcPathsRequested: { type: 'integer' },
              mcPathsSimulated: {
                type: 'integer',
                description: 'May be clamped below the requested path count to bound CPU.',
              },
            },
          },
          deterministic: {
            type: 'object',
            properties: {
              months: { type: 'integer' },
              startAgeMonths: { type: 'integer' },
              finalNominalCents: { $ref: '#/components/schemas/CentString' },
              finalRealCents: { $ref: '#/components/schemas/CentString' },
              contributedCents: { $ref: '#/components/schemas/CentString' },
              seedCents: { $ref: '#/components/schemas/CentString' },
              growthCents: { $ref: '#/components/schemas/CentString' },
              milestones: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    ageMonths: { type: 'integer' },
                    nominalCents: { $ref: '#/components/schemas/CentString' },
                    realCents: { $ref: '#/components/schemas/CentString' },
                  },
                },
              },
              capWarnings: { type: 'integer' },
            },
          },
          percentiles: {
            type: 'object',
            description:
              'Rows are the 10/25/50/75/90th percentiles; columns align with `ages` (months).',
            properties: {
              ages: { type: 'array', items: { type: 'integer' } },
              nominalCents: {
                type: 'array',
                items: { type: 'array', items: { $ref: '#/components/schemas/CentString' } },
              },
              realCents: {
                type: 'array',
                items: { type: 'array', items: { $ref: '#/components/schemas/CentString' } },
              },
            },
          },
        },
      },
      Rules: {
        type: 'object',
        description: 'Verified 530A legal facts with primary sources and unverified-item flags.',
        required: ['sourceUrl', 'rulesVerifiedAt', 'disclaimer', 'facts', 'sources'],
        properties: {
          sourceUrl: { type: 'string', format: 'uri' },
          rulesVerifiedAt: { type: 'string', format: 'date' },
          disclaimer: { type: 'string' },
          facts: { type: 'object', additionalProperties: { type: 'string' } },
          unverified: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: { enabled: { type: 'boolean' }, note: { type: 'string' } },
            },
          },
          sources: { type: 'object', additionalProperties: { type: 'string' } },
        },
      },
      Returns: {
        type: 'object',
        description:
          'Nominal annualized trailing returns (CAGR, dividends reinvested) per eligible fund.',
        required: ['asOf', 'source', 'note', 'funds'],
        properties: {
          asOf: { type: 'string', format: 'date' },
          source: { type: 'string' },
          note: { type: 'string' },
          funds: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                '1y': { type: ['number', 'null'] },
                '5y': { type: ['number', 'null'] },
                '10y': { type: ['number', 'null'] },
              },
            },
          },
        },
      },
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
