import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { resolveStateFilePath } from "./paths.mjs";

function dataFile() {
  return resolveStateFilePath();
}

async function ensureDataDir(dataFile) {
  await mkdir(dirname(dataFile), { recursive: true });
}

export async function readBlob() {
  const file = dataFile();
  await ensureDataDir(file);
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeBlob(state) {
  const file = dataFile();
  await ensureDataDir(file);
  const tempFile = `${file}.tmp`;
  await writeFile(tempFile, JSON.stringify(state, null, 2));
  await rename(tempFile, file);
}

export async function statBlob() {
  try {
    const file = dataFile();
    const info = await stat(file);
    return { mtimeMs: info.mtimeMs };
  } catch {
    return null;
  }
}
