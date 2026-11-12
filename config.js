/* =====================================================================
   VEILING – instellingen
   Pas hier de sluitingstijd, startbedragen en de backend aan.
   ===================================================================== */
window.CONFIG = {
  // Sluiting van de veiling (Europe/Brussels). Standaard: vr 20/11/2026 21:30.
  // De wedstrijd zelf blijft zaterdag 14 november.
  closeAt: "2026-11-20T21:30:00+01:00",

  // Minimumverhoging in hele euro's: elk bod moet minstens dit bedrag
  // hoger zijn dan het huidige hoogste bod (of gelijk aan het startbod
  // als er nog niet geboden is).
  minIncrement: 1,

  refreshMs: 3500,

  // Geheim adres: voeg ?admin=<token> toe aan de site-URL.
  // Dit is geen sterke beveiliging (de token staat in dit bestand).
  adminToken: "wga14-XCmzNKWV2R1zq0gaw2AeBGl_",

  // Google-account dat contactgegevens mag lezen (Firebase Auth).
  adminEmail: "jesse.vanas@windrose.ai",

  /* Backend
     type: "none"     – biedingen worden NIET gedeeld (tijdelijk, tot de database klaar is)
     type: "firebase" – aanbevolen: Realtime Database, zie SETUP.md
     type: "json"     – een CORS JSON-store met GET + PUT op één URL
  */
  backend: {
    type: "firebase",
    // Firebase project giants-veiling (Realtime Database, europe-west1).
    firebase: {
      apiKey: "AIzaSyAoVJMKiuVDSqqyMW4vE6dbbcZ5SW5IUSE",
      authDomain: "giants-veiling.firebaseapp.com",
      databaseURL: "https://giants-veiling-default-rtdb.europe-west1.firebasedatabase.app",
      projectId: "giants-veiling",
      storageBucket: "giants-veiling.firebasestorage.app",
      messagingSenderId: "1041321597797",
      appId: "1:1041321597797:web:67f02a60be91add51c9f8c"
    },
    // Alternatief: volledige GET/PUT-URL van een JSON-blob.
    jsonUrl: ""
  },

  items: [
    {
      id: "jersey1",
      title: "Gesigneerde jersey PACK #9",
      blurb: "Gesigneerde jersey van PACK, rugnummer 9.",
      image: "assets/jersey-pack-studio.jpg",
      startBid: 50
    },
    {
      id: "jersey2",
      title: "Gesigneerde jersey TUMBA #24",
      blurb: "Gesigneerde jersey van TUMBA, rugnummer 24.",
      image: "assets/jersey-tumba-studio.jpg",
      startBid: 50
    },
    {
      id: "jersey3",
      title: "Gesigneerde jersey KESTELOOT #32",
      blurb: "Gesigneerde jersey van KESTELOOT, rugnummer 32.",
      image: "assets/jersey-kesteloot-studio.jpg",
      startBid: 50
    },
    {
      id: "ball",
      title: "Wedstrijdbal",
      blurb: "Gesigneerde wedstrijdbal.",
      image: "assets/bal-studio.jpg",
      startBid: 15
    }
  ]
};
