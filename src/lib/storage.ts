import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Project } from '../types';

interface Schema extends DBSchema {
  projects: { key: string; value: Project };
  files: { key: string; value: { blob: Blob; name: string; type: string } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!dbp) {
    dbp = openDB<Schema>('clipper-kumparan', 1, {
      upgrade(d) {
        d.createObjectStore('projects', { keyPath: 'id' });
        d.createObjectStore('files');
      },
    });
  }
  return dbp;
}

export async function saveProject(p: Project) {
  try { await (await db()).put('projects', p); } catch (e) { console.warn('Gagal menyimpan proyek', e); }
}

export async function listProjects(): Promise<Project[]> {
  try {
    const all = await (await db()).getAll('projects');
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch { return []; }
}

export async function getProject(id: string): Promise<Project | undefined> {
  try { return await (await db()).get('projects', id); } catch { return undefined; }
}

export async function deleteProject(id: string) {
  const d = await db();
  await d.delete('projects', id);
  await d.delete('files', id);
}

/** Simpan salinan video supaya proyek bisa dibuka lagi tanpa memilih ulang file. */
export async function saveFile(id: string, file: File): Promise<boolean> {
  try {
    await (await db()).put('files', { blob: file, name: file.name, type: file.type }, id);
    return true;
  } catch (e) {
    console.warn('Video terlalu besar untuk disimpan di browser', e);
    return false;
  }
}

export async function getFile(id: string): Promise<File | null> {
  try {
    const r = await (await db()).get('files', id);
    return r ? new File([r.blob], r.name, { type: r.type }) : null;
  } catch { return null; }
}

export async function hasFile(id: string): Promise<boolean> {
  try { return !!(await (await db()).getKey('files', id)); } catch { return false; }
}

export async function clearAll() {
  const d = await db();
  await d.clear('projects');
  await d.clear('files');
}
