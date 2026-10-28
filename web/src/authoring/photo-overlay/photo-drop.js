// Analyze step 1 drop zone: pick the first image out of a drop's FileList
// (or any array-like), null when there is none.
export function firstImageFile(files) {
  if (!files) return null;
  for (let i = 0; i < files.length; i++) {
    if (files[i]?.type?.startsWith('image/')) return files[i];
  }
  return null;
}
