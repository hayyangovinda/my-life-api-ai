const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendVerificationEmail = async (email, name, token) => {
  const verificationUrl = `https://my-life-api-ai-production.up.railway.app/api/v1/auth/verify-email?token=${token}`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'My Life <noreply@qurio.business>',
      to: [email],
      subject: 'Verify Your Email Address',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Verify Your Email</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to My Life!</h1>
            </div>

            <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <p style="font-size: 16px; margin-bottom: 20px;">Hi ${name || 'there'},</p>

              <p style="font-size: 16px; margin-bottom: 20px;">
                Thank you for signing up! Please verify your email address to activate your account and start journaling your life's journey.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${verificationUrl}"
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: white;
                          padding: 14px 40px;
                          text-decoration: none;
                          border-radius: 8px;
                          font-weight: bold;
                          display: inline-block;
                          font-size: 16px;">
                  Verify Email Address
                </a>
              </div>

              <p style="font-size: 14px; color: #666; margin-top: 30px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="font-size: 12px; color: #667eea; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 5px;">
                ${verificationUrl}
              </p>

              <p style="font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                This link will expire in 1 hour. If you didn't create an account with My Life, you can safely ignore this email.
              </p>
            </div>

            <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
              <p>© 2025 My Life. All rights reserved.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending verification email:', error);
      throw new Error('Failed to send verification email');
    }

    console.log('Verification email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Email service error:', error);
    throw error;
  }
};

const sendPasswordResetEmail = async (email, name, token) => {
  const resetUrl = `https://my-life-api-ai-production.up.railway.app/api/v1/auth/reset-password?token=${token}`;

  try {
    const { data, error } = await resend.emails.send({
      from: 'My Life <noreply@qurio.business>',
      to: [email],
      subject: 'Reset Your Password',
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Reset Your Password</h1>
            </div>

            <div style="background: #ffffff; padding: 40px; border-radius: 0 0 10px 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              <p style="font-size: 16px; margin-bottom: 20px;">Hi ${name || 'there'},</p>

              <p style="font-size: 16px; margin-bottom: 20px;">
                We received a request to reset your password for your My Life account. You can reset your password by filling out the form below.
              </p>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetUrl}"
                   style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                          color: white;
                          padding: 14px 40px;
                          text-decoration: none;
                          border-radius: 8px;
                          font-weight: bold;
                          display: inline-block;
                          font-size: 16px;">
                  Reset Password
                </a>
              </div>

              <p style="font-size: 14px; color: #666; margin-top: 30px;">
                Or copy and paste this link into your browser:
              </p>
              <p style="font-size: 12px; color: #667eea; word-break: break-all; background: #f5f5f5; padding: 10px; border-radius: 5px;">
                ${resetUrl}
              </p>

              <form action="${resetUrl}" method="POST" style="max-width: 100%; margin: 20px 0; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px; background: #fafafa;">
                <div style="margin-bottom: 15px;">
                  <label for="password" style="display: block; margin-bottom: 5px; font-weight: 500;">New Password</label>
                  <input type="password" name="password" id="password" placeholder="Enter new password" required style="width: 93%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"/>
                </div>
                <div style="margin-bottom: 15px;">
                  <label for="confirmPassword" style="display: block; margin-bottom: 5px; font-weight: 500;">Confirm New Password</label>
                  <input type="password" name="confirmPassword" id="confirmPassword" placeholder="Confirm new password" required style="width: 93%; padding: 10px; border: 1px solid #ccc; border-radius: 4px; font-size: 14px;"/>
                </div>
                <button type="submit" style="width: 100%; padding: 12px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 16px;">Reset Password</button>
              </form>

              <p style="font-size: 14px; color: #666; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
                This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email. Your password will not be changed.
              </p>
            </div>

            <div style="text-align: center; margin-top: 20px; color: #999; font-size: 12px;">
              <p>© 2025 My Life. All rights reserved.</p>
            </div>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('Error sending password reset email:', error);
      throw new Error('Failed to send password reset email');
    }

    console.log('Password reset email sent successfully:', data);
    return { success: true, data };
  } catch (error) {
    console.error('Email service error:', error);
    throw error;
  }
};

module.exports = {
  sendVerificationEmail,
  sendPasswordResetEmail,
};
