import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { Resend } from 'resend';

dotenv.config();

// --- 5️⃣ FIREBASE ADMIN INIT ---
// Ensure FIREBASE_SERVICE_ACCOUNT is set in your Render environment as a full JSON string
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 3001;

// --- 7️⃣ CORS CONFIG ---
app.use(
    cors({
        origin: process.env.APP_BASE_URL || 'http://localhost:5173',
        methods: ["GET", "POST", "DELETE"],
    })
);

app.use(express.json());

// --- 6️⃣ BACKEND API CONTRACTS ---

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok" });
});

// Invite Teacher
app.post('/invite-teacher', async (req, res) => {
    console.log('🔥 BACKEND INVITE ROUTE HIT');
    const { email, schoolId, classIds, subjects, schoolName } = req.body;

    if (!email || !schoolId) {
        return res.status(400).json({ error: 'Missing required fields: email and schoolId' });
    }

    try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

        // 1. Create invites document in Firestore
        const inviteRef = await db.collection('invites').add({
            email: email.toLowerCase().trim(),
            role: 'teacher',
            schoolId,
            classIds: classIds || [],
            subjects: subjects || [],
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Invite Document Created: ${inviteRef.id}`);

        // 2. Send email via Resend
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: `Invitation to join ${schoolName || 'AcademiVis'}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                    <h2 style="color: #4F46E5;">You've Been Invited!</h2>
                    <p>Hello,</p>
                    <p>You have been invited as a Teacher to join <strong>${schoolName || 'the school dashboard'}</strong>.</p>
                    <p>To activate your account, please login using the link below:</p>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${appBaseUrl}/login?invite=${inviteRef.id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            Accept Invitation
                        </a>
                    </div>
                </div>
            `
        });

        if (error) {
            console.error('❌ Resend Error:', error);
            return res.status(500).json({ error: 'Failed to send email' });
        }

        // Return proper JSON response
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Generic Invite (Parents/Other)
app.post('/send-invite', async (req, res) => {
    const { email, type, schoolName, studentName } = req.body;

    try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: type === 'parent' ? `Child added to ${schoolName}` : `Invitation from ${schoolName}`,
            text: `Hello, your child ${studentName || ''} has been added. Login at: ${appBaseUrl}/login`
        });

        if (error) throw error;
        res.status(200).json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Production Backend listening on port ${PORT}`);
});
