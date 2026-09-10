// Lightweight client-side mirrors of API shapes (Sprint 1). A shared types
// package can replace these later.
export type Language = 'MK' | 'SQ' | 'BOTH';
export type Role = 'SCRIPTWRITER' | 'ADMIN' | 'VIEWER';

export interface AuthUser {
  id: string;
  name: string;
  role: Role;
}

export interface ClientListItem {
  id: string;
  name: string;
  code: string;
  industry?: string | null;
  language: Language;
  status: string;
  logoUrl?: string | null;
  reelsPerMonth?: number | null;
  budgetUsd: string;
  spentUsd: string;
  _count?: { sets: number; avatars: number };
}

export interface Avatar {
  id: string;
  name: string;
  status: string;
  profile: Record<string, unknown>;
}

export interface Product {
  id: string;
  name: string;
  category?: string | null;
  price?: string | null;
  installment?: string | null;
  usp?: string | null;
  active: boolean;
}

export interface Actor {
  id: string;
  name: string;
  role: string;
  languages: Language[];
  style?: string | null;
  canDo: string[];
  cannotDo: string[];
  notes?: string | null;
}

export interface Location {
  id: string;
  name: string;
  description: string;
  usableElements: string[];
  constraints?: string | null;
}

export interface Competitor {
  id: string;
  name: string;
  links: Record<string, string>;
  why?: string | null;
  doNotCopy?: string | null;
  status: string;
}

export interface TrendReference {
  id: string;
  url?: string | null;
  platform?: string | null;
  flag: string;
  analysis?: string | null;
}

export interface GlossaryTerm {
  id: string;
  language: Language;
  term: string;
  meaning: string;
  kind: string;
}

export interface ClientProfile {
  id: string;
  version: number;
  markdown: string;
  approved: boolean;
}

export interface BrainChange {
  id: string;
  kind: string;
  summary: string;
  createdAt: string;
}

export interface ClientDetail extends ClientListItem {
  profiles: ClientProfile[];
  avatars: Avatar[];
  products: Product[];
  actors: Actor[];
  locations: Location[];
  competitors: Competitor[];
  references: TrendReference[];
  glossary: GlossaryTerm[];
  changeLog: BrainChange[];
}
