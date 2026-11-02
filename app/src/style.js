// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';

// Hand-brushed lettering for buttons, tags and signs (Caveat Brush, bundled via @fontsource).
export const FONT = `"Caveat Brush", "Segoe Print", "Bradley Hand", cursive`;
