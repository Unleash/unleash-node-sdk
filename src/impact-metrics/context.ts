import { CustomHeaders } from '../headers';
import { StaticContext } from '../unleash';
import { extractEnvironmentFromCustomHeaders } from './environment-resolver';

export const buildImpactMetricContext = (
  customHeaders: CustomHeaders | undefined,
  staticContext: StaticContext,
): StaticContext => {
  const metricsContext: StaticContext = { ...staticContext };
  if (customHeaders) {
    const environment = extractEnvironmentFromCustomHeaders(customHeaders);
    if (environment) {
      metricsContext.environment = environment;
    }
  }
  return metricsContext;
};
