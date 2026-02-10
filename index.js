import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { Resend } from "resend";

dotenv.config();

// --- 4️⃣ FIREBASE ADMIN (VERIFY) ---
// Ensure Firebase Admin is initialized exactly once
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3001;

// --- 3️⃣ CORS (VERIFY & KEEP) ---
// CORS must strictly allow only the frontend
app.use(
    cors({
        origin: process.env.APP_BASE_URL,
        methods: ["GET", "POST", "DELETE"],
    })
);

app.use(express.json());

// --- 7️⃣ HEALTH CHECK (MANDATORY) ---
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// --- 5️⃣ INVITE ROUTE ---
app.post("/invite-teacher", async (req, res) => {
    console.log("🔥 BACKEND INVITE ROUTE HIT");

    try {
        const { email, schoolId, classIds } = req.body;

        if (!email || !schoolId) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const inviteRef = await db.collection("invites").add({
            email,
            schoolId,
            classIds: classIds || [],
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        const inviteLink = `${process.env.APP_BASE_URL}/login?invite=${inviteRef.id}`;

        const resend = new Resend(process.env.RESEND_API_KEY);

        const result = await resend.emails.send({
            from: process.env.RESEND_FROM_EMAIL,
            to: email,
            subject: "You're invited to join the school dashboard",
            html: `
        <p>You have been invited.</p>
        <p><a href="${inviteLink}">Accept Invite</a></p>
      `,
        });

        // Log real Resend errors in logs if any
        if (result.error) {
            console.error("❌ Resend error detail:", result.error);
            throw new Error(result.error.message || "Resend failed to send email");
        }

        console.log("✅ Resend success:", result);

        return res.json({ success: true });
    } catch (err) {
        console.error("❌ INVITE FAILED:", err);

        return res.status(500).json({
            error: "Invite failed",
            message: err.message,
        });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Backend listening on port ${PORT}`);
});
