import { z } from 'zod';
import { languageSchema } from './client.js';

export const productSchema = z.object({
  name: z.string().min(1),
  category: z.string().optional(),
  price: z.number().nonnegative().optional(),
  installment: z.number().nonnegative().optional(),
  usp: z.string().optional(),
  seasonality: z.string().optional(),
  promoFrom: z.coerce.date().optional(),
  promoTo: z.coerce.date().optional(),
  active: z.boolean().default(true),
});

export const actorSchema = z.object({
  clientId: z.string().nullable().optional(), // null = GoDigital talent
  name: z.string().min(1),
  role: z.string().min(1),
  languages: z.array(languageSchema).default([]),
  style: z.string().optional(),
  canDo: z.array(z.string()).default([]),
  cannotDo: z.array(z.string()).default([]),
  notes: z.string().optional(),
  photoUrl: z.string().optional(),
});

export const locationSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  usableElements: z.array(z.string()).default([]),
  constraints: z.string().optional(),
  images: z.array(z.string()).default([]),
});

export const competitorSchema = z.object({
  name: z.string().min(1),
  links: z.record(z.string(), z.string()).default({}),
  why: z.string().optional(),
  doNotCopy: z.string().optional(),
  status: z.enum(['PENDING_CONFIRMATION', 'CONFIRMED']).default('CONFIRMED'),
});

export const referenceSchema = z.object({
  url: z.string().optional(),
  platform: z.string().optional(),
  transcript: z.string().optional(),
  analysis: z.string().optional(),
  flag: z.enum(['INSPIRATION', 'DO_NOT_COPY']),
  source: z.string().default('link'),
});

export const glossarySchema = z.object({
  language: languageSchema,
  term: z.string().min(1),
  meaning: z.string().min(1),
  kind: z.enum(['PREFERRED', 'BANNED', 'PRODUCT_NAME']),
});

export const BRAIN_ENTITIES = ['products', 'actors', 'locations', 'competitors', 'references', 'glossary'] as const;
export type BrainEntity = (typeof BRAIN_ENTITIES)[number];
