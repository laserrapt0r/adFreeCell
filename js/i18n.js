/* adFreeCell - internationalization. Languages: de, en, es, fr, it.
   Missing keys fall back to English. */
(function () {
  'use strict';

  var STRINGS = {
    de: {
      tagline: 'FreeCell. Kein Werbebanner. Keine Tracker. Nur Karten.',
      newGame: 'Neues Spiel', restart: 'Neu starten', undo: 'Zurück', redo: 'Vor',
      hint: 'Tipp', autoFinish: 'Auflösen', menu: 'Menü', close: 'Schließen', back: 'Zurück',
      gameLabel: 'Spiel', movesLabel: 'Züge', timeLabel: 'Zeit',
      settings: 'Einstellungen', language: 'Sprache', sound: 'Sound', theme: 'Design',
      autoCollect: 'Auto-Aufräumen', autoCollectHint: 'Sichere Karten automatisch ablegen',
      showTimer: 'Zeit anzeigen', on: 'An', off: 'Aus',
      themeFelt: 'Filz', themeMidnight: 'Mitternacht', themeSlate: 'Schiefer',
      statsTitle: 'Statistik', played: 'Gespielt', won: 'Gewonnen', winRate: 'Quote',
      currentStreak: 'Serie', bestStreak: 'Beste Serie', bestTime: 'Bestzeit', fewestMoves: 'Wenigste Züge',
      resetStats: 'Statistik zurücksetzen', resetStatsConfirm: 'Statistik wirklich zurücksetzen?',
      howToTitle: 'So wird gespielt',
      howto1: 'Lege alle Karten auf die vier Ablagen oben rechts – nach Farbe von Ass bis König.',
      howto2: 'Im Spielfeld baust du absteigend in wechselnder Farbe (z. B. rote 6 auf schwarze 7).',
      howto3: 'Die vier Freizellen oben links halten je eine Karte als Zwischenlager.',
      howto4: 'Doppelklick oder -tipp schickt eine Karte automatisch auf die Ablage.',
      howto5: 'Mehrere Karten auf einmal gehen nur, wenn genug Freizellen und leere Spalten frei sind.',
      gotIt: 'Los geht’s',
      selectGameTitle: 'Spiel wählen', gameNumberPh: 'Nummer (1–' , randomGame: 'Zufällig',
      start: 'Starten', cancel: 'Abbrechen',
      wonTitle: 'Gewonnen!', wonMsg: 'Gelöst in {moves} Zügen und {time}.',
      playAgain: 'Nochmal', nextGame: 'Nächstes Spiel',
      resume: 'Fortsetzen', hintNone: 'Kein Zug gefunden – vielleicht hilft die Auflösen-Taste.',
      unsolvable: 'Spiel #11982 gilt als unlösbar – viel Glück!',
      newGameConfirm: 'Läuft noch. Neues Spiel starten?',
      restartConfirm: 'Dieses Spiel neu starten?',
      cardsLicense: 'Kartengrafik: „SVG-cards“ von David Bellot (LGPL-2.1).',
      installApp: 'App installieren', shareApp: 'Weiterempfehlen', linkCopied: 'Link kopiert!',
      supportDev: 'Entwickler unterstützen',
    },
    en: {
      tagline: 'FreeCell. No ad banner. No trackers. Just cards.',
      newGame: 'New game', restart: 'Restart', undo: 'Undo', redo: 'Redo',
      hint: 'Hint', autoFinish: 'Auto-finish', menu: 'Menu', close: 'Close', back: 'Back',
      gameLabel: 'Game', movesLabel: 'Moves', timeLabel: 'Time',
      settings: 'Settings', language: 'Language', sound: 'Sound', theme: 'Theme',
      autoCollect: 'Auto-collect', autoCollectHint: 'Send safe cards home automatically',
      showTimer: 'Show timer', on: 'On', off: 'Off',
      themeFelt: 'Felt', themeMidnight: 'Midnight', themeSlate: 'Slate',
      statsTitle: 'Statistics', played: 'Played', won: 'Won', winRate: 'Win rate',
      currentStreak: 'Streak', bestStreak: 'Best streak', bestTime: 'Best time', fewestMoves: 'Fewest moves',
      resetStats: 'Reset statistics', resetStatsConfirm: 'Really reset your statistics?',
      howToTitle: 'How to play',
      howto1: 'Move every card to the four foundations (top right) – by suit from Ace to King.',
      howto2: 'In the tableau build down in alternating colours (e.g. a red 6 on a black 7).',
      howto3: 'The four free cells (top left) each hold a single card as temporary storage.',
      howto4: 'Double-click or double-tap a card to send it straight to its foundation.',
      howto5: 'You can move several cards at once only if enough free cells and empty columns are open.',
      gotIt: 'Let’s go',
      selectGameTitle: 'Choose a game', gameNumberPh: 'Number (1–', randomGame: 'Random',
      start: 'Start', cancel: 'Cancel',
      wonTitle: 'You won!', wonMsg: 'Solved in {moves} moves and {time}.',
      playAgain: 'Play again', nextGame: 'Next game',
      resume: 'Resume', hintNone: 'No move found – the auto-finish button might help.',
      unsolvable: 'Game #11982 is famously unsolvable – good luck!',
      newGameConfirm: 'A game is in progress. Start a new one?',
      restartConfirm: 'Restart this game?',
      cardsLicense: 'Card artwork: “SVG-cards” by David Bellot (LGPL-2.1).',
      installApp: 'Install app', shareApp: 'Recommend', linkCopied: 'Link copied!',
      supportDev: 'Support the developer',
    },
    es: {
      tagline: 'FreeCell. Sin anuncios. Sin rastreadores. Solo cartas.',
      newGame: 'Partida nueva', restart: 'Reiniciar', undo: 'Deshacer', redo: 'Rehacer',
      hint: 'Pista', autoFinish: 'Autocompletar', menu: 'Menú', close: 'Cerrar', back: 'Atrás',
      gameLabel: 'Juego', movesLabel: 'Movim.', timeLabel: 'Tiempo',
      settings: 'Ajustes', language: 'Idioma', sound: 'Sonido', theme: 'Tema',
      autoCollect: 'Auto-recoger', autoCollectHint: 'Enviar cartas seguras automáticamente',
      showTimer: 'Mostrar tiempo', on: 'Sí', off: 'No',
      themeFelt: 'Fieltro', themeMidnight: 'Medianoche', themeSlate: 'Pizarra',
      statsTitle: 'Estadísticas', played: 'Jugadas', won: 'Ganadas', winRate: 'Victorias',
      currentStreak: 'Racha', bestStreak: 'Mejor racha', bestTime: 'Mejor tiempo', fewestMoves: 'Menos movim.',
      resetStats: 'Reiniciar estadísticas', resetStatsConfirm: '¿Reiniciar las estadísticas?',
      howToTitle: 'Cómo jugar',
      howto1: 'Lleva todas las cartas a las cuatro bases (arriba a la derecha), por palo del As al Rey.',
      howto2: 'En el tablero se construye hacia abajo alternando color (un 6 rojo sobre un 7 negro).',
      howto3: 'Las cuatro celdas libres (arriba izq.) guardan una carta cada una.',
      howto4: 'Doble clic o doble toque envía una carta directamente a su base.',
      howto5: 'Puedes mover varias cartas a la vez solo si hay suficientes celdas y columnas libres.',
      gotIt: 'Vamos',
      selectGameTitle: 'Elegir partida', gameNumberPh: 'Número (1–', randomGame: 'Aleatorio',
      start: 'Empezar', cancel: 'Cancelar',
      wonTitle: '¡Ganaste!', wonMsg: 'Resuelto en {moves} movimientos y {time}.',
      playAgain: 'Otra vez', nextGame: 'Siguiente',
      resume: 'Continuar', hintNone: 'No hay jugada – prueba el autocompletar.',
      unsolvable: 'El juego n.º 11982 no tiene solución – ¡suerte!',
      newGameConfirm: 'Hay una partida en curso. ¿Empezar otra?',
      restartConfirm: '¿Reiniciar esta partida?',
      cardsLicense: 'Cartas: «SVG-cards» de David Bellot (LGPL-2.1).',
      installApp: 'Instalar app', shareApp: 'Recomendar', linkCopied: 'Enlace copiado',
      supportDev: 'Apoyar al desarrollador',
    },
    fr: {
      tagline: 'FreeCell. Sans pub. Sans traqueurs. Juste des cartes.',
      newGame: 'Nouvelle partie', restart: 'Recommencer', undo: 'Annuler', redo: 'Refaire',
      hint: 'Indice', autoFinish: 'Terminer', menu: 'Menu', close: 'Fermer', back: 'Retour',
      gameLabel: 'Partie', movesLabel: 'Coups', timeLabel: 'Temps',
      settings: 'Réglages', language: 'Langue', sound: 'Son', theme: 'Thème',
      autoCollect: 'Auto-rangement', autoCollectHint: 'Envoyer les cartes sûres automatiquement',
      showTimer: 'Afficher le temps', on: 'Oui', off: 'Non',
      themeFelt: 'Feutre', themeMidnight: 'Minuit', themeSlate: 'Ardoise',
      statsTitle: 'Statistiques', played: 'Jouées', won: 'Gagnées', winRate: 'Réussite',
      currentStreak: 'Série', bestStreak: 'Meilleure série', bestTime: 'Meilleur temps', fewestMoves: 'Moins de coups',
      resetStats: 'Réinitialiser les stats', resetStatsConfirm: 'Réinitialiser les statistiques ?',
      howToTitle: 'Comment jouer',
      howto1: 'Amenez toutes les cartes vers les quatre fondations (en haut à droite), par couleur de l’As au Roi.',
      howto2: 'Sur le tableau, on descend en alternant les couleurs (un 6 rouge sur un 7 noir).',
      howto3: 'Les quatre cellules libres (en haut à gauche) contiennent chacune une carte.',
      howto4: 'Double-clic ou double-tap envoie une carte directement sur sa fondation.',
      howto5: 'Déplacer plusieurs cartes n’est possible qu’avec assez de cellules et de colonnes vides.',
      gotIt: 'C’est parti',
      selectGameTitle: 'Choisir une partie', gameNumberPh: 'Numéro (1–', randomGame: 'Aléatoire',
      start: 'Démarrer', cancel: 'Annuler',
      wonTitle: 'Gagné !', wonMsg: 'Résolu en {moves} coups et {time}.',
      playAgain: 'Rejouer', nextGame: 'Suivante',
      resume: 'Reprendre', hintNone: 'Aucun coup trouvé – essayez « Terminer ».',
      unsolvable: 'La partie n° 11982 est réputée insoluble – bonne chance !',
      newGameConfirm: 'Une partie est en cours. En commencer une autre ?',
      restartConfirm: 'Recommencer cette partie ?',
      cardsLicense: 'Cartes : « SVG-cards » de David Bellot (LGPL-2.1).',
      installApp: 'Installer l’app', shareApp: 'Recommander', linkCopied: 'Lien copié',
      supportDev: 'Soutenir le développeur',
    },
    it: {
      tagline: 'FreeCell. Niente pubblicità. Niente tracker. Solo carte.',
      newGame: 'Nuova partita', restart: 'Ricomincia', undo: 'Annulla', redo: 'Ripeti',
      hint: 'Aiuto', autoFinish: 'Completa', menu: 'Menu', close: 'Chiudi', back: 'Indietro',
      gameLabel: 'Partita', movesLabel: 'Mosse', timeLabel: 'Tempo',
      settings: 'Impostazioni', language: 'Lingua', sound: 'Suono', theme: 'Tema',
      autoCollect: 'Auto-raccolta', autoCollectHint: 'Invia le carte sicure automaticamente',
      showTimer: 'Mostra tempo', on: 'Sì', off: 'No',
      themeFelt: 'Feltro', themeMidnight: 'Mezzanotte', themeSlate: 'Ardesia',
      statsTitle: 'Statistiche', played: 'Giocate', won: 'Vinte', winRate: 'Vittorie',
      currentStreak: 'Serie', bestStreak: 'Serie migliore', bestTime: 'Tempo migliore', fewestMoves: 'Meno mosse',
      resetStats: 'Azzera statistiche', resetStatsConfirm: 'Azzerare le statistiche?',
      howToTitle: 'Come si gioca',
      howto1: 'Porta tutte le carte alle quattro basi (in alto a destra), per seme dall’Asso al Re.',
      howto2: 'Nel tavolo si costruisce in discesa alternando i colori (un 6 rosso su un 7 nero).',
      howto3: 'Le quattro celle libere (in alto a sinistra) contengono una carta ciascuna.',
      howto4: 'Doppio clic o doppio tocco manda una carta direttamente alla sua base.',
      howto5: 'Puoi spostare più carte insieme solo con abbastanza celle e colonne vuote.',
      gotIt: 'Si parte',
      selectGameTitle: 'Scegli una partita', gameNumberPh: 'Numero (1–', randomGame: 'Casuale',
      start: 'Avvia', cancel: 'Annulla',
      wonTitle: 'Hai vinto!', wonMsg: 'Risolta in {moves} mosse e {time}.',
      playAgain: 'Ancora', nextGame: 'Prossima',
      resume: 'Riprendi', hintNone: 'Nessuna mossa trovata – prova «Completa».',
      unsolvable: 'La partita n. 11982 è notoriamente irrisolvibile – buona fortuna!',
      newGameConfirm: 'Partita in corso. Iniziarne una nuova?',
      restartConfirm: 'Ricominciare questa partita?',
      cardsLicense: 'Carte: «SVG-cards» di David Bellot (LGPL-2.1).',
      installApp: 'Installa app', shareApp: 'Consiglia', linkCopied: 'Link copiato',
      supportDev: 'Sostieni lo sviluppatore',
    },
  };

  var SUPPORTED = Object.keys(STRINGS);
  var current = 'en';

  function detect() {
    var saved = window.Storage && Storage.lang;
    if (saved && STRINGS[saved]) return saved;
    var langs = navigator.languages || [navigator.language || 'en'];
    for (var i = 0; i < langs.length; i++) {
      var code = (langs[i] || '').slice(0, 2).toLowerCase();
      if (STRINGS[code]) return code;
    }
    return 'en';
  }

  function t(key, params) {
    var s = (STRINGS[current] && STRINGS[current][key]);
    if (s == null) s = STRINGS.en[key];
    if (s == null) return key;
    if (params) s = s.replace(/\{(\w+)\}/g, function (_, k) { return params[k] != null ? params[k] : '{' + k + '}'; });
    return s;
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    root.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph')));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria')));
    });
    document.documentElement.lang = current;
  }

  function setLang(l) {
    if (!STRINGS[l]) return;
    current = l;
    if (window.Storage) Storage.setLang(l);
    apply(document);
    document.dispatchEvent(new CustomEvent('i18n:changed'));
  }

  current = detect();

  window.I18n = {
    t: t, apply: apply, setLang: setLang,
    get lang() { return current; },
    supported: SUPPORTED,
    names: { de: 'Deutsch', en: 'English', es: 'Español', fr: 'Français', it: 'Italiano' },
  };
})();
