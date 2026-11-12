export async function api(path, { token, method = "GET", body, signal } = {}) {
  const headers = { Accept: "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  const response = await fetch(path, { headers, method, body: JSON.stringify(body), signal });
  if (response.status === 204) return undefined;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error ?? "Could not reach the API. Check that the server is running.");
    error.status = response.status;
    throw error;
  }
  return data;
}
