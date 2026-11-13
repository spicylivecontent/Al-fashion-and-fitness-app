// Kroppens tvärsnitt modelleras som superellipser |x/a|^n + |z/b|^n = 1.
// n = 2 är en vanlig ellips; n > 2 ger den "rundade rektangel" som bål och höft
// faktiskt liknar. Samma modell används både för att räkna om bredd + djup till
// omkrets (skanning) och för att bygga 3D-avataren, så att de alltid stämmer överens.

/** Punkt på superellipsen vid vinkeln theta (radianer). */
export function superellipsePoint(a: number, b: number, n: number, theta: number): [number, number] {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const e = 2 / n;
  return [a * Math.sign(c) * Math.abs(c) ** e, b * Math.sign(s) * Math.abs(s) ** e];
}

const PERIMETER_STEPS = 720;

/** Omkrets för en superellips med halvaxlarna a och b. */
export function superellipsePerimeter(a: number, b: number, n = 2): number {
  if (a <= 0 || b <= 0) return 0;
  let sum = 0;
  let [px, pz] = superellipsePoint(a, b, n, 0);
  for (let i = 1; i <= PERIMETER_STEPS; i++) {
    const [x, z] = superellipsePoint(a, b, n, (i / PERIMETER_STEPS) * Math.PI * 2);
    sum += Math.hypot(x - px, z - pz);
    px = x;
    pz = z;
  }
  return sum;
}

/** Omkrets utifrån hel bredd och helt djup. */
export function circumferenceFromWidthDepth(width: number, depth: number, n = 2): number {
  return superellipsePerimeter(width / 2, depth / 2, n);
}

/**
 * Bredd och djup för ett tvärsnitt med given omkrets och givet förhållande djup/bredd.
 * Omkretsen skalar linjärt med storleken, så det räcker att mäta enhetsformen en gång.
 */
export function widthDepthFromCircumference(
  circumference: number,
  depthOverWidth: number,
  n = 2,
): { width: number; depth: number } {
  const unit = superellipsePerimeter(1, depthOverWidth, n);
  const a = circumference / unit;
  return { width: 2 * a, depth: 2 * a * depthOverWidth };
}

/** Formexponent per kroppsnivå. */
export const SECTION_EXPONENT = {
  chest: 2.6,
  waist: 2.3,
  hip: 2.5,
  limb: 2,
} as const;
