// Which look to render. `?style=watercolour` (or watercolor) switches the whole scene to the painted look;
// the default is still the flat toon look while we compare the two.
const style = new URLSearchParams(location.search).get('style') || '';
export const WATERCOLOUR = /^watercolou?r$/i.test(style);
