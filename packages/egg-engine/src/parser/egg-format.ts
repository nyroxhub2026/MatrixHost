export interface PterodactylEggVariable {
  name?: string;
  description?: string;
  env_variable: string;
  default_value?: string | number | boolean | null;
  user_viewable?: boolean;
  user_editable?: boolean;
  rules?: string;
  field_type?: string;
}

export interface PterodactylEggDockerImages {
  [imageName: string]: string;
}

export interface PterodactylEggConfig {
  files?: Record<string, unknown>;
  startup?: Record<string, unknown>;
  stop?: string;
  logs?: Record<string, unknown>;
  extends?: string | null;
}

export interface PterodactylEggScript {
  privileged?: boolean;
  install?: {
    container?: string;
    entrypoint?: string;
    script?: string;
  };
}

export interface PterodactylEgg {
  _comment?: string;
  meta?: {
    version?: string;
    update_url?: string | null;
  };
  name: string;
  author?: string;
  description?: string;
  features?: string[];
  docker_images?: PterodactylEggDockerImages;
  file_denylist?: string[];
  startup: string;
  config?: PterodactylEggConfig;
  scripts?: PterodactylEggScript;
  variables?: PterodactylEggVariable[];
}

export interface EggParseResult {
  success: boolean;
  egg?: PterodactylEgg;
  errors: string[];
  warnings: string[];
}
