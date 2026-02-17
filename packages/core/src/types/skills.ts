/** Editorial labels set by EasyClaw admins. Values are admin-controlled and finite. */
export enum SkillLabel {
  RECOMMENDED = "推荐",
}

/** Skill metadata from the marketplace server */
export interface MarketSkill {
  slug: string;
  name_en: string;
  name_zh: string;
  desc_en: string;
  desc_zh: string;
  author: string;
  version: string;
  tags: string[];
  labels: SkillLabel[];
  chinaAvailable: boolean;
  stars: number;
  downloads: number;
  hidden: boolean;
}

/** Locally installed skill */
export interface InstalledSkill {
  slug: string;
  name: string;
  description: string;
  author: string;
  version: string;
  filePath: string;
  installedAt: string;
}

/** Skill category for market filtering */
export interface SkillCategory {
  id: string;
  name_en: string;
  name_zh: string;
  count: number;
}

/** Query parameters for market skill search */
export interface MarketQuery {
  query?: string;
  category?: string;
  page?: number;
  pageSize?: number;
}

/** Paginated market response */
export interface MarketResponse {
  skills: MarketSkill[];
  total: number;
  page: number;
  pageSize: number;
}
