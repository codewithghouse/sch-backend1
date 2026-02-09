import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import admin from 'firebase-admin';
import { Resend } from 'resend';

dotenv.config();

// --- Firebase Admin Auth ---
// On Render, provide FIREBASE_SERVICE_ACCOUNT as a JSON string environment variable
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log('✅ Firebase Admin Initialized');
    } catch (e) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT:', e.message);
        process.exit(1);
    }
} else {
    // Falls back to Application Default Credentials for local dev
    admin.initializeApp();
}

const db = admin.firestore();
const app = express();
const resend = new Resend(process.env.RESEND_API_KEY);
const PORT = process.env.PORT || 3001;

// --- CORS Configuration ---
const allowedOrigins = [
    'https://schooldashboard-1bqa-f94356e3.vercel.app', // Update with your actual PRODUCTION Vercel URL
    'http://localhost:5173'
];

app.use(cors({
    origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
}));

app.use(express.json());

// --- 1. Route: Teacher Invitation ---
app.post('/invite-teacher', async (req, res) => {
    console.log('🔥 BACKEND INVITE ROUTE HIT');
    const { email, name, schoolId, classIds, subjects, schoolName } = req.body;

    if (!email || !schoolId) {
        return res.status(400).json({ error: 'Email and SchoolId are required' });
    }

    try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

        // 1. Create Atomic Invite in Firestore
        const inviteRef = await db.collection('invites').add({
            email: email.toLowerCase().trim(),
            name: name || 'Teacher',
            role: 'teacher',
            schoolId,
            classIds: classIds || [],
            subjects: subjects || [],
            status: 'pending',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`✅ Invite Document Created: ${inviteRef.id}`);

        // 2. Send Professional Email via Resend
        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: `Welcome to the Team at ${schoolName || 'Your School'}`,
            html: `
                <div style="font-family: sans-serif; max-width: 600px; margin: auto; padding: 20px;">
                    <h2 style="color: #4F46E5;">You've Been Invited!</h2>
                    <p>Hello,</p>
                    <p>You have been invited as a Teacher to join <strong>${schoolName || 'the school dashboard'}</strong>.</p>
                    <p>To activate your account and set up your profile, please login using the link below:</p>
                    <div style="margin: 30px 0; text-align: center;">
                        <a href="${appBaseUrl}/login" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: bold;">
                            Join Dashboard
                        </a>
                    </div>
                    <p style="font-size: 12px; color: #666;">If you weren't expecting this, simply ignore this email.</p>
                </div>
            `
        });

        if (error) {
            console.error('❌ Resend Error:', error);
            return res.status(500).json({ error: 'Email failed to send' });
        }

        res.status(200).json({
            success: true,
            inviteId: inviteRef.id,
            emailId: data.id
        });

    } catch (error) {
        console.error('❌ Server Error:', error.message);
        res.status(500).json({ error: 'Internal server error during invitation' });
    }
});

// --- 2. Generic Invite (Parents/Other) ---
app.post('/send-invite', async (req, res) => {
    const { email, type, schoolName, studentName } = req.body;

    try {
        const fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
        const appBaseUrl = process.env.APP_BASE_URL || 'http://localhost:5173';

        const { data, error } = await resend.emails.send({
            from: fromEmail,
            to: [email],
            subject: type === 'parent' ? `Child added to ${schoolName}` : `Invitation from ${schoolName}`,
            text: `Hello, your child ${studentName || ''} has been added to ${schoolName}. Login at: ${appBaseUrl}/login`
        });

        if (error) throw error;
        res.status(200).json({ success: true, emailId: data.id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: 'active', timestamp: new Date().toISOString() }));

app.listen(PORT, () => {
    console.log(`🚀 Production Backend listening on port ${PORT}`);
});
