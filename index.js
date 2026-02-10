import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import admin from "firebase-admin";

dotenv.config();

// --- FIREBASE ADMIN INIT ---
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

if (serviceAccount.private_key) {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
}

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

export const db = admin.firestore();

const app = express();
const PORT = process.env.PORT || 3001;

// --- CORS SETUP ---
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

/**
 * 1️⃣ POST /create-invite
 * Creates a pending invite document. 
 * Frontend then uses the ID to send a Firebase Auth SignIn Link.
 */
app.post("/create-invite", async (req, res) => {
    console.log("🔥 CREATE INVITE HIT");

    try {
        const { email, role, schoolId, classIds, subjects, name, studentId } = req.body;

        if (!email || !role || !schoolId) {
            return res.status(400).json({ error: "Missing fields" });
        }

        const inviteData = {
            email: email.toLowerCase().trim(),
            role,
            schoolId,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (role === "teacher") {
            inviteData.name = name || "";
            inviteData.subjects = subjects || [];
            inviteData.classIds = classIds || [];
        } else if (role === "parent") {
            inviteData.studentId = studentId || null;
        }

        const inviteRef = await db.collection("invites").add(inviteData);

        console.log(`✅ Invite doc created: ${inviteRef.id} for ${email}`);
        res.json({ success: true, inviteId: inviteRef.id });
    } catch (err) {
        console.error("❌ CREATE INVITE FAILED", err);
        res.status(500).json({ error: "Failed to create invite" });
    }
});

/**
 * 2️⃣ POST /finalize-invite
 * Called after frontend completes Email-Link Auth.
 * Performs atomic onboarding.
 */
app.post("/finalize-invite", async (req, res) => {
    console.log("🔥 FINALIZE INVITE HIT");

    try {
        const { uid, email, inviteId } = req.body;

        if (!uid || !email || !inviteId) {
            return res.status(400).json({ error: "Missing uid, email, or inviteId" });
        }

        const inviteRef = db.collection("invites").doc(inviteId);
        const inviteSnap = await inviteRef.get();

        if (!inviteSnap.exists) {
            return res.status(404).json({ error: "Invitation not found" });
        }

        const inviteData = inviteSnap.data();

        if (inviteData.status !== "pending") {
            return res.status(400).json({ error: "Invitation already used or expired" });
        }

        if (inviteData.email.toLowerCase() !== email.toLowerCase()) {
            return res.status(403).json({ error: "Email mismatch" });
        }

        // ATOMIC ONBOARDING TRANSACTION
        await db.runTransaction(async (transaction) => {
            const userRef = db.collection("users").doc(uid);
            const teacherRef = db.collection("teachers").doc(uid);

            // 1. Create User Document
            transaction.set(userRef, {
                uid,
                email: email.toLowerCase(),
                role: inviteData.role,
                schoolId: inviteData.schoolId,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // 2. Role-specific logic
            if (inviteData.role === "teacher") {
                transaction.set(teacherRef, {
                    uid,
                    email: email.toLowerCase(),
                    name: inviteData.name || "",
                    schoolId: inviteData.schoolId,
                    subjects: inviteData.subjects || [],
                    status: "active",
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Link Classes
                const classIds = inviteData.classIds || [];
                classIds.forEach((classId) => {
                    const classRef = db.collection("classes").doc(classId);
                    transaction.update(classRef, { classTeacherId: uid });
                });
            } else if (inviteData.role === "parent") {
                if (inviteData.studentId) {
                    const studentRef = db.collection("students").doc(inviteData.studentId);
                    transaction.update(studentRef, { parentUid: uid });
                }
            }

            // 3. Mark Invite as Accepted
            transaction.update(inviteRef, {
                status: "accepted",
                acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
                uid: uid,
            });
        });

        console.log(`✅ Onboarding complete for: ${email}`);
        res.json({ success: true, role: inviteData.role });
    } catch (err) {
        console.error("❌ FINALIZE FAILED", err);
        res.status(500).json({ error: "Finalization failed", message: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Passwordless Backend listening on port ${PORT}`);
});
