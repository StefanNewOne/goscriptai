// JSON Schemas for each agent's structured output. Passed to the Claude Agent
// SDK via outputFormat so the model returns validated JSON in `structured_output`
// (no fragile text parsing). Kept deliberately permissive — the domain layer and
// service layer do the strict validation.

export const questionsSchema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          text: { type: 'string' },
          kind: { type: 'string', enum: ['text', 'choice'] },
          options: { type: 'array', items: { type: 'string' } },
        },
        required: ['id', 'text', 'kind'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
} as const;

export const profileSchema = {
  type: 'object',
  properties: {
    markdown: { type: 'string' },
    data: {
      type: 'object',
      properties: {
        industry: { type: 'string' },
        tone: { type: 'string' },
        presence: { type: 'string' },
        focus: { type: 'string' },
        openQuestions: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: true,
    },
  },
  required: ['markdown', 'data'],
  additionalProperties: false,
} as const;

export const avatarsSchema = {
  type: 'object',
  properties: {
    avatars: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          profile: {
            type: 'object',
            properties: {
              pain: { type: 'string' },
              desire: { type: 'string' },
              whyBuy: { type: 'string' },
              objections: { type: 'array', items: { type: 'string' } },
              speech: { type: 'string' },
            },
            additionalProperties: true,
          },
        },
        required: ['name', 'profile'],
        additionalProperties: false,
      },
    },
  },
  required: ['avatars'],
  additionalProperties: false,
} as const;

export const conceptsSchema = {
  type: 'object',
  properties: {
    concepts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['PRODUCT_OFFER', 'EDUCATIONAL', 'TESTIMONIAL', 'SKETCH'] },
          avatarId: { type: 'string' },
          actorId: { type: 'string' },
          locationId: { type: 'string' },
          card: {
            type: 'object',
            properties: {
              hook: { type: 'string' },
              insight: { type: 'string' },
              why: { type: 'string' },
              layer: { type: 'string' },
              estimateSec: { type: 'number' },
              complexity: { type: 'string' },
            },
            required: ['hook', 'insight', 'why', 'estimateSec', 'complexity'],
            additionalProperties: true,
          },
        },
        required: ['type', 'card'],
        additionalProperties: false,
      },
    },
  },
  required: ['concepts'],
  additionalProperties: false,
} as const;

export const scriptSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    content: {
      type: 'object',
      properties: {
        frames: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              role: { type: 'string', enum: ['ХООК', 'БОДИ', 'ЦТА'] },
              direction: { type: 'string' },
              subLabel: { type: 'string' },
              editing: { type: 'string' },
              lines: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { actor: { type: 'string' }, text: { type: 'string' } },
                  required: ['actor', 'text'],
                  additionalProperties: false,
                },
              },
              table: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    index: { type: 'number' },
                    product: { type: 'string' },
                    oldPrice: { type: 'string' },
                    newPrice: { type: 'string' },
                  },
                  required: ['index', 'product'],
                  additionalProperties: false,
                },
              },
            },
            required: ['role', 'direction', 'lines'],
            additionalProperties: false,
          },
        },
      },
      required: ['frames'],
      additionalProperties: false,
    },
  },
  required: ['title', 'content'],
  additionalProperties: false,
} as const;

export const criticSchema = {
  type: 'object',
  properties: {
    scores: {
      type: 'object',
      properties: {
        avatar: { type: 'number' }, hook: { type: 'number' }, essence: { type: 'number' },
        actorFeasibility: { type: 'number' }, location: { type: 'number' }, structure: { type: 'number' },
        cta: { type: 'number' }, antiGeneric: { type: 'number' }, language: { type: 'number' },
        duration: { type: 'number' }, accuracy: { type: 'number' },
      },
      additionalProperties: false,
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { criterion: { type: 'string' }, text: { type: 'string' }, frame: { type: 'number' } },
        required: ['criterion', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['scores', 'findings'],
  additionalProperties: false,
} as const;
