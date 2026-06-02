# Guida Deploy RandomChat su Render (24/7 Gratis)

## Cosa ti serve
1. Un account GitHub (gratuito) → https://github.com/signup
2. Un account Render (gratuito) → https://render.com

## Tempo stimato: 5 minuti

---

## PASSO 1: Pusha il codice su GitHub

Apri il terminale nella cartella del progetto e esegui:

```bash
cd C:\Users\egidio\Documents\klyra

# Crea repository su GitHub (sostituisci con il tuo username)
git remote add origin https://github.com/TUO_USERNAME/randomchat.git

# Crea la repo su GitHub prima da browser, poi pusha:
git branch -M main
git push -u origin main
```

---

## PASSO 2: Deploy Backend su Render

1. Vai su https://dashboard.render.com
2. Clicca **"New +"** → **"Web Service"**
3. Connetti il tuo account GitHub
4. Seleziona il repository `randomchat`
5. Configura cosi:

| Campo | Valore |
|-------|--------|
| Name | randomchat-backend |
| Environment | Node |
| Region | Frankfurt (EU) |
| Branch | main |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `node server.js` |
| Plan | Free |

6. Clicca **"Create Web Service"**

Render ti dara un URL tipo:
`https://randomchat-backend-XXXX.onrender.com`

---

## PASSO 3: Aggiorna Frontend (Vercel)

1. Vai su https://vercel.com/dashboard
2. Trova il tuo progetto `frontend`
3. Vai in **Settings** → **Environment Variables**
4. Aggiungi:

```
VITE_API_URL = https://randomchat-backend-XXXX.onrender.com
```

5. Clicca **"Save"** e poi **"Redeploy"**

---

## PASSO 4: Testa

Apri il tuo URL Vercel e verifica che:
- La chat si connetta
- Il contatore online funzioni
- Next non freezzi

---

## NOTE IMPORTANTI

- Il piano gratuito di Render "dorme" dopo 15 min di inattivita. Si sveglia automaticamente alla prima richiesta (1-2 secondi di attesa).
- Il database SQLite su Render e temporaneo: i dati (ban, report) si resettano ad ogni riavvio del server. Per un progetto serio, passa a PostgreSQL (Render offre un database gratuito).
- Il piano gratuito di Vercel ha 100GB di bandwidth/mese (piu che sufficiente per un MVP).

---

## Backup: se Render non funziona

Tieni sempre il backup locale attivo:
```bash
cd backend && node server.js
```

E il tunnel Cloudflare:
```bash
cloudflared tunnel --url http://localhost:3000
```
