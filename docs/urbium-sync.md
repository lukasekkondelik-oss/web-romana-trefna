# Urbium (eurobydleni.cz) sync

Automaticky synchronizuje nabídku nemovitostí z Urbium feedu klientky na tento
statický web, podle doporučeného postupu, který Urbium poslalo e-mailem.

## Jak to funguje

1. `.github/workflows/urbium-sync.yml` spouští `npm run sync`
   (`scripts/sync-urbium.mjs`) přes GitHub Actions — ručně (`workflow_dispatch`)
   nebo plánovaně (cron, po ověření zatím vypnuto, viz níže).
2. Skript stáhne seznam nemovitostí z Urbia, porovná s naším uloženým stavem
   v `data/urbium-properties.json` a podle Urbiem doporučené logiky (insert /
   update / beze změny / deaktivace) vytvoří frontu akcí.
3. Zpracuje omezený počet akcí za běh (`MAX_ACTIONS_PER_RUN` v
   `scripts/config.mjs`), s odstupem ~60 s mezi jednotlivými voláními detailu
   (Urbium to výslovně žádá). Zbytek zůstává ve frontě na příští běh.
4. Pro každou novou/aktualizovanou nemovitost stáhne fotky do
   `images/nemovitosti/{property_id}/` a vygeneruje/aktualizuje statickou
   HTML stránku (`nemovitost-*.html`) ze šablony `scripts/templates/property.html`.
5. Přegeneruje jen vyznačený blok karet na homepage (`index.html`, mezi
   `<!-- URBIUM:LISTINGS:START -->` a `...END -->`) a blok URL v `sitemap.xml`.
6. Pokud se něco změnilo, commitne a pushne přímo (nebo otevře PR, viz `mode`
   input workflow).

Web nikdy nečte živá XML data Urbia přímo — vždy jen z `data/urbium-properties.json`
a z vygenerovaných HTML stránek.

## Pokud se ukáže jiné XML schéma, než jsme čekali

Přesná jména XML polí (např. jestli je to `last_modified` nebo něco jiného)
nebyla při psaní tohoto kódu ověřena proti reálnému feedu (síťové omezení
vývojového prostředí). Jediné místo, které je potřeba případně opravit, je
**`scripts/lib/xml-schema.mjs`** — funkce `mapListEntry`/`mapDetailEntry`/
`extractListEntries` už zkoušejí několik pravděpodobných variant názvů polí,
ale je dobré je ověřit.

Pro ověření: spusťte workflow ručně s zaškrtnutým `debug_schema` — do logu
běhu se vypíše syrová struktura prvního záznamu ze seznamu i detailu (nikam
se necommituje).

## Nastavení GitHub Secrets

**Settings → Secrets and variables → Actions → New repository secret**:
- `URBIUM_USERNAME` = `6993`
- `URBIUM_PASSWORD` = `rt12345`

Tyto hodnoty se nikde jinde v repozitáři neobjevují (nejsou v kódu ani v
`data/urbium-properties.json`) — skript je čte jen za běhu z prostředí.

## Bezpečné zapnutí (rollout)

1. Workflow má zatím jen `workflow_dispatch` (žádný cron) — spusťte ho ručně.
2. Přidejte secrets výše.
3. Spusťte s `debug_schema: true`, zkontrolujte log, případně opravte
   `scripts/lib/xml-schema.mjs`.
4. Spusťte s `mode: pr` — zkontrolujte vygenerovaný Pull Request (nová
   stránka nemovitosti, obrázky, změny na homepage a v sitemap.xml).
5. Po schválení PR sloučit, zkontrolovat nasazení na Vercelu.
6. Až pak v `.github/workflows/urbium-sync.yml` odkomentovat `schedule:` blok
   a nechat `mode` na výchozím `direct`.

## Dvě stávající ruční nemovitosti

`nemovitost-smichov-dva-byty.html` a `nemovitost-smichov-atypicky-byt.html`
nemají `property_id` a automatika se jich netýká — zůstávají spravované ručně.
