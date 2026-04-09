import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import baileys from '@whiskeysockets/baileys';
const { 
  useMultiFileAuthState, 
  DisconnectReason, 
  fetchLatestBaileysVersion,
  makeInMemoryStore 
} = baileys as any;
const makeWASocket = (baileys as any).default || baileys;
import { Boom } from '@hapi/boom';
import qrcode from 'qrcode';
import pino from 'pino';
import { GoogleGenAI } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = pino({ level: 'silent' });
const store = makeInMemoryStore({ logger });

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, { cors: { origin: '*' } });

  app.use(cors());
  app.use(express.json());

  let sock: any = null;
  let qrCodeData: string | null = null;
  let connectionStatus: 'connecting' | 'open' | 'close' | 'qr' = 'connecting';
  let botActive = true;
  let userOnline = false;

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

  async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
    const { version } = await fetchLatestBaileysVersion();

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      logger,
      browser: ['AI WhatsApp Bot', 'Chrome', '1.0.0'],
    });

    sock.ev.on('connection.update', async (update: any) => {
      const { connection, lastDisconnect, qr } = update;
      if (qr) {
        qrCodeData = await qrcode.toDataURL(qr);
        connectionStatus = 'qr';
        io.emit('status', { status: 'qr', qr: qrCodeData });
      }
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error as Boom)?.output?.statusCode !== DisconnectReason.loggedOut;
        connectionStatus = 'close';
        io.emit('status', { status: 'close' });
        if (shouldReconnect) connectToWhatsApp();
      } else if (connection === 'open') {
        connectionStatus = 'open';
        qrCodeData = null;
        io.emit('status', { status: 'open' });
      }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m: any) => {
      if (m.type !== 'notify') return;
      for (const msg of m.messages) {
        if (!msg.message) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid.endsWith('@g.us')) continue;
        
        if (msg.key.fromMe) {
          if (!userOnline) {
            userOnline = true;
            io.emit('bot-config', { botActive, userOnline });
            setTimeout(() => {
              userOnline = false;
              io.emit('bot-config', { botActive, userOnline });
            }, 5 * 60 * 1000);
          }
          continue;
        }

        const pushName = msg.pushName || 'Unknown';
        const messageContent = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
        if (!messageContent) continue;

        io.emit('message', { from: pushName, jid, text: messageContent, timestamp: msg.messageTimestamp });

        if (botActive && !userOnline) {
          try {
            const response = await ai.models.generateContent({
              model: 'gemini-3-flash-preview',
              contents: `Reply to ${pushName}: "${messageContent}". Be a helpful assistant, keep it short.`,
            });
            const reply = response.text || "I'm currently away.";
            await sock.sendMessage(jid, { text: reply });
            io.emit('bot-reply', { to: pushName, jid, text: reply });
          } catch (err) { console.error(err); }
        }
      }
    });
  }

  connectToWhatsApp();

  io.on('connection', (socket) => {
    socket.emit('status', { status: connectionStatus, qr: qrCodeData });
    socket.emit('bot-config', { botActive, userOnline });
    socket.on('toggle-bot', (active) => { botActive = active; io.emit('bot-config', { botActive, userOnline }); });
    socket.on('toggle-online', (online) => { userOnline = online; io.emit('bot-config', { botActive, userOnline }); });
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), 'dist')));
    app.get('*', (req, res) => res.sendFile(path.join(process.cwd(), 'dist', 'index.html')));
  }

  httpServer.listen(3000, '0.0.0.0');
}
startServer();
