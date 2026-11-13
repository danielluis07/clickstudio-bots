// PROTOTYPE (throwaway): display faces tried by the dashboard design variants.
import { Bricolage_Grotesque, Schibsted_Grotesk } from "next/font/google";

// Variant A ("Relatório"): a characterful grotesque for the sentence headline.
export const bricolage = Bricolage_Grotesque({ subsets: ["latin"] });

// Variant B ("Bento"): a compact, newsy grotesque for tiles and numbers.
export const schibsted = Schibsted_Grotesk({ subsets: ["latin"] });
