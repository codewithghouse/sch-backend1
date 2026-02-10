import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { verifySmtp, sendInviteEmail } from "./email.js";

dotenv.config();

// --- 7️⃣ FIREBASE ADMIN INIT ---
// Ensure FIREBASE_SERVICE_ACCOUNT is set in your Render environment as a full JSON string
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Fix potential newline issues in private key from ENV
if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3001;

// --- 6️⃣ CORS SETUP ---
// CORS must strictly allow only the frontend
app.use(
    cors({
        origin: "https://schooldashboard-ten.vercel.app",
        methods: ["GET", "POST"],
    })
);

app.use(express.json());

// --- HEALTH CHECK ---
app.get("/health", (req, res) => {
    res.json({ status: "ok" });
});

// --- 5️⃣ INVITE API (ONE ROUTE FOR ALL) ---
app.post("/invite-user", async (req, res) => {
    console.log("🔥 BACKEND INVITE ROUTE HIT");

    try {
        const { email, role, schoolId, studentId, name, subjects, classIds } = req.body;

        if (!email || !role || !schoolId) {
            return res.status(400).json({ error: "Missing fields" });
        }

        if (role === "parent" && !studentId) {
            return res.status(400).json({ error: "studentId required for parent" });
        }

        // Prepare invite document with all necessary metadata for onboarding
        const inviteData = {
            email: email.toLowerCase().trim(),
            role,
            schoolId,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        // Add role-specific metadata
        if (role === "teacher") {
            inviteData.name = name || "";
            inviteData.subjects = subjects || [];
            inviteData.classIds = classIds || [];
        } else if (role === "parent") {
            inviteData.studentId = studentId;
        }

        const inviteRef = await db.collection("invites").add(inviteData);

        const inviteLink = `${process.env.APP_BASE_URL}/accept-invite?id=${inviteRef.id}`;

        await sendInviteEmail({ to: email, role, inviteLink });

        console.log(`✅ Invite sent to ${email} as ${role} (ID: ${inviteRef.id})`);
        res.json({ success: true, inviteId: inviteRef.id });
    } catch (err) {
        console.error("❌ INVITE FAILED", err);
        res.status(500).json({ error: "Invite failed", message: err.message });
    }
});

// Start server and check SMTP
app.listen(PORT, async () => {
    console.log(`🚀 Backend listening on port ${PORT}`);
    await verifySmtp();
});
