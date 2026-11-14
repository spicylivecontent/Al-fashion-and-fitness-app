# Passform

Kläder och hälsa efter din kropp. Passform är en webbapp där man:

1. fyller i kön, längd, vikt och budget,
2. laddar upp bilder eller filmklipp på sig själv (åtsittande kläder eller utan kläder),
3. får sina kroppsmått uträknade och en roterbar 3D-avatar byggd av dem,
4. får kompletta outfits valda efter kroppsform och budget, provar dem på avataren och ser vilken storlek som passar,
5. lägger plaggen i en varukorg och beställer,
6. får ett träningsschema (med eller utan gymkort) och en kostplan inom matbudgeten.

Appen fungerar direkt i demoläge. Med en AI-nyckel söker den upp riktiga plagg och aktuella pris på nätet.

## Kom igång

Kräver Node.js 20 eller senare.

```bash
npm install        # hämtar även analysmodellen (cirka 30 MB) till public/mediapipe
npm run dev        # http://localhost:3000
```

Valfritt, för AI-läget: kopiera `.env.example` till `.env.local` och fyll i `ANTHROPIC_API_KEY`. Utan nyckel används en inbyggd demokatalog och regelbaserade planer.

```bash
npm test           # enhetstester
npm run typecheck
npm run build && npm start
```

## Integritet och säkerhet

Appen hanterar nakenbilder, så den är byggd för att bilderna aldrig ska lämna användarens enhet.

- **Bilderna analyseras i webbläsaren.** Kroppsdetektionen (MediaPipe) körs lokalt som WebAssembly. Bilderna laddas aldrig upp, sparas aldrig och skickas inte till AI-tjänsten. Efter analysen släpps bildminnet direkt; bara de uträknade måtten finns kvar.
- **Automatisk täckning.** Den enda bild som visas är en liten, suddad miniatyr där könsorgan (och bröst hos kvinnor) är täckta av heltäckande block. Hittas ingen kropp pixlas hela bilden.
- **Avataren är en neutral docka.** Den byggs av måtten, inte av bilderna, har inga anatomiska detaljer och bär alltid underkläder. Det finns inget läge där den visas utan.
- **Endast vuxna.** Användaren måste ange en ålder på minst 18 år och intyga att bilderna föreställer hen själv. Servern avvisar förfrågningar som saknar intygandet.
- **Ingen databas.** Profil, mått, varukorg och beställningar sparas i webbläsarens `localStorage` och kan raderas med "Radera all min data".
- **AI-läget** skickar bara siffror och önskemål (mått, budget, stil, mål) till AI-tjänsten. API-nyckeln finns bara på servern.

## Så fungerar det

### Kroppsmått

1. **Uppskattning.** Kön, längd och vikt ger statistiska startvärden (`src/lib/body/estimate.ts`).
2. **Skanning.** I varje bild hittar MediaPipe ledpunkter och kroppens siluett. Eftersom längden är känd ger avståndet hjässa–häl skalan (cm per pixel). Framifrån mäts bredder, från sidan djup (`src/lib/scan/measure.ts`).
3. **Omkrets.** Bredd och djup räknas om till omkrets med en superellips, en "rundad rektangel" som liknar kroppens tvärsnitt bättre än en ellips (`src/lib/body/superellipse.ts`).
4. **Sammanvägning.** Varje mått vägs mot uppskattningen. Ju fler bilder som bekräftar ett mått, desto mer litar appen på skanningen. Därför blir resultatet bättre med fler bilder (`src/lib/scan/aggregate.ts`).

Filmklipp delas upp i stillbilder. Rutor där kroppen är snett vriden sorteras bort, liksom ställningar som inte går att mäta (böjda ben, armar i luften, framåtlutning). Användaren kan alltid skriva in egna mått.

### 3D-avatar och provning

Kroppen beskrivs som tvärsnitt längs bål, ben och armar (`src/lib/avatar/model.ts`). Ett plagg är samma tvärsnitt plus rörelsevidd, där vidden räknas ut ur plaggets mått i vald storlek minus kroppens mått (`src/lib/avatar/parts.ts`). En för liten storlek syns därför direkt, och "Visa passform" färgar plagget efter hur det sitter: rött för trångt, gult för tajt, grönt för bra och blått för löst.

Provningen visar längd, vidd och passform. Den simulerar inte hur tyget faller eller veckar sig.

