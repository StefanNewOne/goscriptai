import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Невалиден е-маил.'),
  password: z.string().min(1, 'Внеси лозинка.'),
});

export type LoginInput = z.infer<typeof loginSchema>;
