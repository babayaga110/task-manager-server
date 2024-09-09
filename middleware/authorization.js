const admin = require("firebase-admin");

async function authenticateToken(req, res, next) {
    const authHeader  = req.headers.authorization;
    const idToken = authHeader && authHeader.split(' ')[1];

    if (!idToken) {
        return res.status(401).json({ error: "Authorization token is missing" });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(idToken);
        req.user = decodedToken;
        next();
    } catch (error) {
        console.error('Error verifying token:', error);
        res.status(401).json({ error: "You are not authorized to make this request" });
    }
}

module.exports = { authenticateToken };