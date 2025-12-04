import type { CustomHeaders } from '../headers';

const findAuthorizationHeaderKey = (customHeaders: CustomHeaders): string | undefined => {
  const headerKeys = Object.keys(customHeaders);
  return headerKeys.find((key) => key.toLowerCase() === 'authorization');
};

const extractAuthorizationHeader = (customHeaders: CustomHeaders): string | undefined => {
  if (!customHeaders) {
    return undefined;
  }

  const authHeaderKey = findAuthorizationHeaderKey(customHeaders);
  if (!authHeaderKey) {
    return undefined;
  }

  return customHeaders[authHeaderKey];
};

const extractEnvironmentFromHeader = (authorizationHeader?: string): string | undefined => {
  if (!authorizationHeader) {
    return undefined;
  }

  const parts = authorizationHeader.split(':');
  if (parts.length >= 2 && parts[1]) {
    const envParts = parts[1].split('.');
    return envParts[0] || undefined;
  }

  return undefined;
};

export const extractEnvironmentFromCustomHeaders = (
  customHeaders: CustomHeaders,
): string | undefined => {
  const authorizationHeader = extractAuthorizationHeader(customHeaders);
  return extractEnvironmentFromHeader(authorizationHeader);
};
