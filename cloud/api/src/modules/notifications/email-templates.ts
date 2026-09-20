/**
 * Plain, instructional HTML — the owner has no dedicated "click to set your
 * password" web page in the current architecture (the Restaurant Admin app
 * is where the activation token is redeemed, via its "Connect to JAMANVAAR
 * Cloud" panel), so these emails tell the recipient exactly what to open and
 * what to paste rather than a magic link.
 */

export function ownerInviteEmail(params: {
  restaurantName: string;
  ownerName: string;
  email: string;
  activationToken: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  const expiry = params.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: `Set up your JAMANVAAR account for ${params.restaurantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Welcome to JAMANVAAR, ${params.ownerName}</h2>
        <p>Your restaurant <strong>${params.restaurantName}</strong> has been set up on JAMANVAAR Cloud. To finish setting up your account:</p>
        <ol>
          <li>Open the Restaurant Admin app for your restaurant.</li>
          <li>Choose &ldquo;Restaurant Owner? Sign in with your JAMANVAAR Cloud account&rdquo; on the login screen.</li>
          <li>Enter your activation code (sent separately by your onboarding contact), then choose &ldquo;First time? Set your password&rdquo;.</li>
          <li>Use this login email: <strong>${params.email}</strong></li>
          <li>Use this invitation token: <strong style="font-family: monospace; font-size: 16px;">${params.activationToken}</strong></li>
        </ol>
        <p style="color: #7a8b9e; font-size: 13px;">This invitation token expires on ${expiry}. If it expires, ask your onboarding contact to resend it.</p>
      </div>
    `
  };
}

export function platformTeamInviteEmail(params: {
  inviteeName: string;
  email: string;
  role: string;
  activationToken: string;
  activationUrl: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  const expiry = params.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: 'You have been invited to the JAMANVAAR Platform Control Center',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Welcome to the team, ${params.inviteeName}</h2>
        <p>You've been invited to the JAMANVAAR Platform Control Center as <strong>${params.role.replace(/_/g, ' ')}</strong>.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${params.activationUrl}" style="background: #E66817; color: #fff; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Activate Your Account</a>
        </p>
        <p style="color: #7a8b9e; font-size: 12px;">Or open this link: <a href="${params.activationUrl}">${params.activationUrl}</a></p>
        <p style="color: #7a8b9e; font-size: 13px;">Login email: <strong>${params.email}</strong>. This invitation link expires on ${expiry}. If it expires, ask a Platform Owner to resend it.</p>
      </div>
    `
  };
}

export function resendInviteEmail(params: {
  restaurantName: string;
  ownerName: string;
  email: string;
  activationToken: string;
  expiresAt: Date;
}): { subject: string; html: string } {
  const expiry = params.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    subject: `Your new JAMANVAAR activation code for ${params.restaurantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Here's a fresh invitation, ${params.ownerName}</h2>
        <p>Your previous invitation for <strong>${params.restaurantName}</strong> has been replaced with a new one — the old link/token no longer works.</p>
        <ol>
          <li>Open the Restaurant Admin app for your restaurant.</li>
          <li>Choose &ldquo;Restaurant Owner? Sign in with your JAMANVAAR Cloud account&rdquo; on the login screen, then &ldquo;First time? Set your password&rdquo;.</li>
          <li>Use this login email: <strong>${params.email}</strong></li>
          <li>Use this invitation token: <strong style="font-family: monospace; font-size: 16px;">${params.activationToken}</strong></li>
        </ol>
        <p style="color: #7a8b9e; font-size: 13px;">This invitation token expires on ${expiry}.</p>
      </div>
    `
  };
}

export function passwordResetOtpEmail(params: { fullName: string; otp: string; minutesValid: number }): { subject: string; html: string } {
  return {
    subject: 'Your JAMANVAAR password reset code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Reset your password</h2>
        <p>Hi ${params.fullName}, use this code to choose a new password for your JAMANVAAR account:</p>
        <p style="text-align: center; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: bold; background: #FFF4ED; border: 1px solid #FDBA74; border-radius: 10px; padding: 12px 20px; display: inline-block;">${params.otp}</span>
        </p>
        <p style="color: #7a8b9e; font-size: 13px;">The code works once and expires in ${params.minutesValid} minutes. If you did not ask to reset your password, ignore this email &mdash; your password has not changed.</p>
      </div>
    `
  };
}
