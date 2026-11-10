# Database koppelen (Firebase)

Het project **giants-veiling** bestaat al (Realtime Database in **europe-west1**).
`config.js` is al ingevuld (`type: "firebase"`). Wat jij nog moet doen:

1. Realtime Database → **Rules**: plak `firebase-rules.json` en klik **Publish**.
2. **Authentication → Sign-in method → Google** inschakelen.
3. **Authentication → Settings → Authorized domains**: voeg
   `jessevanas-commits.github.io` toe (localhost mag blijven staan).
4. Op de admin-pagina inloggen met **jesse.vanas@windrose.ai**.

De stappen hieronder zijn de volledige handleiding, voor het geval het project
ooit opnieuw moet worden opgezet.

# Volledige handleiding (als je opnieuw begint)

Er bleek **geen betrouwbare gratis JSON-backend zonder account** te zijn die we
vanuit de browser konden gebruiken. Daarom gebruiken we **Firebase Realtime
Database** (gratis Spark-plan, geen kredietkaart nodig), plus **Firebase
Authentication** (Google) zodat alleen Jesse contactgegevens kan lezen.

## 1. Project en database

1. Open [https://console.firebase.google.com](https://console.firebase.google.com) en log in.
2. **Add project**. Naam: `giants-veiling`. Google Analytics mag uit.
3. **Build → Realtime Database → Create Database**.
4. Locatie **europe-west1**. Start in test mode; de regels volgen zo.
5. Kopieer de database-URL, bijvoorbeeld
   `https://giants-veiling-default-rtdb.europe-west1.firebasedatabase.app`
6. Tandwiel → **Project settings** → **Your apps** → web-app (`</>`). Naam: `veiling`. Geen Firebase Hosting.
7. Kopieer `apiKey`, `authDomain`, `databaseURL` en `projectId` naar `config.js` en zet `type: "firebase"`.

## 2. Privacyregels publiceren

Onder Realtime Database → **Rules** plak je de inhoud van `firebase-rules.json` en klik je op **Publish**.

Die regels doen het volgende:

- `/auction` is **publiek leesbaar**. Daarin staan alleen bod, tijdstip, bieder-id en een publieke naam (voornaam + eerste letter achternaam). Geen e-mail, geen telefoon.
- `/contacts/<id>` bevat de volledige naam, e-mail en telefoon. **Schrijven** mag (met validatie, zonder account), zodat een bieder zich één keer kan registreren. **Lezen** mag enkel na Google-login als `jesse.vanas@windrose.ai`.

## 3. Google-login voor de admin (verplicht voor contactgegevens)

1. **Build → Authentication → Get started** (indien nog niet aan).
2. **Sign-in method** → **Google** → **Enable** → sla op. Kies een ondersteunings-e-mailadres.
3. **Authentication → Settings → Authorized domains**: voeg toe
   `jessevanas-commits.github.io`
   (en eventueel `localhost` voor lokale tests; `localhost` staat vaak al in de lijst.)
4. Het Google-account waarmee je contactgegevens wilt zien, moet exact dit adres hebben:
   **jesse.vanas@windrose.ai**
   Log op de admin-pagina in met dat account via de knop “Log in met Google”.

De `?admin=<token>`-link blijft werken voor het overzicht van biedingen en om een foutief bod te verwijderen. E-mail en telefoon verschijnen pas ná de Google-login.

## 4. Live zetten

Commit en push de ingevulde `config.js`. De site op GitHub Pages is daarna live.

Zolang `type` op `"none"` staat, zien bezoekers de site wel, maar worden
biedingen **niet** tussen telefoons gedeeld, en kunnen contactgegevens niet
privé worden bewaard.

## Beperkingen

- De database-URL en de admin-token staan in de frontend. Iemand die de broncode bekijkt, kan technisch biedingen overschrijven. Contactgegevens zijn daarmee niet automatisch zichtbaar: die zitten achter de Google-login en de rules.
- Een bieder schrijft zijn contactfiche onder een zelf gekozen id (opgeslagen in localStorage op zijn toestel). Wie dat id zou raden, zou de fiche in theorie kunnen overschrijven; hij kan ze niet lezen.
- Deel de admin-URL niet openbaar.
