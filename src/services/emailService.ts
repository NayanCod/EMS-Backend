import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface SendMailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: SendMailOptions): Promise<void> {
  console.log("send Mail funtion called");

  const recipients = Array.isArray(to) ? to.join(', ') : to;

  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: recipients,
      subject,
      html,
    });
    console.log(`[EmailService] Mail sent to ${recipients} | Subject: ${subject}`);
  } catch (err) {
    console.error(`[EmailService] Failed to send mail to ${recipients}:`, err);
  }
}
