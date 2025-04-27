import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import axios from 'axios';
import dotenv from 'dotenv';
import { sendTextMessage } from './service/businessToClient';
import { updateMessageStatus } from './backend/text_message';
import { receiveTextMessage } from './service/clientsToBusiness';
dotenv.config(); // Load environment variables from .env file

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN } = process.env;

// Express app setup
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
const server = http.createServer(app);

// Allow CORS for your frontend domain (adjust for local or prod use)
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST'],
}));

// Socket.IO setup
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const clients = new Map();

// WebSocket logic
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Receive message from one client and broadcast
  socket.on('message', (data) => {
    console.log('Received:', data);
    // socket.broadcast.emit('message', data);
  });

  // Store credentials when received
  socket.on('storeCredentials', (data) => {
    clients.set(socket.id, data);
    console.log(`Stored credentials for ${socket.id}:`, data);
  });

  // Receive message from one client and broadcast
  socket.on('sendMessage', (data) => {
    const token = clients.get(socket.id)?.token;
    sendTextMessage(data, token)
  });

  socket.on('disconnect', () => {
    clients.delete(socket.id);
    console.log('Client disconnected:', socket.id);
  });
});

app.post("/webhook", async (req, res) => {

  // log incoming messages
  console.log("Incoming webhook message:", JSON.stringify(req.body, null, 2));

  // check if the webhook request contains a message
  // details on WhatsApp text message payload: https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples#text-messages
  const message = req.body.entry?.[0]?.changes[0]?.value?.messages?.[0];
  const statuses = req.body.entry?.[0]?.changes[0]?.value?.statuses?.[0];

  if (statuses) {
    const { id, status } = statuses;
    const phone_number_id =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;

    // Find clients with matching phone_number_id
    for (const [socketId, clientData] of clients.entries()) {
      if (clientData.phone_number_id === phone_number_id) {
        // Emit status change to matching client
        io.to(socketId).emit('statusChange', {
          messageId: id,
          status: status.toUpperCase(),
          timestamp: req.body.entry?.[0].changes?.[0].value?.timestamp
        });
      }
    }

    updateMessageStatus(id, status.toUpperCase())
  }

  // check if the incoming message contains text
  if (message?.type === "text") {
    // extract the business number to send the reply  from it
    const { wa_id } = req.body.entry?.[0]?.changes[0]?.value?.contacts?.[0];
    const phone_number_id =
      req.body.entry?.[0].changes?.[0].value?.metadata?.phone_number_id;
    const { id, timestamp, type, text: { body } } = message

    // send a reply message as per the docs here https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
    let client_connected = false;
    let user_id = null;

    // Emit the message to all connected WebSocket clients with the same phone_number_id
    for (const [socketId, clientData] of clients.entries()) {
      if (clientData.phone_number_id === phone_number_id) {
        // Emit incoming change to matching client
        client_connected = true;
        user_id = clientData.user_id;
        io.to(socketId).emit('receiveMessage', {
          id,
          content: body,
          phone: wa_id,
          type,
          sender: 'in',
          status: 'READ',
          timestamp
        });
      }
    }

    // mark incoming message as read
    if (client_connected) {
      await axios({
        method: "POST",
        url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
        headers: {
          Authorization: `Bearer ${GRAPH_API_TOKEN}`,
        },
        data: {
          messaging_product: "whatsapp",
          status: "read",
          message_id: message.id,
        },
      });
    }

    // save incoming message to DB
    await receiveTextMessage({ content: body, phone_number_id, phone_num: wa_id, type, sender: 'in', status: client_connected ? 'READ' : 'SENT', timestamp, user_id, wamid: id });
  }

  res.sendStatus(200);
});

// accepts GET requests at the /webhook endpoint. You need this URL to setup webhook initially.
// info on verification request payload: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  // check the mode and token sent are correct
  if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
    // respond with 200 OK and challenge token from the request
    res.status(200).send(challenge);
    console.log("Webhook verified successfully!");
  } else {
    // respond with '403 Forbidden' if verify tokens do not match
    res.sendStatus(403);
  }
});

app.get("/", (req, res) => {
  res.send(`<pre>Nothing to see here.
Checkout README.md to start.</pre>`);
});

// Start server
const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`WebSocket server listening on port ${PORT}`);
});