### Storleksguide

Kroppens mått jämförs med plaggets mått i varje storlek, och appen väljer den storlek som hamnar närmast tänkt passform. För liten väger tyngre än för stor (`src/lib/sizing/index.ts`). Jeans får W/L, där L kommer från innerbenet.

### Stylist

- **Demoläge.** En regelmotor väljer plagg ur en påhittad demokatalog utifrån kroppsform, stil och budget. Demoplaggen är märkta "Demo" och går inte att köpa.
- **AI-läge.** Claude söker på nätet efter riktiga plagg i svenska nätbutiker. Svaret kontrolleras sedan i koden: en länk godkänns bara om den pekar på en sida som fanns i sökresultaten, och varje outfit måste rymmas i budgeten. Annars tas tillvalsplagg bort eller hela outfiten stryks (`src/lib/ai/stylist.ts`).

### Träning och kost

Energi- och proteinmål räknas ut i koden (Mifflin–St Jeor plus aktivitetsnivå), aldrig av AI:n. Det gör att säkerhetsgränserna alltid gäller:

- ingen viktnedgång vid lågt BMI,
- lägst 1 300 kcal per dag för kvinnor och 1 600 för män,
- varningar vid undervikt och kraftig övervikt.

I demoläget kommer schema och meny från mallar med schablonpriser. Portionerna skalas mot målen, och en billigare meny väljs om budgeten är snäv. I AI-läget slår Claude upp aktuella priser i svenska matbutiker och anger var varje pris kommer från (`src/lib/ai/plan.ts`).

## Beställning – vad som finns och vad som saknas

Varukorgen sparar plagg, storlek och leveransadress som en beställning. Beställningen grupperar plaggen per butik och länkar till varje produktsida, där användaren själv slutför köpet.

**Appen köper inget automatiskt.** Att låta appen ta betalt och sedan själv lägga beställningar hos andra butiker (dropshipping) kräver sådant som inte går att bygga in i koden ensamt:

- **Avtal med butikerna** eller ett affiliatenätverk med produktflöden och order-API, till exempel Adtraction eller Awin. Att automatiskt handla på andra butikers webbplatser bryter oftast mot deras villkor.
- **Betalning** via en betaltjänst som Stripe eller Klarna, med företagskonto.
- **Ett registrerat företag** som tar ansvar som säljare enligt konsumentköplagen och distansavtalslagen: 14 dagars ångerrätt, returer, reklamationer och kundtjänst.

Datamodellen (`Order` med status `awaiting_purchase` och `purchased`) är förberedd för att en sådan integration kan läggas in i ett senare steg.

## Begränsningar

- **Precisionen är bara verifierad mot syntetiska kroppar.** Testerna ritar siluetter av kroppsmodellen och kontrollerar att mätningen återskapar måtten: inom cirka 1 % för bröst, midja och höft, och inom ett par cm för innerben och ärmlängd. Mot riktiga människor och måttband är metoden inte utvärderad ännu. Det är nästa viktiga steg.
- **Storlekstabellerna är generiska.** Märken skiljer sig åt. Butikernas egna måttabeller bör användas när de finns.
- **Löst sittande kläder** på bilderna ger för stora mått. Appen ber om åtsittande kläder.
- **AI-priser** kommer från webbsökningar och kan ha ändrats. Datumet visas, och användaren uppmanas kontrollera hos butiken.
- **Tränings- och kostplanen** är allmän vägledning och ersätter inte vården.

## Projektstruktur

```
src/
  app/                  Next.js: sida, layout, stilmall och API-rutter (/api/stylist, /api/plan, /api/status)
  components/           Skärmarna: profil, skanning, avatar, stil, plan, varukorg och 3D-vyn
  lib/
    body/               Måttuppskattning, superellips, kroppsform
    scan/               Bildmätning, sammanvägning, täckning, MediaPipe, video
    avatar/             Kroppsmodell, plagg och three.js-geometri
    sizing/             Storleksguide
    catalog/            Demokatalog
    stylist/            Regelbaserad stylist
    plan/               Energimål, träningsschema och kostplan
    ai/                 Claude-koppling med webbsökning
    store.tsx           Appens tillstånd (localStorage)
tests/                  Enhetstester och syntetiska siluetter
scripts/                Hämtar MediaPipe-filerna vid installation
```
