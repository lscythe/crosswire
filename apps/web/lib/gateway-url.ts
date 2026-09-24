export function gatewayUrl(publicBaseUrl: string) {
  const url = new URL(publicBaseUrl);
  if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.port === "3000")
    url.port = "8080";
  url.pathname = "/v1";
  url.search = "";
  url.hash = "";
  return url.toString();
}
