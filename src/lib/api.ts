const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

export async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = localStorage.getItem("token");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { ...headers, ...(options?.headers as Record<string, string>) },
  });

  const body = await res.json();

  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/api/v1/auth/")) {
      if (localStorage.getItem("token")) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        localStorage.removeItem("store");
        window.location.href = "/login?expired=1";
      }
      throw new ApiError(401, "Sesión expirada");
    }
    throw new ApiError(res.status, (body as { error?: string }).error ?? "Error desconocido");
  }

  return (body as { data: T }).data;
}
