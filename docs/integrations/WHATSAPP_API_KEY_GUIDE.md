# How to get a WhatsApp API key (in plain language)

Written 28 Sept 2026. Meta changes its screens now and then, so treat the button names as a guide and check them against [Meta's official get-started page](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started).

## The idea first

WhatsApp on your phone is for people. To let a **program** (your chatbot) send and receive WhatsApp messages, Meta gives businesses a separate door called the **WhatsApp Business Platform (Cloud API)**. You do not buy a key from JAMANVAAR. **Meta issues it**, for one specific phone number. That number then talks to your chatbot instead of a person holding a phone.

You end up with **three values**. All three are needed:

| Value | What it is | Looks like | Secret? |
| --- | --- | --- | --- |
| **Phone Number ID** | Meta's internal id for the number | `109876543210987` | No |
| **WhatsApp Business Account ID (WABA ID)** | The account that owns the number | `104567890123456` | No |
| **Access token** | The password the program uses | `EAAG…` (long) | **Yes, keep it secret** |

## What you need before starting

1. A **Facebook account** that will manage the business.
2. A **phone number** for the restaurant's WhatsApp ordering that is **not currently used on the normal WhatsApp app** (or a number you are ready to move off it; the two cannot share). It must be able to receive an SMS or a call for a code. A fresh SIM is easiest.
3. Business papers, for later: the restaurant's legal name, address, website or a public page, and a document such as a GST certificate. Meta asks for these to verify the business.

## Steps

### 1. Make a Meta Business account
Go to business.facebook.com and create a business (this is **not** your personal profile). Use the restaurant's real legal name.

### 2. Make a developer app
Go to developers.facebook.com, sign in, choose **Create App**, pick the business type, and add the **WhatsApp** product. Meta creates a **test number** for you, which is good for practising with up to five phone numbers you list.

### 3. Send a first test message
On the app's WhatsApp *API Setup* page you will see the test number's **Phone Number ID** and **WABA ID**, and a **temporary token that lasts only 24 hours**. Use them to send yourself a "hello". This proves the door works. The temporary token is for testing only.

### 4. Add the restaurant's real number
In the same place choose **Add phone number**. Enter the restaurant's number and the **display name** (for example "Sharma Dhaba"), then enter the code Meta sends by SMS or call. Meta reviews the display name; it must match your real business.

### 5. Verify the business
In Business Settings, start **Business verification** and upload the papers. This is what removes the low daily limit and lets you go live for real customers. It is normally the slowest step. Plan for a few working days, and start it on day one.

### 6. Make a token that does not expire
The 24-hour token is no use in production. Instead:
1. In **Business Settings → Users → System users**, add a system user (this is a robot account, not a person).
2. Give it access to your app and to the WhatsApp account, with full control.
3. Choose **Generate token**, pick your app, tick `whatsapp_business_messaging` and `whatsapp_business_management`, and set it to **never expire**.
4. Copy it **once** and store it safely. Meta will not show it again.

### 7. Tell Meta where to send incoming messages (a webhook)
Your chatbot needs a public HTTPS address such as `https://bot.example.com/webhooks/meta`. In the app's WhatsApp *Configuration* page enter that address and a **verify token** (any long random text you invent and also put in the chatbot's settings). Meta calls the address once to check the two match. Then subscribe to the **messages** field. Also note your **App Secret** (App settings → Basic); the chatbot uses it to prove that a message really came from Meta.

### 8. Message templates
A customer who writes to you can be answered freely for **24 hours**. To message someone **after** that (or to start a chat), Meta requires a **pre-approved template**, for example "Your order {{1}} is ready". Write "order confirmed", "order ready" and "refund" templates in the *Message templates* page and submit them. Approval usually takes minutes to a day.

### 9. Add a payment method
Meta charges for some messages. In Business Settings add a payment method to the WhatsApp account, or messages will stop when the free allowance ends. Check Meta's current price list before you quote a price to a restaurant.

## Then, in JAMANVAAR

Once the chatbot service is built as in [WHATSAPP_ORDERING_PLAN_AND_PROMPT.md](WHATSAPP_ORDERING_PLAN_AND_PROMPT.md), the restaurant owner opens **Restaurant Admin → Online ordering → WhatsApp**, pastes the Phone Number ID, WABA ID and token, and presses **Connect**. The system checks them with Meta and shows "Connected to +91 98… ". The token is kept encrypted on the chatbot's server only.

## Keep it safe

- The token is like a bank password for that number. Anyone holding it can send messages as the restaurant.
- Never put it in a browser page, a mobile app, a kiosk, a screenshot, a chat message or a code repository.
- If it leaks, make a new one in System users and revoke the old one. Paste the new one into Restaurant Admin.
- Only give the token to the person who administers the chatbot server. The owner types it once and does not need to keep a copy.

## Two other ways to get a key

- **Through a partner (BSP)** such as Gupshup, Interakt, AiSensy or Twilio. They handle the Meta paperwork and give you their own key and dashboard. Faster to start, and you pay them a monthly or per-message fee on top of Meta's. Your chatbot would call their API instead of Meta's directly, so decide this **before** building the chatbot, because the calls are not identical.
- **"Connect WhatsApp" button (Embedded Signup)**. The restaurant clicks a button, logs in with Facebook, and picks or creates its number. No copying of keys at all. It needs your company to be approved by Meta as a **Tech Provider**. This is the best experience once you have many restaurants; start with the paste method above.

## Quick checklist

- [ ] Meta Business account created with the real business name
- [ ] Developer app with WhatsApp added, test message sent
- [ ] Real number added, display name approved
- [ ] Business verification submitted
- [ ] System-user token that never expires, stored safely
- [ ] Webhook address set, verify token matched, `messages` subscribed
- [ ] App Secret noted for signature checks
- [ ] Templates submitted (confirmed, ready, refund)
- [ ] Payment method added

## Sources

- [Meta for Developers: WhatsApp Cloud API get started](https://developers.facebook.com/documentation/business-messaging/whatsapp/get-started)
- Setup guides consulted: [Omnifox](https://omnifox.io/blog/whatsapp-cloud-api-setup-guide-2026), [Uptonova](https://uptonova.com/blog/whatsapp-business-api-setup-guide-2026), [DripTell](https://driptell.com/blog/step-by-step-connecting-to-whatsapp-business-platform-cloud-api). These are third-party summaries; where they differ from Meta's own page, follow Meta's.
