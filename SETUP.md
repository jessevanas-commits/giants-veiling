# Database koppelen (nodig voor live, gedeelde biedingen)

Er bleek **geen betrouwbare gratis JSON-backend zonder account** te zijn die we
vanuit de browser konden gebruiken:

- jsonblob.com wordt door Cloudflare geblokkeerd (ook vanuit Chrome)
- jsonstorage.net vraagt nu een API-sleutel en heeft te lage limieten voor een volle zaal (1.000 requests per maand)
- npoint, jsonbin, ExtendsClass, Pantry, kvdb en myjson vragen een account of werken niet zonder sleutel

Daarom gebruiken we **Firebase Realtime Database** (gratis Spark-plan, geen
kredietkaart nodig). Dat is ook de beste keuze voor een volle Lotto Arena:
biedingen komen live binnen en gelijktijdige biedingen worden netjes
afgehandeld.

## Stappen (ongeveer 5 minuten)

1. Open [https://console.firebase.google.com](https://console.firebase.google.com) en log in met een Google-account (bijvoorbeeld dat van Jesse of van het Show Team).
2. Klik op **Add project** / **Project toevoegen**. Naam: `giants-veiling`. Google Analytics mag uit.
3. In het project: **Build → Realtime Database → Create Database**.
4. Kies locatie **europe-west1** (België/Europa).
5. Start in **test mode** (we zetten zo de regels goed).
6. Kopieer de database-URL, die lijkt op:
   `https://giants-veiling-default-rtdb.europe-west1.firebasedatabase.app`
7. Ga naar het tandwiel → **Project settings** → onder **Your apps** een **web-app** toevoegen (`</>`). Naam: `veiling`. Geen Firebase Hosting aanvinken.
8. Kopieer uit het stukje config: `apiKey`, `authDomain`, `databaseURL` en `projectId`.
9. Open in deze map het bestand `config.js` en vul die vier velden in. Zet ook:
   `type: "firebase"`
10. Onder Realtime Database → **Rules** plak je de inhoud van `firebase-rules.json` en klik je op **Publish**.
11. Commit en push de gewijzigde `config.js` naar deze repository. De site op GitHub Pages toont daarna live biedingen.

Zolang `type` op `"none"` staat, zien bezoekers de site wel, maar worden
biedingen **niet** tussen telefoons gedeeld.

## Alternatief: jsonbin.io

Als Firebase te veel voelt: maak een gratis account op [jsonbin.io](https://jsonbin.io),
maak één bin met als inhoud `{"rev":0,"items":{}}`, en zet in `config.js`:

```
type: "json",
jsonUrl: "https://api.jsonbin.io/v3/b/JOUW_BIN_ID"
```

Let op: je API-sleutel zou dan in de website staan, en het gratis plan is
minder geschikt voor honderden telefoons die om de paar seconden vernieuwen.
Firebase blijft de aanrader.

## Beperkingen (belangrijk)

De database-URL en de admin-token staan in de frontend. Iemand die de
broncode of de netwerkrequests bekijkt, kan technisch biedingen overschrijven
of verwijderen. Voor een avondveiling in de zaal is dat meestal aanvaardbaar;
het is geen bankkluis. Deel de admin-URL niet openbaar.
