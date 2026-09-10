import { z } from 'zod';

export const languageSchema = z.enum(['MK', 'SQ', 'BOTH']);

export const createClientSchema = z.object({
  name: z.string().min(2, 'Внеси име на клиентот.'),
  code: z
    .string()
    .regex(/^[A-Z][A-Z0-9]{1,15}$/, 'Кодот е 2–16 знаци, започнува со буква (латиница/цифри).')
    .optional(),
  industry: z.string().optional(),
  language: languageSchema.default('MK'),
  websiteUrl: z.string().url('Невалиден URL.').optional().or(z.literal('')),
  reelsPerMonth: z.number().int().positive().optional(),
  graphicsPerMonth: z.number().int().positive().optional(),
  textBrief: z.string().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.partial().omit({ code: true });
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
