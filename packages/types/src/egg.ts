export type EggCategory =
  | "MINECRAFT_JAVA"
  | "MINECRAFT_BEDROCK"
  | "PROXY"
  | "NODEJS"
  | "PYTHON"
  | "OTHER";

export interface EggVariable {
  name: string;
  description: string;
  envVariable: string;
  defaultValue: string;
  userViewable: boolean;
  userEditable: boolean;
  rules: string[];
}

export interface EggDockerImage {
  name: string;
  image: string;
  supported: boolean;
}

export interface Egg {
  id: string;
  name: string;
  description: string;
  author: string;
  category: EggCategory;
  dockerImages: EggDockerImage[];
  startupCommand: string;
  variables: EggVariable[];
  config: Record<string, unknown>;
  features: string[];
  supported: boolean;
  compatibilityNotes: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateEggInput {
  name: string;
  description: string;
  author: string;
  category: EggCategory;
  startupCommand: string;
  dockerImages: EggDockerImage[];
  variables: EggVariable[];
  config: Record<string, unknown>;
  features: string[];
}

export interface EggImportResult {
  success: boolean;
  egg?: Egg;
  errors: string[];
  warnings: string[];
}
