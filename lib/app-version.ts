import packageJson from '../package.json';

const packageVersion = packageJson.version;

export function getAppVersion(): string {
  const envVersion = process.env.NEXT_PUBLIC_APP_VERSION?.trim();
  if (envVersion) return envVersion;
  return packageVersion;
}
