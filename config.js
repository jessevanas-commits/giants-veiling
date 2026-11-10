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

  /* Backend
     type: "none"     – biedingen worden NIET gedeeld (tijdelijk, tot de database klaar is)
     type: "firebase" – aanbevolen: Realtime Database, zie SETUP.md
     type: "json"     – een CORS JSON-store met GET + PUT op één URL
  */
  backend: {
    type: "none",
    // Firebase: vul in na het aanmaken van het project (SETUP.md).
    firebase: {
      apiKey: "",
      authDomain: "",
      databaseURL: "",
      projectId: ""
    },
    // Alternatief: volledige GET/PUT-URL van een JSON-blob.
    jsonUrl: ""
  },

  items: [
    {
      id: "jersey1",
      title: "Jersey — lot 1",
      blurb: "Een van drie identieke gedragen wedstrijdshirts.",
      image: "assets/jersey.jpg",
      startBid: 25,
      group: "jersey"
    },
    {
      id: "jersey2",
      title: "Jersey — lot 2",
      blurb: "Een van drie identieke gedragen wedstrijdshirts.",
      image: "assets/jersey.jpg",
      startBid: 25,
      group: "jersey"
    },
    {
      id: "jersey3",
      title: "Jersey — lot 3",
      blurb: "Een van drie identieke gedragen wedstrijdshirts.",
      image: "assets/jersey.jpg",
      startBid: 25,
      group: "jersey"
    },
    {
      id: "ball",
      title: "Wedstrijdbal",
      blurb: "De bal van deze wedstrijd.",
      image: "assets/bal.jpg",
      startBid: 15
    }
  ]
};
