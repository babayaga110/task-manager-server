const express = require('express');
const app = express();
const cors = require('cors')
const admin = require("firebase-admin");
require('dotenv').config();

// Database
admin.initializeApp({
    credential: admin.credential.cert({
        "type": process.env.TYPE,
        "project_id": process.env.PROJECT_ID,
        "private_key_id": process.env.PRIVATE_KEY_ID,
        "private_key": process.env.PRIVATE_KEY.replace(/\\n/g, '\n'),
        "client_email": process.env.CLIENT_EMAIL,
        "client_id": process.env.CLIENT_ID,
        "auth_uri": process.env.AUTH_URI,
        "token_uri": process.env.TOKEN_URI,
        "auth_provider_x509_cert_url": process.env.AUTH_PROVIDER_X509_CERT_URL,
        "client_x509_cert_url": process.env.CLIENT_X509_CERT_URL
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
