# RandomChat

Web app full-stack ispirata a Omegle con sistema di moderazione e monetizzazione tramite slot pubblicitari.

## Stack

- **Frontend:** React 18 + Vite + TailwindCSS + react-router-dom
- **Backend:** Node.js + Express + Socket.io
- **Database:** SQLite (better-sqlite3)
- **Styling:** Dark mode moderno, responsive mobile-first

## Funzionalità Core

- Chat random 1v1 in tempo reale (WebSocket)
- Matching casuale con coda utenti
- Pulsante "Next" per cambiare partner
- Auto-disconnect se un utente abbandona

## Sistema di Moderazione

- Filtro messaggi real-time con blacklist parole offensive
- Rate limit messaggi (max 8 messaggi / 10 secondi)
- Segnalazione utente con motivi: spam, contenuto sessuale, molestie, altro
- Auto-ban dopo 3 segnalazioni (30 minuti)
- Blocco comportamento sospetto (link, caps lock eccessivo)
- Timeout automatico

## Monetizzazione

- Slot pubblicitari pronti per Google AdSense:
  - Banner homepage (top e bottom)
  - Sidebar chat (desktop)
  - Schermata "Connecting..."

## Admin Panel

- Accesso protetto con password hardcoded (`admin123`)
- Lista utenti attivi (ultimi 10 minuti)
- Lista ban attivi con possibilità di unban
- Lista segnalazioni ricevute
- Ban manuale singolo utente

## Struttura Progetto

```
randomchat/
├── backend/
│   ├── server.js              # Entry point Express + Socket.io
│   ├── db.js                  # Database SQLite
│   ├── middleware/
│   │   └── moderation.js      # Filtro blacklist, rate limit, auto-ban
│   ├── routes/
│   │   └── admin.js           # Endpoint admin protetti
│   ├── utils/
│   │   └── helpers.js         # Hash IP, generazione session ID, blacklist
│   ├── data/                  # Database file
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Router principale
│   │   ├── main.jsx           # Entry point React
│   │   ├── index.css          # Tailwind directives
│   │   ├── context/
│   │   │   └── SocketContext.jsx
│   │   ├── components/
│   │   │   ├── AdSlot.jsx     # Slot pubblicitario placeholder
│   │   │   └── ReportModal.jsx
│   │   └── pages/
│   │       ├── Home.jsx       # Landing page
│   │       ├── Chat.jsx       # Interfaccia chat 1v1
│   │       └── Admin.jsx      # Pannello admin
│   └── package.json
└── README.md
```

## Setup

### Requisiti

- Node.js >= 18

### Installazione Backend

```bash
cd backend
npm install
npm start
```

Il server partirà su `http://localhost:3000`.

### Installazione Frontend

```bash
cd frontend
npm install
npm run dev
```

Il frontend sarà disponibile su `http://localhost:5173`.

### Variabili d'ambiente

**Backend** (`.env`):
```
PORT=3000
CLIENT_URL=http://localhost:5173
```

**Frontend** (`.env`):
```
VITE_API_URL=http://localhost:3000
```

## Uso

1. Apri il browser su `http://localhost:5173`
2. Clicca "Inizia a Chattare"
3. Verrai accoppiato con un altro utente online
4. Usa il pulsante "Next" per cambiare partner
5. Usa il pulsante ⚠️ per segnalare un utente

## Accesso Admin

- URL: `http://localhost:5173/admin`
- Password: `admin123`

## Note

- Questo è un MVP educativo/dimostrativo.
- Gli utenti sono completamente anonimi; viene tracciato solo l'hash SHA-256 dell'IP (mai l'IP in chiaro).
- Per la produzione, sostituire gli slot `AdSlot` con il codice reale di Google AdSense.
