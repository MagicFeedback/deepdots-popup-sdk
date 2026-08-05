import {DeepdotsInitParams} from '../types';

/** Variables específicas por entorno derivadas de nodeEnv */
export interface EnvironmentVariables {
  apiBaseUrl: string;
}

const ENVIRONMENT_MAP: Record<"development" | "production", EnvironmentVariables> = {
  development: {
    apiBaseUrl: 'https://api-dev.deepdots.com',
  },
  production: {
    apiBaseUrl: 'https://api.deepdots.com',
  },
};

/** Resuelve las variables para el entorno indicado */
export function resolveEnvironment(nodeEnv: DeepdotsInitParams['nodeEnv']): EnvironmentVariables {
  return ENVIRONMENT_MAP[nodeEnv || 'production'];
}

