const FROM_ADDRESS = "Retsy <hello@contact.retsy.xyz>";

async function sendEmail(to: string, subject: string, html: string) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) {
    throw new Error("Missing RESEND_API_KEY env var");
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM_ADDRESS,
      to,
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Resend send failed (${res.status}): ${errText}`);
  }

  return res.json();
}

function baseLayout(bodyHtml: string) {
  return `
  <div style="font-family: -apple-system, Segoe UI, Helvetica, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
    <div style="font-size: 13px; letter-spacing: 0.08em; text-transform: uppercase; color: #9a8a78; font-weight: 600; margin-bottom: 24px;">Retsy</div>
    ${bodyHtml}
    <div style="margin-top: 40px; padding-top: 16px; border-top: 1px solid #e8e2d8; font-size: 12px; color: #9a9a9a;">
      You're receiving this because you forwarded an order email to returns@retsy.xyz.
    </div>
  </div>`;
}

function formatDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export async function sendConfirmationEmail(opts: {
  to: string;
  retailer: string;
  itemName: string;
  orderTotal: string | null;
  returnDeadline: string;
  confirmUrl: string;
}) {
  const { to, retailer, itemName, orderTotal, returnDeadline, confirmUrl } = opts;
  const html = baseLayout(`
    <h1 style="font-size: 20px; margin: 0 0 16px;">We found a purchase — is this right?</h1>
    <p style="font-size: 15px; line-height: 1.5;">We read the receipt you forwarded and pulled out these details:</p>
    <table style="width: 100%; font-size: 14px; margin: 16px 0; border-collapse: collapse;">
      <tr><td style="padding: 6px 0; color: #777;">Retailer</td><td style="padding: 6px 0; font-weight: 600;">${retailer}</td></tr>
      <tr><td style="padding: 6px 0; color: #777;">Item</td><td style="padding: 6px 0; font-weight: 600;">${itemName}</td></tr>
      ${orderTotal ? `<tr><td style="padding: 6px 0; color: #777;">Order total</td><td style="padding: 6px 0; font-weight: 600;">${orderTotal}</td></tr>` : ""}
      <tr><td style="padding: 6px 0; color: #777;">Estimated return deadline</td><td style="padding: 6px 0; font-weight: 600;">${formatDate(returnDeadline)}</td></tr>
    </table>
    <a href="${confirmUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px;">Review &amp; confirm</a>
    <p style="font-size: 13px; color: #888; margin-top: 20px;">If the deadline looks off, you can edit it on the confirmation page before we set reminders.</p>
  `);
  return sendEmail(to, `Is this right? ${itemName} from ${retailer}`, html);
}

export async function sendReminderEmail(opts: {
  to: string;
  retailer: string;
  itemName: string;
  returnDeadline: string;
  daysLeft: number;
  dashboardUrl: string;
}) {
  const { to, retailer, itemName, returnDeadline, daysLeft, dashboardUrl } = opts;
  const dayWord = daysLeft === 1 ? "1 day" : `${daysLeft} days`;
  const html = baseLayout(`
    <h1 style="font-size: 20px; margin: 0 0 16px;">${dayWord} left to return this</h1>
    <p style="font-size: 15px; line-height: 1.5;">
      Your return window for <strong>${itemName}</strong> from <strong>${retailer}</strong> closes on
      <strong>${formatDate(returnDeadline)}</strong>.
    </p>
    <a href="${dashboardUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px;">View in dashboard</a>
  `);
  return sendEmail(
    to,
    `${dayWord} left: return window for ${itemName} closes soon`,
    html
  );
}

export async function sendDashboardLinkEmail(opts: {
  to: string;
  dashboardUrl: string;
  isNewUser: boolean;
}) {
  const { to, dashboardUrl, isNewUser } = opts;

  const html = isNewUser
    ? baseLayout(`
    <h1 style="font-size: 22px; font-weight: 700; margin: 0 0 20px; line-height: 1.3;">Welcome to Retsy.</h1>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 16px;">
      People lose over <strong>$60 billion</strong> in returnable purchases every year — not because they don't want their money back, but because the return window quietly closes before they remember.
    </p>
    <p style="font-size: 15px; line-height: 1.6; margin: 0 0 24px;">
      Retsy exists to fix that. Forward your receipts, and we'll watch the deadlines so you don't have to.
    </p>
    <div style="background: #f7f4f0; border-radius: 8px; padding: 20px 20px; margin-bottom: 24px;">
      <p style="font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a8a78; margin: 0 0 8px;">Where to forward your receipts</p>
      <p style="font-size: 18px; font-weight: 700; color: #1a1a1a; margin: 0; letter-spacing: 0.01em;">returns@retsy.xyz</p>
      <p style="font-size: 13px; color: #777; margin: 8px 0 0;">Forward any order confirmation email here. We'll read it, extract the details, and email you to confirm before setting reminders.</p>
    </div>
    <a href="${dashboardUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 13px 22px; border-radius: 6px; font-size: 14px; font-weight: 600;">Open your dashboard</a>
    <p style="font-size: 13px; color: #888; margin-top: 20px;">Bookmark that link — it's your personal dashboard and how you'll get back in.</p>
  `)
    : baseLayout(`
    <h1 style="font-size: 20px; margin: 0 0 16px;">Your dashboard link</h1>
    <p style="font-size: 15px; line-height: 1.5;">Here's your Retsy dashboard, where you can see every upcoming return deadline:</p>
    <a href="${dashboardUrl}" style="display: inline-block; background: #1a1a1a; color: #fff; text-decoration: none; padding: 12px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 8px;">Open dashboard</a>
    <p style="font-size: 13px; color: #888; margin-top: 20px;">Bookmark this link — it's how you'll get back in.</p>
  `);

  return sendEmail(
    to,
    isNewUser ? "Welcome to Retsy — here's where to start" : "Your Retsy dashboard link",
    html
  );
}

export async function sendParseFailureEmail(opts: { to: string }) {
  const html = baseLayout(`
    <h1 style="font-size: 20px; margin: 0 0 16px;">We couldn't read that receipt</h1>
    <p style="font-size: 15px; line-height: 1.5;">
      We received your forwarded email but couldn't confidently pull out the purchase details.
      Try forwarding the original order confirmation email directly (not a screenshot or a reply
      chain), and make sure the retailer name, item, and order date are visible in the email body.
    </p>
  `);
  return sendEmail(opts.to, "We couldn't read that receipt", html);
}
