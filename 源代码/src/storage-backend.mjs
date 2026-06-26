let _backend = null;

export async function getBackend() {
  if (_backend) {
    return _backend;
  }

  if (process.env.KV_REST_API_URL) {
    _backend = await import("./kv-backend.mjs");
  } else {
    _backend = await import("./file-backend.mjs");
  }

  return _backend;
}

export function resetBackend() {
  _backend = null;
}
