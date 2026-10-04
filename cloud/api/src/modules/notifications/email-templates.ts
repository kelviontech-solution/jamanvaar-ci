/**
 * Plain, instructional HTML — the owner has no dedicated "click to set your
 * password" web page in the current architecture (the Restaurant Admin app
 * is where the activation token is redeemed, via its "Connect to JAMANVAAR
 * Cloud" panel), so these emails tell the recipient exactly what to open and
 * what to paste rather than a magic link.
 */

const esc = (v: string): string => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * The owner's first email: the Restaurant ID (which every terminal asks for before it will accept a key), the login email, and
 * EITHER the first password Super Admin chose (the owner should change it after first sign-in) OR an invitation token to set one.
 */
export function ownerInviteEmail(params: {
  restaurantName: string;
  ownerName: string;
  email: string;
  restaurantCode?: string | null;
  /** The first password, when Super Admin set one at onboarding. */
  initialPassword?: string;
  /** The one-time invitation token, when the owner sets their own password. */
  activationToken?: string;
  /** Opens the Restaurant Admin app's set-password screen with the restaurant, email and token already filled in. */
  setupLink?: string;
  expiresAt?: Date;
}): { subject: string; html: string } {
  const expiry = params.expiresAt ? params.expiresAt.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const mono = 'font-family: monospace; font-size: 16px; background: #f3f6f9; padding: 2px 6px; border-radius: 4px;';
  const rows = [
    params.restaurantCode ? `<li>Restaurant ID: <strong style="${mono}">${esc(params.restaurantCode)}</strong></li>` : '',
    `<li>Login email: <strong>${esc(params.email)}</strong></li>`,
    params.initialPassword ? `<li>First-time password: <strong style="${mono}">${esc(params.initialPassword)}</strong></li>` : '',
    !params.initialPassword && params.activationToken ? `<li>Invitation token: <strong style="${mono}">${esc(params.activationToken)}</strong></li>` : ''
  ].join('');
  const steps = params.initialPassword
    ? `<p>Open the Restaurant Admin app, choose &ldquo;Restaurant Owner? Sign in with your JAMANVAAR Cloud account&rdquo;, and sign in with the details above. <strong>Please change this password after your first sign-in.</strong></p>`
    : params.setupLink
      ? `<p style="margin: 22px 0;"><a href="${esc(params.setupLink)}" style="background: #e8650f; color: #ffffff; padding: 12px 22px; border-radius: 10px; text-decoration: none; font-weight: bold; display: inline-block;">Set your password</a></p><p>Click the button on this device to choose your password. If the button does not open, open the Restaurant Admin app, choose &ldquo;First time? Activate account&rdquo;, and enter the details above.</p>`
      : `<p>Open the Restaurant Admin app and choose &ldquo;First time? Activate account&rdquo;, then enter the details above.</p>`;
  return {
    subject: `Your JAMANVAAR account for ${params.restaurantName}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Welcome to JAMANVAAR, ${esc(params.ownerName)}</h2>
        <p>Your restaurant <strong>${esc(params.restaurantName)}</strong> has been set up on JAMANVAAR Cloud. Your details:</p>
        <ul style="line-height: 1.9;">${rows}</ul>
        ${steps}
        <p style="color: #7a8b9e; font-size: 13px;">Your terminals (POS, Captain, Kitchen Display, Kiosk) ask for the Restaurant ID together with an activation key that your onboarding contact will give you. Keep this email private.${expiry && !params.initialPassword ? ` The invitation token expires on ${expiry}; if it does, ask your onboarding contact to resend it.` : ''}</p>
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

export function platformLoginOtpEmail(params: { fullName: string; otp: string; minutesValid: number }): { subject: string; html: string } {
  return {
    subject: 'Your JAMANVAAR Super Admin sign-in code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; color: #0b253a;">
        <h2 style="color: #0b253a;">Confirm it's you</h2>
        <p>Hi ${params.fullName}, someone is signing in to JAMANVAAR Platform Control with your account. Enter this code to continue:</p>
        <p style="text-align: center; margin: 24px 0;">
          <span style="font-family: monospace; font-size: 32px; letter-spacing: 8px; font-weight: bold; background: #FFF4ED; border: 1px solid #FDBA74; border-radius: 10px; padding: 12px 20px; display: inline-block;">${params.otp}</span>
        </p>
        <p style="color: #7a8b9e; font-size: 13px;">The code works once and expires in ${params.minutesValid} minutes. If this wasn't you, ignore this email and consider changing your password &mdash; no access was granted without it.</p>
      </div>
    `
  };
}
