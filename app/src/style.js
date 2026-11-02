// Which look to render. Watercolour is the look; `?style=flat` shows the old flat toon look for comparison.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = style.toLowerCase() !== 'flat';
