import { z } from "zod";

export const contactDetailsSchema = z.object({
  name: z.string().trim().max(120, "Use até 120 caracteres para o nome."),
  phone: z.string().trim()
    .regex(/^\+?[\d\s().-]+$/, "Informe um telefone com DDD e código do país.")
    .transform((phone) => phone.replace(/\D/g, ""))
    .pipe(z.string().regex(/^[1-9]\d{6,14}$/, "Informe um telefone com DDD e código do país.")),
});

export type ContactDetails = z.input<typeof contactDetailsSchema>;
