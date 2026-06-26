const KV_KEY = "decision-brain-state";

let kvModule = null;

async function getKv() {
  if (!kvModule) {
    kvModule = await import("@vercel/kv");
  }
  return kvModule.kv;
}

export async function readBlob() {
  try {
    const kv = await getKv();
    const raw = await kv.get(KV_KEY);
    if (raw === null || raw === undefined) {
      return null;
    }
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
}

export async function writeBlob(state) {
  const kv = await getKv();
  await kv.set(KV_KEY, JSON.stringify(state));
}

export async function statBlob() {
  return null;
}
