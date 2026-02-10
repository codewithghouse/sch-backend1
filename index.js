import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// --- FIREBASE ADMIN INIT ---
let serviceAccount;
try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (serviceAccount.private_key) {
        serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }
} catch (e) {
    console.warn("⚠️ Firebase Service Account not configured correctly.");
}

if (serviceAccount) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
} else {
    console.warn("⚠️ Backend starting without Firebase Admin. Mutations will fail.");
}

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS SETUP ---
app.use(
    cors({
        origin: ["https://schooldashboard-ten.vercel.app", "http://localhost:5173"],
        methods: ["GET", "POST"],
    })
);

app.use(express.json());

// --- HEALTH CHECK ---
app.get("/health", (req, res) => {
    res.json({ status: "production-hardened", service: "SaaS Analytics Engine" });
});

// Note: Invitation and Onboarding logic has been moved to Frontend (Firebase Email-Link Auth)
// to eliminate backend email dependencies and minimize latency as per SaaS requirements.

app.listen(PORT, () => {
    console.log(`🚀 Academic Intelligence Proxy listening on port ${PORT}`);
});
