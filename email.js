import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

// Verify connection configuration
export const verifySmtp = async () => {
    try {
        await transporter.verify();
        console.log("✅ SMTP Ready");
    } catch (error) {
        console.error("❌ SMTP Verification failed:", error);
    }
};

export async function sendInviteEmail({ to, role, inviteLink }) {
    return transporter.sendMail({
        from: `"School Dashboard" <${process.env.SMTP_USER}>`,
        to,
        subject:
            role === "teacher"
                ? "Teacher Invitation – School Dashboard"
                : "Parent Invitation – School Dashboard",
        html: `
      <h2>Welcome 👋</h2>
      <p>You are invited as a <b>${role}</b>.</p>
      <p>Click below to continue:</p>
      <a href="${inviteLink}">${inviteLink}</a>
    `,
    });
}
