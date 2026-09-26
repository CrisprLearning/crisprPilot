// Built-in graphics for the poster designer. Drop a PNG into
// /assets/poster-designer/ and it shows up in the sidebar automatically —
// Vite resolves the glob at build time (hashed URLs in production, raw in dev).
const modules = import.meta.glob('/assets/poster-designer/*.{png,PNG}', {
  eager: true,
  query: '?url',
  import: 'default',
});

function naturalCompare(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export const POSTER_ASSETS = Object.entries(modules)
  .map(([path, url]) => {
    const file = path.split('/').pop() || path;
    const name = file.replace(/\.[^.]+$/, '');
    return { id: `asset-${name}`, name, file, url };
  })
  .sort((a, b) => naturalCompare(a.file, b.file));
