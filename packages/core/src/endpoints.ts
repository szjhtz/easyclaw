// Cloud service base domains
export const API_BASE_URL = "https://api.easy-claw.com";
export const API_BASE_URL_CN = "https://api.zhuazhuaai.cn";
export const TELEMETRY_URL = "https://t.easy-claw.com/";
export const TELEMETRY_URL_CN = "https://t.zhuazhuaai.cn/";

/** Return the API base URL for the given language/locale. */
export function getApiBaseUrl(lang: string): string {
	return lang === "zh" ? API_BASE_URL_CN : API_BASE_URL;
}

/** Return the GraphQL endpoint URL for the given language/locale. */
export function getGraphqlUrl(lang: string): string {
	return `${getApiBaseUrl(lang)}/graphql`;
}

/** Return the telemetry endpoint URL for the given locale. */
export function getTelemetryUrl(locale: string): string {
	return locale === "zh" ? TELEMETRY_URL_CN : TELEMETRY_URL;
}
