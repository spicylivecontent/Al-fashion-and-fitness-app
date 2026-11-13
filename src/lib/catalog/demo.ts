// Demokatalog. Produkterna är PÅHITTADE exempel med ungefärliga prisnivåer – de
// finns till för att appen ska gå att använda och testa utan AI-nyckel eller
// butiksavtal. I gränssnittet märks de alltid som "Demo" och har ingen köplänk.
// Riktiga produkter och priser kommer från AI-stylisten (src/lib/ai) eller, i en
// färdig tjänst, från butikernas produktflöden.

import type { BodyShape } from "../body/shape";
import type { GarmentFit, GarmentKind, Sex } from "../types";

export type Occasion = "vardag" | "jobb" | "fest";

export interface CatalogItem {
  id: string;
  title: string;
  kind: GarmentKind;
  fit: GarmentFit;
  priceSek: number;
  colorName: string;
  colorHex: string;
  sex: Sex | "unisex";
  styles: string[];
  occasions: Occasion[];
  /** Kroppsformer som plagget smickrar särskilt. Tom lista = fungerar för alla. */
  flatters: BodyShape[];
}

export const STYLE_OPTIONS = ["Minimalistisk", "Klassisk", "Sportig", "Street"] as const;

const all: Occasion[] = ["vardag", "jobb", "fest"];

function item(
  id: string,
  title: string,
  kind: GarmentKind,
  fit: GarmentFit,
  priceSek: number,
  colorName: string,
  colorHex: string,
  sex: Sex | "unisex",
  styles: string[],
  occasions: Occasion[],
  flatters: BodyShape[] = [],
): CatalogItem {
  return { id, title, kind, fit, priceSek, colorName, colorHex, sex, styles, occasions, flatters };
}

