const express = require('express');
const app = express();
const cors = require('cors')
const admin = require("firebase-admin");
const dotenv = require('dotenv').config();

// Database
admin.initializeApp({
    credential: admin.credential.cert({
        projectId: process.env.PROJECT_ID,
        clientEmail: process.env.CLIENT_EMAIL,
        privateKey: Buffer.from(process.env.PRIVATE_KEY, 'base64').toString('utf-8').replace(/\\n/g, '\n')
    }),
    databaseURL: process.env.DATABASE_URL
});

const corsOptions = { credentials: true, origin: process.env.URL || '*' };

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// PORT
const PORT = process.env.PORT || 5000;

// Routes

app.use('/api/auth', require('./routes/auth-routes'));
app.use('/api/tasks', require('./routes/task-routes'));


// Listen
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