export const DEMO_CATALOG: CatalogItem[] = [
  // Överdelar
  item("t-vit", "T-shirt i kraftig bomull", "tshirt", "regular", 149, "Vit", "#f2f0ea", "unisex", ["Minimalistisk", "Klassisk", "Street"], ["vardag"]),
  item("t-svart", "T-shirt med rak passform", "tshirt", "regular", 149, "Svart", "#22242a", "unisex", ["Minimalistisk", "Street"], ["vardag", "fest"], ["oval", "apple"]),
  item("t-slim-marin", "Figurnära t-shirt", "tshirt", "slim", 199, "Marinblå", "#263352", "unisex", ["Sportig", "Minimalistisk"], ["vardag"], ["trapezoid", "inverted_triangle", "hourglass"]),
  item("t-over-sand", "Oversize-t-shirt", "tshirt", "oversized", 249, "Sand", "#cdbfa8", "unisex", ["Street"], ["vardag"], ["rectangle", "triangle", "pear"]),
  item("sk-oxford", "Oxfordskjorta", "shirt", "regular", 449, "Ljusblå", "#b9cbe3", "male", ["Klassisk", "Minimalistisk"], ["jobb", "fest"], ["rectangle", "triangle", "trapezoid"]),
  item("sk-vit-slim", "Skjorta med smal passform", "shirt", "slim", 499, "Vit", "#f4f3ef", "male", ["Klassisk"], ["jobb", "fest"], ["trapezoid", "inverted_triangle"]),
  item("sk-over", "Overshirt i twill", "shirt", "relaxed", 599, "Olivgrön", "#5d6447", "unisex", ["Street", "Minimalistisk"], ["vardag", "jobb"], ["oval", "apple", "rectangle", "triangle"]),
  item("bl-vit", "Blus med v-ringning", "shirt", "regular", 399, "Benvit", "#efe9dd", "female", ["Klassisk", "Minimalistisk"], ["jobb", "fest"], ["apple", "inverted_triangle", "hourglass"]),
  item("bl-monstrad", "Mönstrad blus med vid krage", "shirt", "relaxed", 449, "Rostorange", "#b5613c", "female", ["Klassisk", "Street"], ["jobb", "fest"], ["pear", "rectangle"]),
  item("tr-merino", "Finstickad tröja", "sweater", "regular", 599, "Grå", "#8b8f96", "unisex", ["Minimalistisk", "Klassisk"], ["jobb", "vardag"]),
  item("tr-kabel", "Kabelstickad tröja", "sweater", "relaxed", 699, "Krämvit", "#e8dfcd", "unisex", ["Klassisk"], ["vardag"], ["rectangle", "triangle", "pear"]),
  item("tr-polo", "Stickad polotröja", "sweater", "slim", 549, "Svart", "#24262b", "unisex", ["Minimalistisk"], ["jobb", "fest"], ["hourglass", "trapezoid", "inverted_triangle"]),
  item("ho-gra", "Hoodie i borstad bomull", "hoodie", "relaxed", 449, "Gråmelerad", "#9a9da3", "unisex", ["Sportig", "Street"], ["vardag"]),
  item("ho-svart", "Hoodie med dragkedja", "hoodie", "regular", 499, "Svart", "#25272c", "unisex", ["Sportig", "Street"], ["vardag"], ["oval", "apple"]),

  // Ytterplagg
  item("ja-jeans", "Jeansjacka", "jacket", "regular", 699, "Mellanblå", "#5b7699", "unisex", ["Street", "Klassisk"], ["vardag"], ["pear", "triangle", "rectangle"]),
  item("ja-kavaj", "Kavaj med markerad axel", "jacket", "regular", 1199, "Marinblå", "#232c44", "unisex", ["Klassisk", "Minimalistisk"], ["jobb", "fest"], ["rectangle", "triangle", "pear", "apple", "oval"]),
  item("ja-bomber", "Bomberjacka", "jacket", "relaxed", 899, "Mörkgrön", "#39463a", "unisex", ["Street", "Sportig"], ["vardag"], ["rectangle", "triangle"]),
  item("ko-ull", "Rak ullrock", "coat", "regular", 1799, "Kamel", "#b08a5b", "unisex", ["Klassisk", "Minimalistisk"], ["jobb", "fest"], ["apple", "oval", "inverted_triangle"]),

  // Underdelar
  item("je-rak", "Jeans med rak passform", "jeans", "regular", 499, "Mörkblå", "#2c3a55", "unisex", ["Klassisk", "Minimalistisk", "Street"], all),
  item("je-slim", "Jeans med smal passform", "jeans", "slim", 549, "Svart", "#1f2126", "unisex", ["Minimalistisk", "Street"], all, ["apple", "oval", "trapezoid"]),
  item("je-vid", "Jeans med vida ben", "jeans", "relaxed", 599, "Ljusblå", "#8fa7c4", "unisex", ["Street"], ["vardag"], ["inverted_triangle", "hourglass", "rectangle"]),
  item("by-chinos", "Chinos", "trousers", "regular", 449, "Beige", "#c2b08c", "male", ["Klassisk", "Minimalistisk"], ["jobb", "vardag"]),
  item("by-kostym", "Kostymbyxor", "trousers", "slim", 699, "Mörkgrå", "#3a3d44", "unisex", ["Klassisk", "Minimalistisk"], ["jobb", "fest"], ["trapezoid", "inverted_triangle", "apple", "oval"]),
  item("by-vida", "Vida byxor med hög midja", "trousers", "relaxed", 549, "Svart", "#222429", "female", ["Minimalistisk", "Klassisk"], ["jobb", "fest"], ["inverted_triangle", "hourglass", "rectangle"]),
  item("by-jogger", "Mjukisbyxor", "trousers", "relaxed", 349, "Grå", "#7d8087", "unisex", ["Sportig", "Street"], ["vardag"]),
  item("sh-chino", "Chinosshorts", "shorts", "regular", 299, "Marinblå", "#28324d", "unisex", ["Klassisk", "Sportig"], ["vardag"]),
  item("kj-a", "A-linjeformad kjol", "skirt", "regular", 399, "Svart", "#24262b", "female", ["Klassisk", "Minimalistisk"], all, ["pear", "hourglass", "rectangle"]),
  item("kj-penna", "Pennkjol", "skirt", "slim", 449, "Mörkgrå", "#3b3e45", "female", ["Klassisk"], ["jobb", "fest"], ["hourglass", "inverted_triangle"]),

  // Klänningar
  item("kl-omlott", "Omlottklänning", "dress", "regular", 699, "Vinröd", "#6d2b3a", "female", ["Klassisk"], ["fest", "jobb"], ["hourglass", "pear", "apple"]),
  item("kl-rak", "Rak klänning", "dress", "relaxed", 599, "Svart", "#222429", "female", ["Minimalistisk"], ["fest", "jobb"], ["apple", "rectangle", "inverted_triangle"]),
  item("kl-skjort", "Skjortklänning med skärp", "dress", "regular", 649, "Olivgrön", "#646b4b", "female", ["Klassisk", "Street"], ["vardag", "jobb"], ["rectangle", "pear", "hourglass"]),

  // Skor
  item("sk-sneaker-vit", "Sneakers i läder", "shoes", "regular", 699, "Vit", "#eeece6", "unisex", ["Minimalistisk", "Sportig", "Street", "Klassisk"], ["vardag", "jobb"]),
  item("sk-sneaker-svart", "Sneakers i canvas", "shoes", "regular", 399, "Svart", "#222327", "unisex", ["Street", "Sportig", "Minimalistisk"], ["vardag"]),
  item("sk-lader", "Derbyskor i läder", "shoes", "regular", 999, "Brun", "#5a3a26", "male", ["Klassisk"], ["jobb", "fest"]),
  item("sk-loafer", "Loafers", "shoes", "regular", 799, "Svart", "#1e1f23", "unisex", ["Klassisk", "Minimalistisk"], ["jobb", "fest"]),
  item("sk-boots", "Ankelboots", "shoes", "regular", 899, "Svart", "#202125", "female", ["Klassisk", "Street", "Minimalistisk"], ["fest", "jobb", "vardag"]),
];
